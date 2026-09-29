import { describe, expect, it } from "vitest";
import { maintenanceListQuerySchema } from "@fleetip/contracts/list";
import { parseListQuery } from "../src/shared/list-query.js";
import { pageInMemory } from "./list-page-fake.js";
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
  CreateMaintenanceInput,
  MachineStatusChange,
  MaintenanceRecord,
  MaintenanceRepositoryPort,
} from "../src/modules/maintenance/domain/ports.js";
import { MaintenanceService } from "../src/modules/maintenance/application/maintenance-service.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../src/shared/errors.js";

const OWNER_ROLE_ID = "role-owner";
const RC_ORG_ID = "org-rental-company";
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
      roleId === OWNER_ROLE_ID ? ["maintenance.manage"] : [],
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
    listMachinesPage: async () => {
      throw new Error("not used in this test");
    },
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

const RENTAL_ID = "rental-1";

// Only the fields MaintenanceService reads; the cast keeps this fake stable while RentalRecord grows.
function rental(overrides: Partial<RentalRecord> = {}): RentalRecord {
  return {
    id: RENTAL_ID,
    rental_company_organization_id: RC_ORG_ID,
    machine_id: MACHINE_ID,
    status: "active",
    start_date: "2026-03-20",
    end_date: "2026-04-30",
    ...overrides,
  } as RentalRecord;
}

function overlaps(aStart: string, aEnd: string | null, bStart: string, bEnd: string | null) {
  return aStart <= (bEnd ?? "9999-12-31") && bStart <= (aEnd ?? "9999-12-31");
}

function fakeRentalRepository(rentals: RentalRecord[] = []): RentalRepositoryPort {
  const unused = async () => {
    throw new Error("not used in this test");
  };
  return {
    create: unused,
    findById: async (id: string) => rentals.find((r) => r.id === id),
    listByOrganization: unused,
    listByRenterOrganization: unused,
    updateTerms: unused,
    updateStatus: unused,
    setActualDatesVerification: unused,
    findCommittedOverlapping: async (machineIds: string[], startDate: string, endDate: string | null) =>
      rentals.filter(
        (r) =>
          machineIds.includes(r.machine_id) &&
          ["confirmed", "active", "off_rent"].includes(r.status) &&
          overlaps(startDate, endDate, r.start_date, r.end_date),
      ),
    searchByOrganization: unused,
    searchByRenterOrganization: unused,
  } as unknown as RentalRepositoryPort;
}

