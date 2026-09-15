import { describe, expect, it } from "vitest";
import type { OrganizationTypeCode } from "@fleetip/contracts/organization";
import type { WorkOrderStatus } from "@fleetip/contracts/work-order";
import type {
  ActiveMembershipRecord,
  MembershipRepositoryPort,
  OrganizationRepositoryPort,
} from "../src/modules/organizations/domain/ports.js";
import type { RoleRepositoryPort } from "../src/modules/permissions/domain/ports.js";
import { PermissionService } from "../src/modules/permissions/application/permission-service.js";
import type { MachineRecord, MachineRepositoryPort } from "../src/modules/equipment/domain/ports.js";
import type { ProductRecord, ProductRepositoryPort } from "../src/modules/catalogue/domain/ports.js";
import type { ProjectRecord, ProjectRepositoryPort } from "../src/modules/marketplace/project/domain/ports.js";
import type {
  CreateWorkOrderInput,
  WorkOrderRecord,
  WorkOrderRepositoryPort,
  WorkOrderScopeItemRecord,
  WorkOrderScopeItemRepositoryPort,
} from "../src/modules/marketplace/work-order/domain/ports.js";
import { WorkOrderService } from "../src/modules/marketplace/work-order/application/work-order-service.js";
import { NotificationService } from "../src/modules/notification/application/notification-service.js";
import type { NotificationRepositoryPort } from "../src/modules/notification/domain/ports.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../src/shared/errors.js";

const OWNER_ROLE_ID = "role-owner";
const RC_ORG_ID = "org-rental-company";
const OTHER_RC_ORG_ID = "org-other-rental-company";
const RENTER_ORG_ID = "org-renter";
const MACHINE_ID = "machine-1";
const PROJECT_ID = "project-1";

function fakePermissionService(): PermissionService {
  const membershipRepository: MembershipRepositoryPort = {
    updateRole: async () => {
      throw new Error("not used in this test");
    },
    findActiveMembership: async (): Promise<ActiveMembershipRecord | undefined> => ({
      id: "membership-1",
      status: "active",
      role_id: OWNER_ROLE_ID,
    }),
    create: async () => {
      throw new Error("not used in this test");
    },
    listWithOrganizationByUserId: async () => [],
    listByOrganization: async () => {
      throw new Error("not used in this test");
    },
  };
  const roleRepository: RoleRepositoryPort = {
    findByName: async (name) => ({ id: OWNER_ROLE_ID, name, organization_id: null }),
    findById: async () => {
      throw new Error("not used in this test");
    },
    listForOrganization: async () => {
      throw new Error("not used in this test");
    },
    create: async () => {
      throw new Error("not used in this test");
    },
    update: async () => {
      throw new Error("not used in this test");
    },
    delete: async () => {
      throw new Error("not used in this test");
    },
    hasPermission: async (roleId) => roleId === OWNER_ROLE_ID,
    listPermissionCodesByRoleId: async () => ["rental.manage", "rental.respond"],
  };
  const organizationRepository: OrganizationRepositoryPort = fakeOrganizationTypeRepository({
    [RC_ORG_ID]: "rental_company",
    [OTHER_RC_ORG_ID]: "rental_company",
    [RENTER_ORG_ID]: "renter",
  });
  return new PermissionService(membershipRepository, roleRepository, organizationRepository);
}

