import type { WorkOrder, WorkOrderScopeItem, WorkOrderStatus } from "@fleetip/contracts/work-order";
import { ForbiddenError, ConflictError, NotFoundError } from "../../../../shared/errors.js";
import type { MachineRepositoryPort } from "../../../equipment/domain/ports.js";
import type { ProductRepositoryPort } from "../../../catalogue/domain/ports.js";
import type { OrganizationRepositoryPort } from "../../../organizations/domain/ports.js";
import type { ProjectRepositoryPort } from "../../project/domain/ports.js";
import { PermissionService } from "../../../permissions/application/permission-service.js";
import { NotificationService } from "../../../notification/application/notification-service.js";
import { canTransition } from "../domain/work-order-status.js";
import type {
  CreateWorkOrderInput,
  WorkOrderRecord,
  WorkOrderRepositoryPort,
  WorkOrderScopeItemRecord,
  WorkOrderScopeItemRepositoryPort,
} from "../domain/ports.js";

function toWorkOrder(
  record: WorkOrderRecord,
  extra?: { machineAssetCode?: string | null; productName?: string | null; projectCode?: string | null },
): WorkOrder {
  return {
    id: record.id,
    referenceNumber: record.reference_number,
    quotationId: record.quotation_id,
    rentalId: record.rental_id,
    rentalCompanyOrganizationId: record.rental_company_organization_id,
    renterOrganizationId: record.renter_organization_id,
    clientSnapshot: record.client_snapshot,
    projectId: record.project_id,
    machineId: record.machine_id,
    startDate: record.start_date,
    endDate: record.end_date,
    rate: record.rate,
    rateUnit: record.rate_unit,
    mobilizationCharge: record.mobilization_charge,
    demobilizationCharge: record.demobilization_charge,
    overtimeRate: record.overtime_rate,
    paymentTerms: record.payment_terms,
    shiftStructure: record.shift_structure,
    sundayCondition: record.sunday_condition,
    fuelNorms: record.fuel_norms,
    fuelScope: record.fuel_scope,
    dehireTerms: record.dehire_terms,
    operatorScope: record.operator_scope,
    accommodationScope: record.accommodation_scope,
    workingHours: record.working_hours,
    workingDaysPerWeek: record.working_days_per_week,
    minimumRentalPeriodValue: record.minimum_rental_period_value,
    minimumRentalPeriodUnit: record.minimum_rental_period_unit,
    gstTerms: record.gst_terms,
    noticePeriodDays: record.notice_period_days,
    commercialNotes: record.commercial_notes,
    companyTerms: record.company_terms,
    status: record.status,
    createdAt: new Date(record.created_at).toISOString(),
    updatedAt: new Date(record.updated_at).toISOString(),
    machineAssetCode: extra?.machineAssetCode ?? null,
    productName: extra?.productName ?? null,
    projectCode: extra?.projectCode ?? null,
  };
}

function toScopeItem(record: WorkOrderScopeItemRecord): WorkOrderScopeItem {
  return {
    id: record.id,
    workOrderId: record.work_order_id,
    item: record.item,
    responsibleParty: record.responsible_party,
    notes: record.notes,
    createdAt: new Date(record.created_at).toISOString(),
  };
}

export class WorkOrderService {
  constructor(
    private readonly workOrderRepository: WorkOrderRepositoryPort,
    private readonly scopeItemRepository: WorkOrderScopeItemRepositoryPort,
    private readonly machineRepository: MachineRepositoryPort,
    private readonly productRepository: ProductRepositoryPort,
    private readonly projectRepository: ProjectRepositoryPort,
    private readonly organizationRepository: OrganizationRepositoryPort,
    private readonly permissionService: PermissionService,
    private readonly notificationService: NotificationService,
  ) {}

  // Best-effort side effect — never blocks the real business action. See
  // CommercialQuotationService's identical wrapper for why.
  private async notify(input: Parameters<NotificationService["notify"]>[0]): Promise<void> {
    try {
      await this.notificationService.notify(input);
    } catch {
      // swallow
    }
  }

  // Called internally by CommercialQuotationService.awardQuotation right
  // after the Rental is created — never exposed as a standalone "create"
  // route, so a Work Order can never be entered by hand or diverge from the
  // awarded quotation's actual terms. The caller has already verified
  // quotation.manage; no further permission check happens here.
  async createFromAward(
    input: Omit<CreateWorkOrderInput, "referenceNumber">,
    scopeItems: { item: string; responsibleParty: "client" | "company"; notes: string | null }[],
  ): Promise<WorkOrder> {
    const referenceNumber = await this.workOrderRepository.nextReferenceNumber(
      input.rentalCompanyOrganizationId,
    );
    const record = await this.workOrderRepository.create({ ...input, referenceNumber });
    for (const item of scopeItems) {
      await this.scopeItemRepository.create({
        workOrderId: record.id,
        item: item.item,
        responsibleParty: item.responsibleParty,
        notes: item.notes ?? undefined,
      });
    }
    if (record.renter_organization_id) {
      await this.notify({
        recipientOrganizationId: record.renter_organization_id,
        type: "workorder.issued",
        title: "Work order issued",
        message: `Work order ${record.reference_number} was issued for your awarded quotation.`,
        relatedResourceType: "work_order",
        relatedResourceId: record.id,
      });
    }
    return toWorkOrder(record);
  }

  async getWorkOrder(userId: string, organizationId: string, workOrderId: string): Promise<WorkOrder> {
    await this.requireWorkOrderPermission(userId, organizationId);
    const record = await this.loadAsParty(organizationId, workOrderId);
    if (record.renter_organization_id === organizationId) {
      return toWorkOrder(record, await this.resolveDisplayInfo(record));
    }
    return toWorkOrder(record);
  }