// Emulates the repository's transaction: the machine move is checked (and
// can be made to fail) before anything is stored, so a failure leaves no job.
function fakeMaintenanceRepository(
  machines: MachineRecord[] = [],
  options: { failMachineWrite?: boolean } = {},
): MaintenanceRepositoryPort {
  const records = new Map<string, MaintenanceRecord>();
  let nextId = 1;
  function moveMachine(machineId: string, change?: MachineStatusChange) {
    if (!change) return () => undefined;
    const target = machines.find((m) => m.id === machineId);
    if (options.failMachineWrite || !target || target.status !== change.from) {
      throw new ConflictError("machine write failed");
    }
    return () => {
      target.status = change.to;
    };
  }
  return {
    listMaintenancePage: async (organizationId, query) => {
      const own = new Set(machines.filter((m) => m.organization_id === organizationId).map((m) => m.id));
      const rows = [...records.values()].filter(
        (r) => own.has(r.machine_id) && (!query.machineId || r.machine_id === query.machineId),
      );
      return pageInMemory(rows, (r) => r.start_date, query);
    },
    create: async (input: CreateMaintenanceInput) => {
      const commit = moveMachine(input.machineId, input.machineStatus);
      const record: MaintenanceRecord = {
        id: `maintenance-${nextId++}`,
        machine_id: input.machineId,
        maintenance_type: input.maintenanceType,
        start_date: input.startDate,
        end_date: input.endDate ?? null,
        status: input.status ?? "scheduled",
        notes: input.notes ?? null,
        rental_id: input.rentalId ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      records.set(record.id, record);
      commit();
      return record;
    },
    findById: async (id) => records.get(id),
    listByMachine: async (machineId) =>
      [...records.values()].filter((r) => r.machine_id === machineId),
    listByOrganization: async (organizationId) => {
      const orgMachineIds = new Set(
        machines.filter((m) => m.organization_id === organizationId).map((m) => m.id),
      );
      return [...records.values()].filter((r) => orgMachineIds.has(r.machine_id));
    },
    updateStatus: async (id, status, machineStatus) => {
      const existing = records.get(id);
      if (!existing) throw new Error("not used in this test");
      const commit = moveMachine(existing.machine_id, machineStatus);
      const updated = { ...existing, status, updated_at: new Date() };
      records.set(id, updated);
      commit();
      return updated;
    },
    findOpenOverlapping: async () => {
      throw new Error("not used in this test");
    },
  };
}

function buildService(machines: MachineRecord[] = [machine()], rentals: RentalRecord[] = []) {
  return new MaintenanceService(
    fakeMaintenanceRepository(machines),
    fakeMachineRepository(machines),
    fakeRentalRepository(rentals),
    fakePermissionService(),
  );
}

const baseInput = {
  machineId: MACHINE_ID,
  maintenanceType: "scheduled" as const,
  startDate: "2026-04-01",
  endDate: "2026-04-05",
};

describe("MaintenanceService", () => {
  it("rejects maintenance management for a Renter organization", async () => {
    const service = new MaintenanceService(
      fakeMaintenanceRepository(),
      fakeMachineRepository([machine()]),
      fakeRentalRepository(),
      fakePermissionService("renter"),
    );
    await expect(service.createMaintenance("user-1", RC_ORG_ID, baseInput)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("rejects scheduling maintenance for an unknown machine", async () => {
    const service = buildService();
    await expect(
      service.createMaintenance("user-1", RC_ORG_ID, { ...baseInput, machineId: "unknown" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("hides a machine belonging to a different organization behind NotFoundError", async () => {
    const service = buildService([machine({ organization_id: "some-other-org" })]);
    await expect(service.createMaintenance("user-1", RC_ORG_ID, baseInput)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("rejects scheduling maintenance that overlaps a committed Rental", async () => {
    const service = buildService([machine()], [rental({ status: "confirmed" })]);
    await expect(service.createMaintenance("user-1", RC_ORG_ID, baseInput)).rejects.toThrow(
      ConflictError,
    );
  });

  it("names the blocking rental in the 409 and its detail", async () => {
    const service = buildService([machine()], [rental({ status: "confirmed" })]);
    await expect(service.createMaintenance("user-1", RC_ORG_ID, baseInput)).rejects.toMatchObject({
      message: expect.stringContaining("RN-RENTAL-1"),
      field: "startDate",
      conflict: { kind: "rental", id: RENTAL_ID, reference: "RN-RENTAL-1" },
    });
  });

  it("links a job to the machine's own rental, and that rental's dates don't block it", async () => {
    const service = buildService([machine()], [rental()]);
    const record = await service.createMaintenance("user-1", RC_ORG_ID, {
      ...baseInput,
      maintenanceType: "breakdown",
      rentalId: RENTAL_ID,
    });
    expect(record.rentalId).toBe(RENTAL_ID);
  });

  it("keeps the rental link tenant-scoped and on the same machine", async () => {
    const otherTenant = buildService([machine()], [rental({ rental_company_organization_id: "some-other-org" })]);
    await expect(
      otherTenant.createMaintenance("user-1", RC_ORG_ID, { ...baseInput, rentalId: RENTAL_ID }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      buildService([machine()]).createMaintenance("user-1", RC_ORG_ID, { ...baseInput, rentalId: "missing" }),
    ).rejects.toThrow(NotFoundError);

    const otherMachine = buildService([machine()], [rental({ machine_id: "machine-2" })]);
    await expect(
      otherMachine.createMaintenance("user-1", RC_ORG_ID, { ...baseInput, rentalId: RENTAL_ID }),
    ).rejects.toThrow(ValidationError);
  });

  it("sends to workshop in one write: job In progress and machine Under maintenance", async () => {
    const machines = [machine()];
    const service = buildService(machines);
    const record = await service.sendToWorkshop("user-1", RC_ORG_ID, baseInput);
    expect(record.status).toBe("in_progress");
    expect(machines[0]!.status).toBe("under_maintenance");
  });

  it("leaves no job behind when the machine can't go to the workshop", async () => {
    const retired = [machine({ status: "retired" })];
    const service = buildService(retired);
    await expect(service.sendToWorkshop("user-1", RC_ORG_ID, baseInput)).rejects.toThrow(ConflictError);
    expect(await service.listByMachine("user-1", RC_ORG_ID, MACHINE_ID)).toHaveLength(0);

    // The machine write fails inside the transaction: the job is rolled back with it.
    const machines = [machine()];
    const failing = new MaintenanceService(
      fakeMaintenanceRepository(machines, { failMachineWrite: true }),
      fakeMachineRepository(machines),
      fakeRentalRepository(),
      fakePermissionService(),
    );
    await expect(failing.sendToWorkshop("user-1", RC_ORG_ID, baseInput)).rejects.toThrow(ConflictError);
    expect(await failing.listByMachine("user-1", RC_ORG_ID, MACHINE_ID)).toHaveLength(0);
    expect(machines[0]!.status).toBe("active");
  });

  it("logs a job that already happened as Completed in one write", async () => {
    const machines = [machine()];
    const service = buildService(machines);
    const record = await service.logCompleted("user-1", RC_ORG_ID, baseInput);
    expect(record.status).toBe("completed");
    expect(machines[0]!.status).toBe("active");
  });

  it("moves the machine with a job status change, or neither when the machine move fails", async () => {
    const machines = [machine({ status: "under_maintenance" })];
    const service = buildService(machines);
    const job = await service.createMaintenance("user-1", RC_ORG_ID, baseInput);
    await service.updateStatus("user-1", RC_ORG_ID, job.id, "in_progress");

    // under_maintenance -> under_maintenance isn't a machine transition: refused, job unchanged.
    await expect(
      service.updateStatus("user-1", RC_ORG_ID, job.id, "completed", "under_maintenance"),
    ).rejects.toThrow(ConflictError);
    expect((await service.getMaintenanceRecord("user-1", RC_ORG_ID, job.id)).status).toBe("in_progress");

    const done = await service.updateStatus("user-1", RC_ORG_ID, job.id, "completed", "active");
    expect(done.status).toBe("completed");
    expect(machines[0]!.status).toBe("active");
  });

  it("schedules maintenance when the machine is free", async () => {
    const service = buildService();
    const record = await service.createMaintenance("user-1", RC_ORG_ID, baseInput);
    expect(record.status).toBe("scheduled");
  });

  it("rejects an illegal maintenance status transition", async () => {
    const service = buildService();
    const record = await service.createMaintenance("user-1", RC_ORG_ID, baseInput);
    await expect(service.updateStatus("user-1", RC_ORG_ID, record.id, "completed")).rejects.toThrow(
      ConflictError,
    );
  });

  it("runs the full scheduled -> in_progress -> completed lifecycle", async () => {
    const service = buildService();
    const record = await service.createMaintenance("user-1", RC_ORG_ID, baseInput);
    await service.updateStatus("user-1", RC_ORG_ID, record.id, "in_progress");
    const completed = await service.updateStatus("user-1", RC_ORG_ID, record.id, "completed");
    expect(completed.status).toBe("completed");
  });

  it("lists maintenance only for a machine in the caller's own organization", async () => {
    const service = buildService();
    await service.createMaintenance("user-1", RC_ORG_ID, baseInput);
    const list = await service.listByMachine("user-1", RC_ORG_ID, MACHINE_ID);
    expect(list).toHaveLength(1);
  });

  it("lists maintenance across the whole organization's fleet on the standalone screen", async () => {
    const secondMachine = machine({ id: "machine-2" });
    const service = buildService([machine(), secondMachine]);
    await service.createMaintenance("user-1", RC_ORG_ID, baseInput);
    await service.createMaintenance("user-1", RC_ORG_ID, { ...baseInput, machineId: "machine-2" });

    const list = await service.listByOrganization("user-1", RC_ORG_ID);
    expect(list).toHaveLength(2);
  });

  it("gets one maintenance record, hidden from other organizations and unknown ids", async () => {
    const ownMachine = machine();
    const service = buildService([ownMachine]);
    const created = await service.createMaintenance("user-1", RC_ORG_ID, baseInput);

    await expect(
      service.getMaintenanceRecord("user-1", RC_ORG_ID, created.id),
    ).resolves.toMatchObject({ id: created.id, machineId: MACHINE_ID, status: "scheduled" });
    await expect(service.getMaintenanceRecord("user-1", RC_ORG_ID, "missing")).rejects.toThrow(
      NotFoundError,
    );

    // The record's machine now belongs to another tenant.
    ownMachine.organization_id = "some-other-org";
    await expect(service.getMaintenanceRecord("user-1", RC_ORG_ID, created.id)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("pages maintenance through the repository when list params are given", async () => {
    const service = buildService([machine(), machine({ id: "machine-2" })]);
    await service.createMaintenance("user-1", RC_ORG_ID, baseInput);
    await service.createMaintenance("user-1", RC_ORG_ID, { ...baseInput, machineId: "machine-2" });
    const query = parseListQuery(maintenanceListQuerySchema, { limit: "1" })!;
    const page = await service.listMaintenancePage("user-1", RC_ORG_ID, query);
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toEqual(expect.any(String));
  });
});
