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
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../src/shared/errors.js";

const OWNER_ROLE_ID = "role-owner";
const RC_ORG_ID = "org-rental-company";
const OTHER_RC_ORG_ID = "org-other-rental-company";
const RENTER_ORG_ID = "org-renter";
const OTHER_RENTER_ORG_ID = "org-other-renter";
const RENTAL_ID = "rental-1";
const MACHINE_ID = "machine-1";

function fakePermissionService(organizationTypeCode: OrganizationTypeCode = "rental_company") {
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
      [RC_ORG_ID]: organizationTypeCode,
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
    actual_start_date: null,
    actual_end_date: null,
    actual_dates_verification_status: null,
    actual_dates_dispute_reason: null,
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
    setActualDatesVerification: async () => {
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

function fakeLogsheetRepository(rentals: RentalRecord[] = []): LogsheetRepositoryPort {
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
    findById: async (id) => [...records.values()].find((r) => r.id === id),
    findByRentalAndDate: async (rentalId, logDate) => records.get(`${rentalId}:${logDate}`),
    listByRental: async (rentalId) => [...records.values()].filter((r) => r.rental_id === rentalId),
    listByRentalCompanyOrganization: async (rentalCompanyOrganizationId) => {
      const orgRentalIds = new Set(
        rentals
          .filter((r) => r.rental_company_organization_id === rentalCompanyOrganizationId)
          .map((r) => r.id),
      );
      return [...records.values()].filter((r) => orgRentalIds.has(r.rental_id));
    },
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
    fakeLogsheetRepository(rentals),
    fakeRentalRepository(rentals),
    fakeOrganizationTypeRepository({
      [RC_ORG_ID]: "rental_company",
      [RENTER_ORG_ID]: "renter",
      [OTHER_RENTER_ORG_ID]: "renter",
    }),
    fakePermissionService(),
  );
}

describe("LogsheetService", () => {
  it("rejects logsheet management for a Renter organization", async () => {
    const service = new LogsheetService(
      fakeLogsheetRepository(),
      fakeRentalRepository([rental()]),
      fakeOrganizationTypeRepository({ [RC_ORG_ID]: "renter" }),
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

  it("rejects submitting a logsheet while the rental isn't active yet", async () => {
    const service = buildService([rental({ status: "confirmed" })]);
    await expect(
      service.submitLogsheet("user-1", RC_ORG_ID, RENTAL_ID, { logDate: "2026-03-02" }),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects a log date before the rental's own start date", async () => {
    const service = buildService();
    await expect(
      service.submitLogsheet("user-1", RC_ORG_ID, RENTAL_ID, { logDate: "2026-02-28" }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a log date after the rental's own end date", async () => {
    const service = buildService();
    await expect(
      service.submitLogsheet("user-1", RC_ORG_ID, RENTAL_ID, { logDate: "2026-03-11" }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a log date in the future", async () => {
    const service = buildService([rental({ end_date: null })]);
    const future = new Date();
    future.setDate(future.getDate() + 5);
    await expect(
      service.submitLogsheet("user-1", RC_ORG_ID, RENTAL_ID, {
        logDate: future.toISOString().slice(0, 10),
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("upserts on the same date instead of creating a duplicate", async () => {
    const logsheetRepository = fakeLogsheetRepository();
    const service = new LogsheetService(
      logsheetRepository,
      fakeRentalRepository([rental()]),
      fakeOrganizationTypeRepository({ [RC_ORG_ID]: "rental_company" }),
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

  it("lets the Renter counterparty read-only view their own rental's logsheets", async () => {
    const service = buildService([rental({ renter_organization_id: RENTER_ORG_ID })]);
    await service.submitLogsheet("user-1", RC_ORG_ID, RENTAL_ID, { logDate: "2026-03-02" });

    const asRenter = await service.listByRental("user-2", RENTER_ORG_ID, RENTAL_ID);
    expect(asRenter).toHaveLength(1);
  });

  it("hides logsheets for a rental the Renter is not the counterparty on", async () => {
    const service = buildService([rental({ renter_organization_id: RENTER_ORG_ID })]);
    await expect(service.listByRental("user-2", OTHER_RENTER_ORG_ID, RENTAL_ID)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("lists logsheets across the whole organization's fleet on the standalone screen", async () => {
    const secondRental = rental({ id: "rental-2" });
    const service = buildService([rental(), secondRental]);
    await service.submitLogsheet("user-1", RC_ORG_ID, RENTAL_ID, { logDate: "2026-03-02" });
    await service.submitLogsheet("user-1", RC_ORG_ID, "rental-2", { logDate: "2026-03-02" });

    const list = await service.listByOrganization("user-1", RC_ORG_ID);
    expect(list).toHaveLength(2);
  });

  // getLogsheetById: the one lookup path with only the logsheet's own id,
  // no rentalId in hand — the notification/dashboard deep link case.
  describe("getLogsheetById", () => {
    it("lets the owning Rental Company fetch a logsheet by its own id alone", async () => {
      const service = buildService();
      const created = await service.submitLogsheet("user-1", RC_ORG_ID, RENTAL_ID, {
        logDate: "2026-03-02",
      });
      const found = await service.getLogsheetById("user-1", RC_ORG_ID, created.id);
      expect(found.id).toBe(created.id);
      expect(found.rentalId).toBe(RENTAL_ID);
    });

    it("lets the Renter counterparty fetch the same logsheet by its own id alone", async () => {
      const service = buildService([rental({ renter_organization_id: RENTER_ORG_ID })]);
      const created = await service.submitLogsheet("user-1", RC_ORG_ID, RENTAL_ID, {
        logDate: "2026-03-02",
      });
      const found = await service.getLogsheetById("user-2", RENTER_ORG_ID, created.id);
      expect(found.id).toBe(created.id);
    });

    it("hides the logsheet from a Renter that isn't the counterparty on the underlying rental", async () => {
      const service = buildService([rental({ renter_organization_id: RENTER_ORG_ID })]);
      const created = await service.submitLogsheet("user-1", RC_ORG_ID, RENTAL_ID, {
        logDate: "2026-03-02",
      });
      await expect(
        service.getLogsheetById("user-2", OTHER_RENTER_ORG_ID, created.id),
      ).rejects.toThrow(NotFoundError);
    });

    it("rejects an unknown logsheet id", async () => {
      const service = buildService();
      await expect(service.getLogsheetById("user-1", RC_ORG_ID, "unknown-id")).rejects.toThrow(
        NotFoundError,
      );
    });
  });
});
