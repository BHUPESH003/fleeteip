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
  RentalRecord,
  RentalRepositoryPort,
} from "../src/modules/marketplace/rental/domain/ports.js";
import type {
  LogsheetRecord,
  LogsheetRepositoryPort,
  SubmitLogsheetInput,
  UtilizationTotals,
} from "../src/modules/logsheet/domain/ports.js";
import { LogsheetService } from "../src/modules/logsheet/application/logsheet-service.js";
import { ForbiddenError, NotFoundError } from "../src/shared/errors.js";

const OWNER_ROLE_ID = "role-owner";
const RC_ORG_ID = "org-rental-company";
const OTHER_RC_ORG_ID = "org-other-rental-company";
const RENTAL_ID = "rental-1";
const MACHINE_ID = "machine-1";

function fakePermissionService(organizationTypeCode: OrganizationTypeCode = "rental_company") {
  const membershipRepository: MembershipRepositoryPort = {
    findActiveMembership: async (): Promise<ActiveMembershipRecord | undefined> => ({
      id: "membership-1",
      status: "active",
      role_id: OWNER_ROLE_ID,
    }),
    create: async () => {
      throw new Error("not used in this test");
    },
    listWithOrganizationByUserId: async () => [],
  };
  const roleRepository: RoleRepositoryPort = {
    findByName: async (name) => ({ id: OWNER_ROLE_ID, name }),
    hasPermission: async (roleId) => roleId === OWNER_ROLE_ID,
    listPermissionCodesByRoleId: async (roleId) =>
      roleId === OWNER_ROLE_ID ? ["logsheet.manage"] : [],
  };
  return new PermissionService(
    membershipRepository,
    roleRepository,
    fakeOrganizationTypeRepository({ [RC_ORG_ID]: organizationTypeCode }),
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
        created_at: new Date(),
      };
    },
    codeExists: async () => {
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
    updateTerms: async () => {
      throw new Error("not used in this test");
    },
    updateStatus: async () => {
      throw new Error("not used in this test");
    },
    isAvailable: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeLogsheetRepository(): LogsheetRepositoryPort {
  const records = new Map<string, LogsheetRecord>();
  let nextId = 1;
  return {
    submit: async (input: SubmitLogsheetInput) => {
      const key = `${input.rentalId}:${input.logDate}`;
      const existing = [...records.values()].find(
        (r) => r.rental_id === input.rentalId && r.log_date === input.logDate,
      );
      const record: LogsheetRecord = {
        id: existing?.id ?? `logsheet-${nextId++}`,
        rental_id: input.rentalId,
        machine_id: input.machineId,
        log_date: input.logDate,
        shift: input.shift ?? null,
        operating_hours: input.operatingHours ?? null,
        idle_hours: input.idleHours ?? null,
        overtime_hours: input.overtimeHours ?? null,
        operator_name: input.operatorName ?? null,
        fuel_consumed: input.fuelConsumed ?? null,
        fuel_unit: input.fuelUnit ?? null,
        remarks: input.remarks ?? null,
        customer_confirmed: input.customerConfirmed ?? false,
        created_at: existing?.created_at ?? new Date(),
        updated_at: new Date(),
      };
      records.set(key, record);
      return record;
    },
    findByRentalAndDate: async (rentalId, logDate) => records.get(`${rentalId}:${logDate}`),
    listByRental: async (rentalId) => [...records.values()].filter((r) => r.rental_id === rentalId),
    getRentalTotals: async (rentalId): Promise<UtilizationTotals> => {
      const rows = [...records.values()].filter((r) => r.rental_id === rentalId);
      return {
        totalOperatingHours: rows.reduce((s, r) => s + (r.operating_hours ?? 0), 0),
        totalIdleHours: rows.reduce((s, r) => s + (r.idle_hours ?? 0), 0),
        totalOvertimeHours: rows.reduce((s, r) => s + (r.overtime_hours ?? 0), 0),
        loggedDayCount: rows.length,
      };
    },
    getMachineTotals: async (machineId): Promise<UtilizationTotals> => {
      const rows = [...records.values()].filter((r) => r.machine_id === machineId);
      return {
        totalOperatingHours: rows.reduce((s, r) => s + (r.operating_hours ?? 0), 0),
        totalIdleHours: rows.reduce((s, r) => s + (r.idle_hours ?? 0), 0),
        totalOvertimeHours: rows.reduce((s, r) => s + (r.overtime_hours ?? 0), 0),
        loggedDayCount: rows.length,
      };
    },
  };
}

function buildService(rentals: RentalRecord[] = [rental()]) {
  return new LogsheetService(
    fakeLogsheetRepository(),
    fakeRentalRepository(rentals),
    fakePermissionService(),
  );
}

describe("LogsheetService", () => {
  it("rejects logsheet management for a Renter organization", async () => {
    const service = new LogsheetService(
      fakeLogsheetRepository(),
      fakeRentalRepository([rental()]),
      fakePermissionService("renter"),
    );
    await expect(
      service.submitLogsheet("user-1", RC_ORG_ID, RENTAL_ID, { logDate: "2026-03-02" }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("hides a rental belonging to a different organization behind NotFoundError", async () => {
    const service = buildService([rental({ rental_company_organization_id: OTHER_RC_ORG_ID })]);
    await expect(
      service.submitLogsheet("user-1", RC_ORG_ID, RENTAL_ID, { logDate: "2026-03-02" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("submits a logsheet, stamping the machineId from the Rental", async () => {
    const service = buildService();
    const record = await service.submitLogsheet("user-1", RC_ORG_ID, RENTAL_ID, {
      logDate: "2026-03-02",
      operatingHours: 8,
      idleHours: 1,
    });
    expect(record.machineId).toBe(MACHINE_ID);
    expect(record.operatingHours).toBe(8);
  });

  it("upserts on the same date instead of creating a duplicate", async () => {
    const logsheetRepository = fakeLogsheetRepository();
    const service = new LogsheetService(
      logsheetRepository,
      fakeRentalRepository([rental()]),
      fakePermissionService(),
    );
    const first = await service.submitLogsheet("user-1", RC_ORG_ID, RENTAL_ID, {
      logDate: "2026-03-02",
      operatingHours: 8,
    });
    const second = await service.submitLogsheet("user-1", RC_ORG_ID, RENTAL_ID, {
      logDate: "2026-03-02",
      operatingHours: 10,
    });
    expect(second.id).toBe(first.id);
    const all = await logsheetRepository.listByRental(RENTAL_ID);
    expect(all).toHaveLength(1);
    expect(all[0]?.operating_hours).toBe(10);
  });

  it("lists logsheets only for the caller's own organization", async () => {
    const service = buildService();
    await service.submitLogsheet("user-1", RC_ORG_ID, RENTAL_ID, { logDate: "2026-03-02" });
    await service.submitLogsheet("user-1", RC_ORG_ID, RENTAL_ID, { logDate: "2026-03-03" });
    const list = await service.listByRental("user-1", RC_ORG_ID, RENTAL_ID);
    expect(list).toHaveLength(2);
  });
});