function fakeOrganizationTypeRepository(
  organizationTypes: Record<string, OrganizationTypeCode>,
): OrganizationRepositoryPort {
  return {
    findTypeByCode: async () => {
      throw new Error("not used in this test");
    },
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async (id) =>
      organizationTypes[id]
        ? {
            id,
            organization_type_id: `type-${organizationTypes[id]}`,
            name: `Org ${id}`,
            code: "ORG",
            status: "active",
            created_at: new Date(),
          }
        : undefined,
    findWithTypeById: async (id) => {
      const organizationTypeCode = organizationTypes[id];
      if (!organizationTypeCode) return undefined;
      return {
        id,
        organization_type_id: `type-${organizationTypeCode}`,
        organization_type_code: organizationTypeCode,
        name: `Org ${id}`,
        code: "ORG",
        status: "active",
        created_at: new Date(),
      };
    },
    listAllForPlatformAdmin: async () => {
      throw new Error("not used in this test");
    },
    updateStatus: async () => {
      throw new Error("not used in this test");
    },
    codeExists: async () => {
      throw new Error("not used in this test");
    },
    listByType: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeMachineRepository(): MachineRepositoryPort {
  const machine: MachineRecord = {
    id: MACHINE_ID,
    organization_id: RC_ORG_ID,
    asset_code: "EXC-01",
    chassis_number: null,
    product_id: "product-1",
    registration_number: "REG-1",
    year_of_manufacture: 2021,
    status: "active",
    created_at: new Date(),
  };
  return {
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async (id) => (id === MACHINE_ID ? machine : undefined),
    listByOrganization: async () => {
      throw new Error("not used in this test");
    },
    updateStatus: async () => {
      throw new Error("not used in this test");
    },
    updateDetails: async () => {
      throw new Error("not used in this test");
    },
    assetCodeExists: async () => {
      throw new Error("not used in this test");
    },
    search: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeProductRepository(): ProductRepositoryPort {
  const product: ProductRecord = {
    id: "product-1",
    product_subcategory_id: "subcategory-1",
    manufacturer: "Caterpillar",
    name: "320",
    capacity: 20,
    capacity_unit: "Ton",
    specifications: null,
    created_at: new Date(),
  };
  return {
    listAll: async () => [product],
    findById: async (id) => (id === product.id ? product : undefined),
    create: async () => {
      throw new Error("not used in this test");
    },
    update: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeProjectRepository(): ProjectRepositoryPort {
  const project: ProjectRecord = {
    id: PROJECT_ID,
    renter_organization_id: RENTER_ORG_ID,
    project_code: "PRJ-2026-1",
    project_type: "Bridge and Metro",
    project_name: "Metro Bridge Foundation",
    site_location: "Jaipur",
    state: null,
    district: null,
    start_date: "2026-01-01",
    end_date: null,
    status: "active",
    created_at: new Date(),
    updated_at: new Date(),
  };
  return {
    nextReferenceNumber: async () => {
      throw new Error("not used in this test");
    },
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async (id) => (id === PROJECT_ID ? project : undefined),
    listByRenter: async () => {
      throw new Error("not used in this test");
    },
    updateStatus: async () => {
      throw new Error("not used in this test");
    },
    updateFields: async () => {
      throw new Error("not used in this test");
    },
    search: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeWorkOrderRepository(): WorkOrderRepositoryPort {
  const workOrders = new Map<string, WorkOrderRecord>();
  let nextId = 1;
  let sequence = 1;
  return {
    nextReferenceNumber: async () => `WO-2026-${sequence++}`,
    create: async (input: CreateWorkOrderInput) => {
      const record: WorkOrderRecord = {
        id: `work-order-${nextId++}`,
        reference_number: input.referenceNumber,
        quotation_id: input.quotationId,
        rental_id: input.rentalId,
        rental_company_organization_id: input.rentalCompanyOrganizationId,
        renter_organization_id: input.renterOrganizationId ?? null,
        client_snapshot: input.clientSnapshot ?? null,
        project_id: input.projectId ?? null,
        machine_id: input.machineId,
        start_date: input.startDate,
        end_date: input.endDate ?? null,
        rate: input.rate,
        rate_unit: input.rateUnit,
        mobilization_charge: input.mobilizationCharge ?? null,
        demobilization_charge: input.demobilizationCharge ?? null,
        overtime_rate: input.overtimeRate ?? null,
        payment_terms: input.paymentTerms ?? null,
        shift_structure: input.shiftStructure ?? null,
        sunday_condition: input.sundayCondition ?? null,
        fuel_norms: input.fuelNorms ?? null,
        fuel_scope: input.fuelScope ?? null,
        dehire_terms: input.dehireTerms ?? null,
        operator_scope: input.operatorScope ?? null,
        accommodation_scope: input.accommodationScope ?? null,
        working_hours: input.workingHours ?? null,
        working_days_per_week: input.workingDaysPerWeek ?? null,
        minimum_rental_period_value: input.minimumRentalPeriodValue ?? null,
        minimum_rental_period_unit: input.minimumRentalPeriodUnit ?? null,
        gst_terms: input.gstTerms ?? null,
        notice_period_days: input.noticePeriodDays ?? null,
        commercial_notes: input.commercialNotes ?? null,
        company_terms: input.companyTerms ?? null,
        status: "issued",
        created_at: new Date(),
        updated_at: new Date(),
      };
      workOrders.set(record.id, record);
      return record;
    },
    findById: async (id) => workOrders.get(id),
    findByRentalId: async (rentalId) =>
      [...workOrders.values()].find((w) => w.rental_id === rentalId),
    findByQuotationId: async (quotationId) =>
      [...workOrders.values()].find((w) => w.quotation_id === quotationId),
    listByRentalCompany: async (rentalCompanyOrganizationId) =>
      [...workOrders.values()].filter(
        (w) => w.rental_company_organization_id === rentalCompanyOrganizationId,
      ),
    listByRenter: async (renterOrganizationId) =>
      [...workOrders.values()].filter((w) => w.renter_organization_id === renterOrganizationId),
    updateStatus: async (id: string, status: WorkOrderStatus) => {
      const existing = workOrders.get(id);
      if (!existing) throw new Error("not found");
      const updated = { ...existing, status, updated_at: new Date() };
      workOrders.set(id, updated);
      return updated;
    },
  };
}

function fakeScopeItemRepository(): WorkOrderScopeItemRepositoryPort {
  const items = new Map<string, WorkOrderScopeItemRecord[]>();
  let nextId = 1;
  return {
    create: async (input) => {
      const record: WorkOrderScopeItemRecord = {
        id: `scope-item-${nextId++}`,
        work_order_id: input.workOrderId,
        item: input.item,
        responsible_party: input.responsibleParty,
        notes: input.notes ?? null,
        created_at: new Date(),
      };
      items.set(input.workOrderId, [...(items.get(input.workOrderId) ?? []), record]);
      return record;
    },
    listByWorkOrder: async (workOrderId) => items.get(workOrderId) ?? [],
  };
}

// Every caller swallows notification failures (best-effort side effect), so
// a throwing fake is sufficient — this file isn't testing notification
// behavior itself.
function fakeNotificationService(): NotificationService {
  const throwingRepo: NotificationRepositoryPort = {
    create: async () => {
      throw new Error("not used in this test");
    },
    listByOrganization: async () => {
      throw new Error("not used in this test");
    },
    countUnread: async () => {
      throw new Error("not used in this test");
    },
    markRead: async () => {
      throw new Error("not used in this test");
    },
    markAllRead: async () => {
      throw new Error("not used in this test");
    },
  };
  return new NotificationService(throwingRepo, fakePermissionService());
}

function buildService() {
  return new WorkOrderService(
    fakeWorkOrderRepository(),
    fakeScopeItemRepository(),
    fakeMachineRepository(),
    fakeProductRepository(),
    fakeProjectRepository(),
    fakeOrganizationTypeRepository({
      [RC_ORG_ID]: "rental_company",
      [OTHER_RC_ORG_ID]: "rental_company",
      [RENTER_ORG_ID]: "renter",
    }),
    fakePermissionService(),
    fakeNotificationService(),
  );
}

const baseInput = {
  quotationId: "quotation-1",
  rentalId: "rental-1",
  rentalCompanyOrganizationId: RC_ORG_ID,
  renterOrganizationId: RENTER_ORG_ID,
  projectId: PROJECT_ID,
  machineId: MACHINE_ID,
  startDate: "2026-03-01",
  rate: 6500,
  rateUnit: "day" as const,
};

describe("WorkOrderService", () => {
  it("creates a work order snapshot with a generated reference number and copies scope items", async () => {
    const service = buildService();
    const workOrder = await service.createFromAward(baseInput, [
      { item: "Ground preparation", responsibleParty: "client", notes: null },
    ]);
    expect(workOrder.status).toBe("issued");
    expect(workOrder.referenceNumber).toMatch(/^WO-\d{4}-\d+$/);

    const items = await service.listScopeItems("user-1", RC_ORG_ID, workOrder.id);
    expect(items).toHaveLength(1);
    expect(items[0]?.item).toBe("Ground preparation");
  });

  it("lets the Rental Company read its own work order with resolved machine/product info withheld", async () => {
    const service = buildService();
    const workOrder = await service.createFromAward(baseInput, []);
    const loaded = await service.getWorkOrder("user-1", RC_ORG_ID, workOrder.id);
    expect(loaded.machineAssetCode).toBeNull();
  });

  it("resolves machine/product/project display info for the Renter party", async () => {
    const service = buildService();
    const workOrder = await service.createFromAward(baseInput, []);
    const loaded = await service.getWorkOrder("user-2", RENTER_ORG_ID, workOrder.id);
    expect(loaded.machineAssetCode).toBe("EXC-01");
    expect(loaded.productName).toBe("Caterpillar 320");
    expect(loaded.projectCode).toBe("PRJ-2026-1");
  });

  it("resolves full machine/product/project display info for the printable document, for either party", async () => {
    const service = buildService();
    const workOrder = await service.createFromAward(baseInput, []);
    const printedForRentalCompany = await service.getPrintableWorkOrder("user-1", RC_ORG_ID, workOrder.id);
    expect(printedForRentalCompany.workOrder.machineAssetCode).toBe("EXC-01");
    expect(printedForRentalCompany.rentalCompanyName).toContain("Org");
    expect(printedForRentalCompany.customerName).toContain("Org");

    const printedForRenter = await service.getPrintableWorkOrder("user-2", RENTER_ORG_ID, workOrder.id);
    expect(printedForRenter.workOrder.machineAssetCode).toBe("EXC-01");
  });

  it("finds a work order by its source quotation id, for either party", async () => {
    const service = buildService();
    const workOrder = await service.createFromAward(baseInput, []);
    const found = await service.getWorkOrderByQuotationId("user-1", RC_ORG_ID, baseInput.quotationId);
    expect(found?.id).toBe(workOrder.id);
  });

  it("returns null (not an error) when a quotation has no work order yet", async () => {
    const service = buildService();
    const found = await service.getWorkOrderByQuotationId("user-1", RC_ORG_ID, "unknown-quotation");
    expect(found).toBeNull();
  });

  it("hides a work order from an organization that isn't a party to it", async () => {
    const service = buildService();
    const workOrder = await service.createFromAward(baseInput, []);
    await expect(
      service.getWorkOrder("user-3", OTHER_RC_ORG_ID, workOrder.id),
    ).rejects.toThrow(NotFoundError);
  });

  it("lists work orders on the correct side depending on the caller's permission", async () => {
    const service = buildService();
    await service.createFromAward(baseInput, []);
    const rentalCompanyList = await service.listWorkOrders("user-1", RC_ORG_ID);
    expect(rentalCompanyList).toHaveLength(1);
    const renterList = await service.listWorkOrders("user-2", RENTER_ORG_ID);
    expect(renterList).toHaveLength(1);
  });

  it("allows the Rental Company to complete an issued work order", async () => {
    const service = buildService();
    const workOrder = await service.createFromAward(baseInput, []);
    const completed = await service.updateWorkOrderStatus("user-1", RC_ORG_ID, workOrder.id, "completed");
    expect(completed.status).toBe("completed");
  });

  it("rejects a status transition once the work order is already terminal", async () => {
    const service = buildService();
    const workOrder = await service.createFromAward(baseInput, []);
    await service.updateWorkOrderStatus("user-1", RC_ORG_ID, workOrder.id, "cancelled");
    await expect(
      service.updateWorkOrderStatus("user-1", RC_ORG_ID, workOrder.id, "completed"),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects a status change from a different rental company organization", async () => {
    const service = buildService();
    const workOrder = await service.createFromAward(baseInput, []);
    await expect(
      service.updateWorkOrderStatus("user-3", OTHER_RC_ORG_ID, workOrder.id, "completed"),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects a Renter attempting to change work order status (read-only side)", async () => {
    const service = buildService();
    const workOrder = await service.createFromAward(baseInput, []);
    await expect(
      service.updateWorkOrderStatus("user-2", RENTER_ORG_ID, workOrder.id, "completed"),
    ).rejects.toThrow(ForbiddenError);
  });
});
