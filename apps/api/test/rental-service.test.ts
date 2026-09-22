import { describe, expect, it } from "vitest";
import { todayIsoDate } from "@fleetip/contracts/shared";
import type { OrganizationTypeCode } from "@fleetip/contracts/organization";
import type {
  ActiveMembershipRecord,
  MembershipRepositoryPort,
  OrganizationRepositoryPort,
} from "../src/modules/organizations/domain/ports.js";
import type { RoleRepositoryPort } from "../src/modules/permissions/domain/ports.js";
import { PermissionService } from "../src/modules/permissions/application/permission-service.js";
import { NotificationService } from "../src/modules/notification/application/notification-service.js";
import type { NotificationRepositoryPort } from "../src/modules/notification/domain/ports.js";
import type {
  MachineRecord,
  MachineRepositoryPort,
} from "../src/modules/equipment/domain/ports.js";
import type { MaintenanceRepositoryPort } from "../src/modules/maintenance/domain/ports.js";
import type {
  CreateRentalInput,
  RentalRecord,
  RentalRepositoryPort,
  UpdateRentalTermsInput,
} from "../src/modules/marketplace/rental/domain/ports.js";
import { RentalService } from "../src/modules/marketplace/rental/application/rental-service.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../src/shared/errors.js";

const OWNER_ROLE_ID = "role-owner";
const RC_ORG_ID = "org-rental-company";
// A second, distinct Rental Company — real and permission-granted in its own
// right, used only to prove RentalService's own ownership check (not
// PermissionService rejecting an unrecognized org) is what hides another
// organization's rental behind NotFoundError.
const OTHER_RC_ORG_ID = "org-other-rental-company";
const RENTER_ORG_ID = "org-renter";
const OTHER_RENTER_ORG_ID = "org-other-renter";
const MACHINE_ID = "machine-1";
const RETIRED_MACHINE_ID = "machine-retired";

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
      roleId === OWNER_ROLE_ID ? ["rental.manage"] : [],
  };
  return new PermissionService(
    membershipRepository,
    roleRepository,
    fakeOrganizationTypeRepository({
      [RC_ORG_ID]: organizationTypeCode,
      [OTHER_RC_ORG_ID]: "rental_company",
      [RENTER_ORG_ID]: "renter",
      [OTHER_RENTER_ORG_ID]: "renter",
    }),
  );
}

