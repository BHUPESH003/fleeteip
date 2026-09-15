import { describe, expect, it } from "vitest";
import type { OrganizationTypeCode } from "@fleetip/contracts/organization";
import type {
  ActiveMembershipRecord,
  MembershipRepositoryPort,
  OrganizationRepositoryPort,
} from "../src/modules/organizations/domain/ports.js";
import type { RoleRepositoryPort } from "../src/modules/permissions/domain/ports.js";
import { PermissionService } from "../src/modules/permissions/application/permission-service.js";
import type {
  MachineRecord,
  MachineRepositoryPort,
} from "../src/modules/equipment/domain/ports.js";
import type {
  RentalRecord,
  RentalRepositoryPort,
} from "../src/modules/marketplace/rental/domain/ports.js";
import type {
  LogsheetRepositoryPort,
  UtilizationTotals,
} from "../src/modules/logsheet/domain/ports.js";
import { UtilizationService } from "../src/modules/logsheet/application/utilization-service.js";
import { NotFoundError } from "../src/shared/errors.js";

const OWNER_ROLE_ID = "role-owner";
const RC_ORG_ID = "org-rental-company";
const RENTER_ORG_ID = "org-renter";
const OTHER_RENTER_ORG_ID = "org-other-renter";
const RENTAL_ID = "rental-1";
const MACHINE_ID = "machine-1";