  // A single list endpoint serves both sides — whichever permission the
  // caller's own organization type actually holds decides which query runs.
  // Mirrors CommercialQuotationService.listQuotations.
  async listWorkOrders(userId: string, organizationId: string): Promise<WorkOrder[]> {
    const canManage = await this.permissionService.hasPermission(
      userId,
      organizationId,
      "rental.manage",
    );
    if (canManage) {
      const records = await this.workOrderRepository.listByRentalCompany(organizationId);
      return records.map((record) => toWorkOrder(record));
    }
    const canRespond = await this.permissionService.hasPermission(
      userId,
      organizationId,
      "rental.respond",
    );
    if (canRespond) {
      const records = await this.workOrderRepository.listByRenter(organizationId);
      return Promise.all(
        records.map(async (record) => toWorkOrder(record, await this.resolveDisplayInfo(record))),
      );
    }
    throw new ForbiddenError();
  }

  async updateWorkOrderStatus(
    userId: string,
    rentalCompanyOrganizationId: string,
    workOrderId: string,
    newStatus: WorkOrderStatus,
  ): Promise<WorkOrder> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "rental.manage",
    );
    const existing = await this.workOrderRepository.findById(workOrderId);
    if (!existing || existing.rental_company_organization_id !== rentalCompanyOrganizationId) {
      throw new NotFoundError("Work order not found in this organization");
    }
    if (!canTransition(existing.status, newStatus)) {
      throw new ConflictError(`Cannot transition work order from ${existing.status} to ${newStatus}`);
    }
    const record = await this.workOrderRepository.updateStatus(workOrderId, newStatus);
    return toWorkOrder(record);
  }

  // Lets the quotation detail page link straight to "this quotation's work
  // order" without the frontend needing to know the work order's own id.
  // Returns null (not a 404) when none exists yet — a quotation that hasn't
  // been awarded has no work order, which is a normal state, not an error.
  async getWorkOrderByQuotationId(
    userId: string,
    organizationId: string,
    quotationId: string,
  ): Promise<WorkOrder | null> {
    await this.requireWorkOrderPermission(userId, organizationId);
    const record = await this.workOrderRepository.findByQuotationId(quotationId);
    if (
      !record ||
      (record.rental_company_organization_id !== organizationId &&
        record.renter_organization_id !== organizationId)
    ) {
      return null;
    }
    return toWorkOrder(record);
  }

  async listScopeItems(
    userId: string,
    organizationId: string,
    workOrderId: string,
  ): Promise<WorkOrderScopeItem[]> {
    await this.requireWorkOrderPermission(userId, organizationId);
    await this.loadAsParty(organizationId, workOrderId);
    const records = await this.scopeItemRepository.listByWorkOrder(workOrderId);
    return records.map(toScopeItem);
  }

  // Full document data for the printable view — same authorization as
  // getWorkOrder, resolved once here so the presentation layer doesn't need
  // its own DB access.
  async getPrintableWorkOrder(
    userId: string,
    organizationId: string,
    workOrderId: string,
  ): Promise<{
    workOrder: WorkOrder;
    scopeItems: WorkOrderScopeItem[];
    rentalCompanyName: string;
    customerName: string;
  }> {
    // Unlike the in-app view (which only resolves machine/product/project
    // for the Renter side — the Rental Company already has that data via
    // equipment.manage), the printable document is a formal record read by
    // both parties and always shows the full picture.
    await this.requireWorkOrderPermission(userId, organizationId);
    const record = await this.loadAsParty(organizationId, workOrderId);
    const workOrder = toWorkOrder(record, await this.resolveDisplayInfo(record));
    const scopeItems = await this.listScopeItems(userId, organizationId, workOrderId);
    const rentalCompany = await this.organizationRepository.findById(
      workOrder.rentalCompanyOrganizationId,
    );
    const renter = workOrder.renterOrganizationId
      ? await this.organizationRepository.findById(workOrder.renterOrganizationId)
      : null;
    return {
      workOrder,
      scopeItems,
      rentalCompanyName: rentalCompany?.name ?? "Rental Company",
      customerName: renter?.name ?? workOrder.clientSnapshot?.name ?? "Customer",
    };
  }

  private async requireWorkOrderPermission(userId: string, organizationId: string): Promise<void> {
    const canManage = await this.permissionService.hasPermission(
      userId,
      organizationId,
      "rental.manage",
    );
    if (canManage) return;
    const canRespond = await this.permissionService.hasPermission(
      userId,
      organizationId,
      "rental.respond",
    );
    if (!canRespond) throw new ForbiddenError();
  }

  private async loadAsParty(organizationId: string, workOrderId: string): Promise<WorkOrderRecord> {
    const record = await this.workOrderRepository.findById(workOrderId);
    if (
      !record ||
      (record.rental_company_organization_id !== organizationId &&
        record.renter_organization_id !== organizationId)
    ) {
      throw new NotFoundError("Work order not found");
    }
    return record;
  }

  private async resolveDisplayInfo(
    record: WorkOrderRecord,
  ): Promise<{ machineAssetCode: string | null; productName: string | null; projectCode: string | null }> {
    const machine = await this.machineRepository.findById(record.machine_id);
    const product = machine ? await this.productRepository.findById(machine.product_id) : null;
    const project = record.project_id ? await this.projectRepository.findById(record.project_id) : null;
    return {
      machineAssetCode: machine?.asset_code ?? null,
      productName: product ? `${product.manufacturer} ${product.name}` : null,
      projectCode: project?.project_code ?? null,
    };
  }
}
