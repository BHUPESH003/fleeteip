import type {
  CheckMachineAvailabilityQuery,
  CreateRentalRequest,
  Rental,
  RentalStatus,
  UpdateRentalTermsRequest,
} from "@fleetip/contracts/rental";
import { ConflictError, NotFoundError, ValidationError } from "../../../../shared/errors.js";
import type { MachineRepositoryPort } from "../../../equipment/domain/ports.js";
import type { MaintenanceRepositoryPort } from "../../../maintenance/domain/ports.js";
import type { OrganizationRepositoryPort } from "../../../organizations/domain/ports.js";
import { PermissionService } from "../../../permissions/application/permission-service.js";
import { NotificationService } from "../../../notification/application/notification-service.js";
import { canTransition } from "../domain/rental-status.js";
import type { RentalRecord, RentalRepositoryPort } from "../domain/ports.js";

function toRental(
  record: RentalRecord,
  extra?: { machineAssetCode?: string | null; rentalCompanyOrganizationName?: string | null },
): Rental {
  return {
    id: record.id,
    rentalCompanyOrganizationId: record.rental_company_organization_id,
    renterOrganizationId: record.renter_organization_id,
    clientSnapshot: record.client_snapshot,
    machineId: record.machine_id,
    status: record.status,
    projectName: record.project_name,
    projectLocation: record.project_location,
    // start_date/end_date already come back as plain "YYYY-MM-DD" strings
    // (see the DATE type parser in infrastructure/database/client.ts) — no
    // Date conversion here, that would reintroduce the timezone bug it fixed.
    startDate: record.start_date,
    endDate: record.end_date,
    rate: record.rate,
    rateUnit: record.rate_unit,
    mobilizationCharge: record.mobilization_charge,
    demobilizationCharge: record.demobilization_charge,
    paymentTerms: record.payment_terms,
    shiftStructure: record.shift_structure,
    overtimeRate: record.overtime_rate,
    sundayCondition: record.sunday_condition,
    fuelNorms: record.fuel_norms,
    operatorScope: record.operator_scope,
    noticePeriodDays: record.notice_period_days,
    dehireTerms: record.dehire_terms,
    createdAt: new Date(record.created_at).toISOString(),
    updatedAt: new Date(record.updated_at).toISOString(),
    machineAssetCode: extra?.machineAssetCode ?? null,
    rentalCompanyOrganizationName: extra?.rentalCompanyOrganizationName ?? null,
  };
}

export class RentalService {
  constructor(
    private readonly rentalRepository: RentalRepositoryPort,
    private readonly machineRepository: MachineRepositoryPort,
    private readonly organizationRepository: OrganizationRepositoryPort,
    private readonly permissionService: PermissionService,
    private readonly maintenanceRepository: MaintenanceRepositoryPort,
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

  async createRental(
    userId: string,
    rentalCompanyOrganizationId: string,
    input: CreateRentalRequest,
  ): Promise<Rental> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "rental.manage",
    );

    const machine = await this.machineRepository.findById(input.machineId);
    if (!machine) {
      throw new NotFoundError("Machine not found");
    }
    if (machine.organization_id !== rentalCompanyOrganizationId) {
      throw new NotFoundError("Machine not found in this organization");
    }
    if (machine.status === "retired") {
      throw new ConflictError("Machine is retired and cannot be rented");
    }

    // Exactly-one-of-party is already enforced by createRentalRequestSchema's
    // refine — this is a different check: the referenced organization must
    // actually be a Renter, not the acting organization's own type (that's
    // already covered by requirePermission above via PERMISSION_ORGANIZATION_TYPES).
    if (input.renterOrganizationId) {
      const renterOrganization = await this.organizationRepository.findWithTypeById(
        input.renterOrganizationId,
      );
      if (!renterOrganization || renterOrganization.organization_type_code !== "renter") {
        throw new ValidationError("renterOrganizationId must reference a Renter organization");
      }
    }

    const available = await this.rentalRepository.isAvailable(
      input.machineId,
      input.startDate,
      input.endDate ?? null,
    );
    if (!available) {
      throw new ConflictError("Machine is not available for the requested period");
    }
    const hasConflictingMaintenance = await this.maintenanceRepository.hasOverlappingMaintenance(
      input.machineId,
      input.startDate,
      input.endDate ?? null,
    );
    if (hasConflictingMaintenance) {
      throw new ConflictError("Machine is scheduled for maintenance during this period");
    }

