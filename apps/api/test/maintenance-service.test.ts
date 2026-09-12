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
import type { RentalRepositoryPort } from "../src/modules/marketplace/rental/domain/ports.js";
import type {
  CreateMaintenanceInput,
  MaintenanceRecord,
  MaintenanceRepositoryPort,
} from "../src/modules/maintenance/domain/ports.js";
import { MaintenanceService } from "../src/modules/maintenance/application/maintenance-service.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../src/shared/errors.js";

const OWNER_ROLE_ID = "role-owner";
const RC_ORG_ID = "org-rental-company";
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
        created_at: new Date(),
      };
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
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async (id) => machines.find((m) => m.id === id),
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

function fakeRentalRepository(machineIsAvailable: boolean): RentalRepositoryPort {
  return {
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async () => {
      throw new Error("not used in this test");
    },
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
    isAvailable: async () => machineIsAvailable,
  };
}

function fakeMaintenanceRepository(): MaintenanceRepositoryPort {
  const records = new Map<string, MaintenanceRecord>();
  let nextId = 1;
  return {
    create: async (input: CreateMaintenanceInput) => {
      const record: MaintenanceRecord = {
        id: `maintenance-${nextId++}`,
        machine_id: input.machineId,
        maintenance_type: input.maintenanceType,
        start_date: input.startDate,
        end_date: input.endDate ?? null,
        status: "scheduled",
        notes: input.notes ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      records.set(record.id, record);
      return record;
    },
    findById: async (id) => records.get(id),
    listByMachine: async (machineId) =>
      [...records.values()].filter((r) => r.machine_id === machineId),
    updateStatus: async (id, status) => {
      const existing = records.get(id);
      if (!existing) throw new Error("not used in this test");
      const updated = { ...existing, status, updated_at: new Date() };
      records.set(id, updated);
      return updated;
    },
    hasOverlappingMaintenance: async () => {
      throw new Error("not used in this test");
    },
  };
}

function buildService(machines: MachineRecord[] = [machine()], machineIsAvailable = true) {
  return new MaintenanceService(
    fakeMaintenanceRepository(),
    fakeMachineRepository(machines),
    fakeRentalRepository(machineIsAvailable),
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
      fakeRentalRepository(true),
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
    const service = buildService([machine()], false);
    await expect(service.createMaintenance("user-1", RC_ORG_ID, baseInput)).rejects.toThrow(
      ConflictError,
    );
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
});