// A single-purpose lookup fake shared by both PermissionService (checking
// the acting organization's type) and RentalService (checking a referenced
// renterOrganizationId's type) — the two are independent dependencies in
// real wiring, but a test only needs one lookup table backing both.
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
    findById: async (id) => {
      const organizationTypeCode = organizationTypes[id];
      if (!organizationTypeCode) return undefined;
      return {
        id,
        organization_type_id: `type-${organizationTypeCode}`,
        name: "Test Org",
        code: "TESTORG",
        status: "active",
        created_at: new Date(),
      };
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

function fakeMachineRepository(machines: MachineRecord[]): MachineRepositoryPort {
  return {
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async (id) => machines.find((machine) => machine.id === id),
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

// A real overlap check over the inclusive [start, end] convention (§9),
// mirroring what the Postgres exclusion constraint/isAvailable query does —
// close enough to exercise RentalService's own logic without a real DB.
function overlaps(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null,
): boolean {
  const aEndBound = aEnd ?? "9999-12-31";
  const bEndBound = bEnd ?? "9999-12-31";
  return aStart <= bEndBound && bStart <= aEndBound;
}

function fakeRentalRepository(): RentalRepositoryPort {
  const rentals = new Map<string, RentalRecord>();
  let nextId = 1;

  return {
    create: async (input: CreateRentalInput) => {
      const record: RentalRecord = {
        id: `rental-${nextId++}`,
        rental_company_organization_id: input.rentalCompanyOrganizationId,
        renter_organization_id: input.renterOrganizationId ?? null,
        client_snapshot: input.clientSnapshot ?? null,
        machine_id: input.machineId,
        status: input.status,
        project_name: input.projectName ?? null,
        project_location: input.projectLocation ?? null,
        start_date: input.startDate,
        end_date: input.endDate ?? null,
        rate: input.rate,
        rate_unit: input.rateUnit,
        mobilization_charge: input.mobilizationCharge ?? null,
        demobilization_charge: input.demobilizationCharge ?? null,
        payment_terms: input.paymentTerms ?? null,
        shift_structure: input.shiftStructure ?? null,
        overtime_rate: input.overtimeRate ?? null,
        sunday_condition: input.sundayCondition ?? null,
        fuel_norms: input.fuelNorms ?? null,
        operator_scope: input.operatorScope ?? null,
        notice_period_days: input.noticePeriodDays ?? null,
        dehire_terms: input.dehireTerms ?? null,
        actual_start_date: null,
        actual_end_date: null,
        actual_dates_verification_status: null,
        actual_dates_dispute_reason: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      rentals.set(record.id, record);
      return record;
    },
    findById: async (id) => rentals.get(id),
    listByOrganization: async (organizationId) =>
      [...rentals.values()].filter((r) => r.rental_company_organization_id === organizationId),
    listByRenterOrganization: async (renterOrganizationId) =>
      [...rentals.values()].filter((r) => r.renter_organization_id === renterOrganizationId),
    updateTerms: async (id: string, updates: UpdateRentalTermsInput) => {
      const existing = rentals.get(id);
      if (!existing) throw new Error("not used in this test");
      const updated: RentalRecord = {
        ...existing,
        ...(updates.rate !== undefined && { rate: updates.rate }),
        ...(updates.rateUnit !== undefined && { rate_unit: updates.rateUnit }),
        ...(updates.projectName !== undefined && { project_name: updates.projectName }),
        updated_at: new Date(),
      };
      rentals.set(id, updated);
      return updated;
    },
    updateStatus: async (id, status, actualDate) => {
      const existing = rentals.get(id);
      if (!existing) throw new Error("not used in this test");
      const updated = {
        ...existing,
        status,
        ...(status === "active" && actualDate !== undefined
          ? { actual_start_date: actualDate, actual_dates_verification_status: "pending" as const }
          : {}),
        ...(status === "off_rent" && actualDate !== undefined
          ? { actual_end_date: actualDate, actual_dates_verification_status: "pending" as const }
          : {}),
        updated_at: new Date(),
      };
      rentals.set(id, updated);
      return updated;
    },
    setActualDatesVerification: async (id, status, disputeReason) => {
      const existing = rentals.get(id);
      if (!existing) throw new Error("not used in this test");
      const updated = {
        ...existing,
        actual_dates_verification_status: status,
        actual_dates_dispute_reason: status === "disputed" ? (disputeReason ?? null) : null,
        updated_at: new Date(),
      };
      rentals.set(id, updated);
      return updated;
    },
    isAvailable: async (machineId, startDate, endDate) => {
      const committed = [...rentals.values()].filter(
        (r) => r.machine_id === machineId && ["confirmed", "active", "off_rent"].includes(r.status),
      );
      return !committed.some((r) => overlaps(startDate, endDate, r.start_date, r.end_date));
    },
    searchByOrganization: async () => {
      throw new Error("not used in this test");
    },
    searchByRenterOrganization: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeMaintenanceRepository(hasConflict = false): MaintenanceRepositoryPort {
  return {
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async () => {
      throw new Error("not used in this test");
    },
    listByMachine: async () => {
      throw new Error("not used in this test");
    },
    listByOrganization: async () => {
      throw new Error("not used in this test");
    },
    updateStatus: async () => {
      throw new Error("not used in this test");
    },
    hasOverlappingMaintenance: async () => hasConflict,
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

function buildService(machines: MachineRecord[] = [machine()], hasConflictingMaintenance = false) {
  return new RentalService(
    fakeRentalRepository(),
    fakeMachineRepository(machines),
    fakeOrganizationTypeRepository({
      [RENTER_ORG_ID]: "renter",
      [OTHER_RENTER_ORG_ID]: "renter",
      [RC_ORG_ID]: "rental_company",
    }),
    fakePermissionService(),
    fakeMaintenanceRepository(hasConflictingMaintenance),
    fakeNotificationService(),
  );
}

const baseInput = {
  machineId: MACHINE_ID,
  clientSnapshot: { name: "Acme Construction" },
  startDate: "2026-03-01",
  endDate: "2026-03-10",
  rate: 5000,
  rateUnit: "day" as const,
};

describe("RentalService", () => {
  it("rejects creating a rental against an unknown machine", async () => {
    const service = buildService();
    await expect(
      service.createRental("user-1", RC_ORG_ID, { ...baseInput, machineId: "unknown-machine" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("hides a machine belonging to a different organization behind NotFoundError", async () => {
    const service = buildService([machine({ organization_id: "some-other-org" })]);
    await expect(service.createRental("user-1", RC_ORG_ID, baseInput)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("rejects creating a rental against a retired machine", async () => {
    const service = buildService([machine({ id: RETIRED_MACHINE_ID, status: "retired" })]);
    await expect(
      service.createRental("user-1", RC_ORG_ID, { ...baseInput, machineId: RETIRED_MACHINE_ID }),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects creating a rental that overlaps scheduled machine maintenance", async () => {
    const service = buildService([machine()], true);
    await expect(service.createRental("user-1", RC_ORG_ID, baseInput)).rejects.toThrow(
      ConflictError,
    );
  });

  it("rejects a renterOrganizationId that isn't a Renter-type organization", async () => {
    const service = buildService();
    await expect(
      service.createRental("user-1", RC_ORG_ID, {
        machineId: MACHINE_ID,
        renterOrganizationId: RC_ORG_ID, // a rental_company, not a renter
        startDate: "2026-03-01",
        rate: 5000,
        rateUnit: "day",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("creates a rental against a real Renter organization", async () => {
    const service = buildService();
    const rental = await service.createRental("user-1", RC_ORG_ID, {
      machineId: MACHINE_ID,
      renterOrganizationId: RENTER_ORG_ID,
      startDate: "2026-03-01",
      rate: 5000,
      rateUnit: "day",
    });
    expect(rental.renterOrganizationId).toBe(RENTER_ORG_ID);
    expect(rental.status).toBe("confirmed");
  });

  it("rejects an overlapping commitment for the same machine", async () => {
    const service = buildService();
    await service.createRental("user-1", RC_ORG_ID, baseInput);
    await expect(
      service.createRental("user-1", RC_ORG_ID, {
        ...baseInput,
        startDate: "2026-03-05",
        endDate: "2026-03-15",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("allows a non-overlapping rental for the same machine once the first completes", async () => {
    const service = buildService();
    await service.createRental("user-1", RC_ORG_ID, {
      ...baseInput,
      startDate: "2026-01-01",
      endDate: "2026-01-10",
    });
    const second = await service.createRental("user-1", RC_ORG_ID, {
      ...baseInput,
      startDate: "2026-02-01",
      endDate: "2026-02-10",
    });
    expect(second.status).toBe("confirmed");
  });

  it("hides a rental that belongs to a different organization behind NotFoundError", async () => {
    const service = buildService();
    const rental = await service.createRental("user-1", RC_ORG_ID, baseInput);
    await expect(service.getRental("user-2", OTHER_RC_ORG_ID, rental.id)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("lets a Renter view a single rental of its own, resolving machine/company names it has no permission to look up itself", async () => {
    const service = buildService();
    const rental = await service.createRental("user-1", RC_ORG_ID, {
      ...baseInput,
      renterOrganizationId: RENTER_ORG_ID,
    });

    const fetched = await service.getRental("user-2", RENTER_ORG_ID, rental.id);

    expect(fetched.id).toBe(rental.id);
    expect(fetched.machineAssetCode).toBe("EXC-001");
    expect(fetched.rentalCompanyOrganizationName).toBe("Test Org");
  });

  it("hides another Renter's rental behind NotFoundError instead of the Rental Company branch's check", async () => {
    const service = buildService();
    const rental = await service.createRental("user-1", RC_ORG_ID, {
      ...baseInput,
      renterOrganizationId: RENTER_ORG_ID,
    });
    await expect(service.getRental("user-2", OTHER_RENTER_ORG_ID, rental.id)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("rejects editing terms once the rental is no longer confirmed", async () => {
    const service = buildService();
    const rental = await service.createRental("user-1", RC_ORG_ID, baseInput);
    await service.updateRentalStatus("user-1", RC_ORG_ID, rental.id, "active");

    await expect(
      service.updateRentalTerms("user-1", RC_ORG_ID, rental.id, { rate: 6000 }),
    ).rejects.toThrow(ConflictError);
  });

  it("allows editing terms while still confirmed", async () => {
    const service = buildService();
    const rental = await service.createRental("user-1", RC_ORG_ID, baseInput);
    const updated = await service.updateRentalTerms("user-1", RC_ORG_ID, rental.id, { rate: 6000 });
    expect(updated.rate).toBe(6000);
  });

  it("rejects an illegal status transition", async () => {
    const service = buildService();
    const rental = await service.createRental("user-1", RC_ORG_ID, baseInput);
    await expect(
      service.updateRentalStatus("user-1", RC_ORG_ID, rental.id, "completed"),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects activating a rental whose machine has since been retired", async () => {
    const machines = [machine()];
    const service = buildService(machines);
    const rental = await service.createRental("user-1", RC_ORG_ID, baseInput);
    machines[0]!.status = "retired";

    await expect(
      service.updateRentalStatus("user-1", RC_ORG_ID, rental.id, "active"),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects activating a rental once conflicting maintenance is later scheduled", async () => {
    let hasConflict = false;
    const service = new RentalService(
      fakeRentalRepository(),
      fakeMachineRepository([machine()]),
      fakeOrganizationTypeRepository({ [RENTER_ORG_ID]: "renter", [RC_ORG_ID]: "rental_company" }),
      fakePermissionService(),
      { ...fakeMaintenanceRepository(), hasOverlappingMaintenance: async () => hasConflict },
      fakeNotificationService(),
    );
    const rental = await service.createRental("user-1", RC_ORG_ID, baseInput);
    hasConflict = true;

    await expect(
      service.updateRentalStatus("user-1", RC_ORG_ID, rental.id, "active"),
    ).rejects.toThrow(ConflictError);
  });

  it("runs the full confirmed -> active -> off_rent -> completed lifecycle", async () => {
    const service = buildService();
    const rental = await service.createRental("user-1", RC_ORG_ID, baseInput);
    await service.updateRentalStatus("user-1", RC_ORG_ID, rental.id, "active");
    await service.updateRentalStatus("user-1", RC_ORG_ID, rental.id, "off_rent");
    const completed = await service.updateRentalStatus("user-1", RC_ORG_ID, rental.id, "completed");
    expect(completed.status).toBe("completed");
  });

  it("defaults actualStartDate to today when activating without an explicit date", async () => {
    const service = buildService();
    const rental = await service.createRental("user-1", RC_ORG_ID, baseInput);
    const active = await service.updateRentalStatus("user-1", RC_ORG_ID, rental.id, "active");
    expect(active.actualStartDate).toBe(todayIsoDate());
    expect(active.actualDatesVerificationStatus).toBe("pending");
  });

  it("accepts an overridden actualStartDate/actualEndDate instead of defaulting to today", async () => {
    const service = buildService();
    const rental = await service.createRental("user-1", RC_ORG_ID, baseInput);
    const active = await service.updateRentalStatus(
      "user-1",
      RC_ORG_ID,
      rental.id,
      "active",
      "2026-03-02",
    );
    expect(active.actualStartDate).toBe("2026-03-02");
    const offRent = await service.updateRentalStatus(
      "user-1",
      RC_ORG_ID,
      rental.id,
      "off_rent",
      "2026-03-09",
    );
    expect(offRent.actualEndDate).toBe("2026-03-09");
    expect(offRent.actualDatesVerificationStatus).toBe("pending");
  });

  describe("actual dates verification", () => {
    it("lets the Renter verify the actual dates the Rental Company recorded", async () => {
      const service = buildService();
      const rental = await service.createRental("user-1", RC_ORG_ID, {
        ...baseInput,
        renterOrganizationId: RENTER_ORG_ID,
      });
      await service.updateRentalStatus("user-1", RC_ORG_ID, rental.id, "active");
      const verified = await service.verifyActualDates("user-2", RENTER_ORG_ID, rental.id);
      expect(verified.actualDatesVerificationStatus).toBe("verified");
    });

    it("lets the Renter dispute the actual dates with a reason", async () => {
      const service = buildService();
      const rental = await service.createRental("user-1", RC_ORG_ID, {
        ...baseInput,
        renterOrganizationId: RENTER_ORG_ID,
      });
      await service.updateRentalStatus("user-1", RC_ORG_ID, rental.id, "active");
      const disputed = await service.disputeActualDates(
        "user-2",
        RENTER_ORG_ID,
        rental.id,
        "Machine actually arrived two days later",
      );
      expect(disputed.actualDatesVerificationStatus).toBe("disputed");
      expect(disputed.actualDatesDisputeReason).toBe("Machine actually arrived two days later");
    });

    it("rejects verifying when nothing is pending", async () => {
      const service = buildService();
      const rental = await service.createRental("user-1", RC_ORG_ID, {
        ...baseInput,
        renterOrganizationId: RENTER_ORG_ID,
      });
      await expect(
        service.verifyActualDates("user-2", RENTER_ORG_ID, rental.id),
      ).rejects.toThrow(ConflictError);
    });

    it("hides a rental belonging to a different Renter behind NotFoundError", async () => {
      const service = buildService();
      const rental = await service.createRental("user-1", RC_ORG_ID, {
        ...baseInput,
        renterOrganizationId: RENTER_ORG_ID,
      });
      await service.updateRentalStatus("user-1", RC_ORG_ID, rental.id, "active");
      await expect(
        service.verifyActualDates("user-2", OTHER_RENTER_ORG_ID, rental.id),
      ).rejects.toThrow(NotFoundError);
    });
  });

  it("checks machine availability for the acting organization's own machine", async () => {
    const service = buildService();
    await expect(
      service.checkAvailability("user-1", RC_ORG_ID, {
        machineId: MACHINE_ID,
        startDate: "2026-05-01",
      }),
    ).resolves.toBe(true);
  });

  it("hides another organization's machine behind NotFoundError when checking availability", async () => {
    const service = buildService([machine({ organization_id: "some-other-org" })]);
    await expect(
      service.checkAvailability("user-1", RC_ORG_ID, {
        machineId: MACHINE_ID,
        startDate: "2026-05-01",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects rental management for a Renter organization", async () => {
    const service = new RentalService(
      fakeRentalRepository(),
      fakeMachineRepository([machine()]),
      fakeOrganizationTypeRepository({ [RC_ORG_ID]: "renter" }),
      fakePermissionService("renter"),
      fakeMaintenanceRepository(),
      fakeNotificationService(),
    );
    await expect(service.createRental("user-1", RC_ORG_ID, baseInput)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("lets a Renter list its own rentals, resolving machine/company names it has no permission to look up itself", async () => {
    const service = buildService();
    const rental = await service.createRental("user-1", RC_ORG_ID, {
      ...baseInput,
      renterOrganizationId: RENTER_ORG_ID,
    });

    const rentals = await service.listRentals("user-2", RENTER_ORG_ID);

    expect(rentals).toHaveLength(1);
    expect(rentals[0]?.id).toBe(rental.id);
    expect(rentals[0]?.machineAssetCode).toBe("EXC-001");
    expect(rentals[0]?.rentalCompanyOrganizationName).toBe("Test Org");
  });

  it("leaves machineAssetCode/rentalCompanyOrganizationName null on the Rental Company's own listing", async () => {
    const service = buildService();
    await service.createRental("user-1", RC_ORG_ID, {
      ...baseInput,
      renterOrganizationId: RENTER_ORG_ID,
    });

    const asRentalCompany = await service.listRentals("user-1", RC_ORG_ID);
    expect(asRentalCompany).toHaveLength(1);
    expect(asRentalCompany[0]?.machineAssetCode).toBeNull();
    expect(asRentalCompany[0]?.rentalCompanyOrganizationName).toBeNull();
  });
});