function fakePermissionService() {
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
    listPermissionCodesByRoleId: async (roleId) =>
      roleId === OWNER_ROLE_ID ? ["logsheet.manage", "logsheet.respond"] : [],
  };
  return new PermissionService(
    membershipRepository,
    roleRepository,
    fakeOrganizationTypeRepository({
      [RC_ORG_ID]: "rental_company",
      [RENTER_ORG_ID]: "renter",
      [OTHER_RENTER_ORG_ID]: "renter",
    }),
  );
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
    findById: async () => {
      throw new Error("not used in this test");
    },
    findWithTypeById: async (id) => {
      const organizationTypeCode = organizationTypes[id];
      if (!organizationTypeCode) return undefined;
      return {
        id,
        organization_type_id: `type-${organizationTypeCode}`,
        organization_type_code: organizationTypeCode,
        name: "Test Org",
        code: "TESTORG",
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

function rental(overrides: Partial<RentalRecord> = {}): RentalRecord {
  return {
    id: RENTAL_ID,
    rental_company_organization_id: RC_ORG_ID,
    renter_organization_id: null,
    client_snapshot: { name: "Acme" },
    machine_id: MACHINE_ID,
    status: "active",
    project_name: null,
    project_location: null,
    start_date: "2026-03-01",
    end_date: "2026-03-10",
    rate: 5000,
    rate_unit: "day",
    mobilization_charge: null,
    demobilization_charge: null,
    payment_terms: null,
    shift_structure: null,
    overtime_rate: null,
    sunday_condition: null,
    fuel_norms: null,
    operator_scope: null,
    notice_period_days: null,
    dehire_terms: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function fakeRentalRepository(rentals: RentalRecord[]): RentalRepositoryPort {
  return {
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async (id) => rentals.find((r) => r.id === id),
    listByOrganization: async () => {
      throw new Error("not used in this test");
    },
    listByRenterOrganization: async () => {
      throw new Error("not used in this test");
    },
    updateTerms: async () => {
      throw new Error("not used in this test");
    },
    updateStatus: async () => {
      throw new Error("not used in this test");
    },
    isAvailable: async () => {
      throw new Error("not used in this test");
    },
    searchByOrganization: async () => {
      throw new Error("not used in this test");
    },
    searchByRenterOrganization: async () => {
      throw new Error("not used in this test");
    },
  };
}

function machine(overrides: Partial<MachineRecord> = {}): MachineRecord {
  return {
    id: MACHINE_ID,
    organization_id: RC_ORG_ID,
    product_id: "product-1",
    asset_code: "EXC-001",
    chassis_number: null,
    registration_number: "RJ01AB1234",
    year_of_manufacture: null,
    status: "active",
    created_at: new Date(),
    ...overrides,
  };
}

function fakeMachineRepository(machines: MachineRecord[]): MachineRepositoryPort {
  return {
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async (id) => machines.find((m) => m.id === id),
    search: async () => {
      throw new Error("not used in this test");
    },
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
  };
}

function fakeLogsheetRepository(totals: UtilizationTotals): LogsheetRepositoryPort {
  return {
    submit: async () => {
      throw new Error("not used in this test");
    },
    findById: async () => {
      throw new Error("not used in this test");
    },
    findByRentalAndDate: async () => {
      throw new Error("not used in this test");
    },
    listByRental: async () => {
      throw new Error("not used in this test");
    },
    listByRentalCompanyOrganization: async () => {
      throw new Error("not used in this test");
    },
    getRentalTotals: async () => totals,
    getMachineTotals: async () => totals,
  };
}

const totals: UtilizationTotals = {
  totalOperatingHours: 40,
  totalIdleHours: 5,
  totalOvertimeHours: 2,
  loggedDayCount: 5,
};

function fakeOrganizationRepository(): OrganizationRepositoryPort {
  return fakeOrganizationTypeRepository({
    [RC_ORG_ID]: "rental_company",
    [RENTER_ORG_ID]: "renter",
    [OTHER_RENTER_ORG_ID]: "renter",
  });
}

describe("UtilizationService", () => {
  it("computes total rental days from the Rental's own date span", async () => {
    const service = new UtilizationService(
      fakeLogsheetRepository(totals),
      fakeRentalRepository([rental({ start_date: "2026-03-01", end_date: "2026-03-10" })]),
      fakeMachineRepository([machine()]),
      fakeOrganizationRepository(),
      fakePermissionService(),
    );
    const result = await service.getRentalUtilization("user-1", RC_ORG_ID, RENTAL_ID);
    expect(result.totalRentalDays).toBe(10);
    expect(result.totalOperatingHours).toBe(40);
    expect(result.loggedDayCount).toBe(5);
  });

  it("reports 0 rental days, not negative, for an open-ended rental that hasn't started yet", async () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);
    const service = new UtilizationService(
      fakeLogsheetRepository({ totalOperatingHours: 0, totalIdleHours: 0, totalOvertimeHours: 0, loggedDayCount: 0 }),
      fakeRentalRepository([
        rental({ start_date: future.toISOString().slice(0, 10), end_date: null }),
      ]),
      fakeMachineRepository([machine()]),
      fakeOrganizationRepository(),
      fakePermissionService(),
    );
    const result = await service.getRentalUtilization("user-1", RC_ORG_ID, RENTAL_ID);
    expect(result.totalRentalDays).toBe(0);
  });

  it("hides a rental belonging to a different organization behind NotFoundError", async () => {
    const service = new UtilizationService(
      fakeLogsheetRepository(totals),
      fakeRentalRepository([rental({ rental_company_organization_id: "some-other-org" })]),
      fakeMachineRepository([machine()]),
      fakeOrganizationRepository(),
      fakePermissionService(),
    );
    await expect(service.getRentalUtilization("user-1", RC_ORG_ID, RENTAL_ID)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("returns machine-level utilization without a totalRentalDays field", async () => {
    const service = new UtilizationService(
      fakeLogsheetRepository(totals),
      fakeRentalRepository([rental()]),
      fakeMachineRepository([machine()]),
      fakeOrganizationRepository(),
      fakePermissionService(),
    );
    const result = await service.getMachineUtilization("user-1", RC_ORG_ID, MACHINE_ID);
    expect(result.machineId).toBe(MACHINE_ID);
    expect(result.totalOperatingHours).toBe(40);
    expect("totalRentalDays" in result).toBe(false);
  });

  it("lets the Renter counterparty read-only view their own rental's utilization", async () => {
    const service = new UtilizationService(
      fakeLogsheetRepository(totals),
      fakeRentalRepository([rental({ renter_organization_id: RENTER_ORG_ID })]),
      fakeMachineRepository([machine()]),
      fakeOrganizationRepository(),
      fakePermissionService(),
    );
    const result = await service.getRentalUtilization("user-2", RENTER_ORG_ID, RENTAL_ID);
    expect(result.totalOperatingHours).toBe(40);
  });

  it("hides rental utilization for a rental the Renter is not the counterparty on", async () => {
    const service = new UtilizationService(
      fakeLogsheetRepository(totals),
      fakeRentalRepository([rental({ renter_organization_id: RENTER_ORG_ID })]),
      fakeMachineRepository([machine()]),
      fakeOrganizationRepository(),
      fakePermissionService(),
    );
    await expect(
      service.getRentalUtilization("user-2", OTHER_RENTER_ORG_ID, RENTAL_ID),
    ).rejects.toThrow(NotFoundError);
  });
});