    const record = await this.rentalRepository.create({
      rentalCompanyOrganizationId,
      renterOrganizationId: input.renterOrganizationId,
      clientSnapshot: input.clientSnapshot,
      machineId: input.machineId,
      status: "confirmed",
      projectName: input.projectName,
      projectLocation: input.projectLocation,
      startDate: input.startDate,
      endDate: input.endDate,
      rate: input.rate,
      rateUnit: input.rateUnit,
      mobilizationCharge: input.mobilizationCharge,
      demobilizationCharge: input.demobilizationCharge,
      paymentTerms: input.paymentTerms,
      shiftStructure: input.shiftStructure,
      overtimeRate: input.overtimeRate,
      sundayCondition: input.sundayCondition,
      fuelNorms: input.fuelNorms,
      operatorScope: input.operatorScope,
      noticePeriodDays: input.noticePeriodDays,
      dehireTerms: input.dehireTerms,
    });
    return toRental(record);
  }

  // Single-rental lookup — mirrors listRentals' organization-type branch,
  // which this was missing entirely (a Renter has no rental.manage on any
  // organization, rental_company-only per PERMISSION_ORGANIZATION_TYPES, so
  // this always 404'd for a Renter regardless of role/permissions — not a
  // custom-role edge case, every Renter viewing a Transport/Logsheet detail
  // page for their own rental hit this).
  async getRental(userId: string, organizationId: string, rentalId: string): Promise<Rental> {
    const organization = await this.organizationRepository.findWithTypeById(organizationId);
    if (organization?.organization_type_code === "renter") {
      await this.permissionService.requirePermission(userId, organizationId, "rental.respond");
      const record = await this.rentalRepository.findById(rentalId);
      if (!record || record.renter_organization_id !== organizationId) {
        throw new NotFoundError("Rental not found in this organization");
      }
      const [machine, rentalCompany] = await Promise.all([
        this.machineRepository.findById(record.machine_id),
        this.organizationRepository.findById(record.rental_company_organization_id),
      ]);
      return toRental(record, {
        machineAssetCode: machine?.asset_code ?? null,
        rentalCompanyOrganizationName: rentalCompany?.name ?? null,
      });
    }

    await this.permissionService.requirePermission(userId, organizationId, "rental.manage");
    const record = await this.rentalRepository.findById(rentalId);
    if (!record || record.rental_company_organization_id !== organizationId) {
      throw new NotFoundError("Rental not found in this organization");
    }
    return toRental(record);
  }

  async listRentals(userId: string, organizationId: string): Promise<Rental[]> {
    const organization = await this.organizationRepository.findWithTypeById(organizationId);
    if (organization?.organization_type_code === "renter") {
      // A Renter has no equipment.manage/rental.manage permission on the
      // Rental Company's org, so it can never resolve the machine/company
      // itself the way the Rental Company's own list page does — resolve it
      // here instead (same "look up server-side, don't grant the underlying
      // permission" shape as auction bids' rentalCompanyOrganizationName).
      await this.permissionService.requirePermission(userId, organizationId, "rental.respond");
      const records = await this.rentalRepository.listByRenterOrganization(organizationId);
      return Promise.all(
        records.map(async (record) => {
          const [machine, rentalCompany] = await Promise.all([
            this.machineRepository.findById(record.machine_id),
            this.organizationRepository.findById(record.rental_company_organization_id),
          ]);
          return toRental(record, {
            machineAssetCode: machine?.asset_code ?? null,
            rentalCompanyOrganizationName: rentalCompany?.name ?? null,
          });
        }),
      );
    }

    await this.permissionService.requirePermission(userId, organizationId, "rental.manage");
    const records = await this.rentalRepository.listByOrganization(organizationId);
    return records.map((record) => toRental(record));
  }

  async updateRentalTerms(
    userId: string,
    rentalCompanyOrganizationId: string,
    rentalId: string,
    updates: UpdateRentalTermsRequest,
  ): Promise<Rental> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "rental.manage",
    );
    const existing = await this.rentalRepository.findById(rentalId);
    if (!existing) {
      throw new NotFoundError("Rental not found");
    }
    if (existing.rental_company_organization_id !== rentalCompanyOrganizationId) {
      throw new NotFoundError("Rental not found in this organization");
    }
    if (existing.status !== "confirmed") {
      throw new ConflictError("Terms can only be edited while the rental is confirmed");
    }

    const record = await this.rentalRepository.updateTerms(rentalId, updates);
    return toRental(record);
  }

  async updateRentalStatus(
    userId: string,
    rentalCompanyOrganizationId: string,
    rentalId: string,
    newStatus: RentalStatus,
  ): Promise<Rental> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "rental.manage",
    );
    const existing = await this.rentalRepository.findById(rentalId);
    if (!existing) {
      throw new NotFoundError("Rental not found");
    }
    if (existing.rental_company_organization_id !== rentalCompanyOrganizationId) {
      throw new NotFoundError("Rental not found in this organization");
    }
    if (!canTransition(existing.status, newStatus)) {
      throw new ConflictError(`Cannot transition rental from ${existing.status} to ${newStatus}`);
    }
    if (newStatus === "active") {
      const machine = await this.machineRepository.findById(existing.machine_id);
      if (!machine || machine.status === "retired") {
        throw new ConflictError("Machine is retired and cannot be activated");
      }
      const hasConflictingMaintenance = await this.maintenanceRepository.hasOverlappingMaintenance(
        existing.machine_id,
        existing.start_date,
        existing.end_date,
      );
      if (hasConflictingMaintenance) {
        throw new ConflictError("Machine is scheduled for maintenance and cannot be activated");
      }
    }

    const record = await this.rentalRepository.updateStatus(rentalId, newStatus);
    if (record.renter_organization_id && (newStatus === "active" || newStatus === "completed")) {
      await this.notify({
        recipientOrganizationId: record.renter_organization_id,
        type: newStatus === "active" ? "rental.active" : "rental.completed",
        title: newStatus === "active" ? "Rental is now active" : "Rental completed",
        message:
          newStatus === "active"
            ? "Your rental has become active."
            : "Your rental has been marked completed.",
        relatedResourceType: "rental",
        relatedResourceId: record.id,
      });
    }
    return toRental(record);
  }

  async checkAvailability(
    userId: string,
    rentalCompanyOrganizationId: string,
    query: CheckMachineAvailabilityQuery,
  ): Promise<boolean> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "rental.manage",
    );
    const machine = await this.machineRepository.findById(query.machineId);
    if (!machine || machine.organization_id !== rentalCompanyOrganizationId) {
      throw new NotFoundError("Machine not found in this organization");
    }
    return this.rentalRepository.isAvailable(
      query.machineId,
      query.startDate,
      query.endDate ?? null,
    );
  }
}
