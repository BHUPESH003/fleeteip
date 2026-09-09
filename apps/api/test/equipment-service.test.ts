import { describe, expect, it } from "vitest";
import type {
  ActiveMembershipRecord,
  MembershipRepositoryPort,
} from "../src/modules/organizations/domain/ports.js";
import type { RoleRepositoryPort } from "../src/modules/permissions/domain/ports.js";
import { PermissionService } from "../src/modules/permissions/application/permission-service.js";
import type {
  ProductRecord,
  ProductRepositoryPort,
} from "../src/modules/catalogue/domain/ports.js";
import type {
  MachineRecord,
  MachineRepositoryPort,
} from "../src/modules/equipment/domain/ports.js";
import { EquipmentService } from "../src/modules/equipment/application/equipment-service.js";
import { ConflictError, NotFoundError } from "../src/shared/errors.js";

const OWNER_ROLE_ID = "role-owner";
const PRODUCT_ID = "product-1";

// Every test grants permission unconditionally — PermissionService's own
// denial paths already have dedicated coverage in permission-service.test.ts.
function fakePermissionService(): PermissionService {
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
  };
  return new PermissionService(membershipRepository, roleRepository);
}

function fakeProductRepository(): ProductRepositoryPort {
  const product: ProductRecord = {
    id: PRODUCT_ID,
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
    findById: async (id) => (id === PRODUCT_ID ? product : undefined),
  };
}

function fakeMachineRepository(): MachineRepositoryPort {
  const machines = new Map<string, MachineRecord>();
  let nextId = 1;

  return {
    create: async (input) => {
      const record: MachineRecord = {
        id: `machine-${nextId++}`,
        organization_id: input.organizationId,
        product_id: input.productId,
        asset_code: input.assetCode,
        chassis_number: input.chassisNumber ?? null,
        registration_number: input.registrationNumber,
        year_of_manufacture: input.yearOfManufacture ?? null,
        status: "active",
        created_at: new Date(),
      };
      machines.set(record.id, record);
      return record;
    },
    findById: async (id) => machines.get(id),
    listByOrganization: async (organizationId) =>
      [...machines.values()].filter((machine) => machine.organization_id === organizationId),
    updateStatus: async (id, status) => {
      const existing = machines.get(id);
      if (!existing) throw new Error("not used in this test");
      const updated = { ...existing, status };
      machines.set(id, updated);
      return updated;
    },
    assetCodeExists: async (organizationId, assetCode) =>
      [...machines.values()].some(
        (machine) => machine.organization_id === organizationId && machine.asset_code === assetCode,
      ),
  };
}

function buildService() {
  return new EquipmentService(
    fakeMachineRepository(),
    fakeProductRepository(),
    fakePermissionService(),
  );
}

const baseInput = {
  productId: PRODUCT_ID,
  assetCode: "EXC-001",
  registrationNumber: "RJ01AB1234",
};

describe("EquipmentService", () => {
  it("rejects creating a machine against an unknown product", async () => {
    const service = buildService();
    await expect(
      service.createMachine("user-1", "org-1", { ...baseInput, productId: "unknown-product" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects a duplicate asset code within the same organization", async () => {
    const service = buildService();
    await service.createMachine("user-1", "org-1", baseInput);
    await expect(service.createMachine("user-1", "org-1", baseInput)).rejects.toThrow(
      ConflictError,
    );
  });

  it("lets two different organizations create a machine against the same product", async () => {
    const service = buildService();
    await service.createMachine("user-1", "org-A", baseInput);
    await service.createMachine("user-2", "org-B", baseInput);

    await expect(service.listMachines("user-1", "org-A")).resolves.toHaveLength(1);
    await expect(service.listMachines("user-2", "org-B")).resolves.toHaveLength(1);
  });

  it("rejects an illegal status transition", async () => {
    const service = buildService();
    const machine = await service.createMachine("user-1", "org-1", baseInput);
    await service.updateMachineStatus("user-1", "org-1", machine.id, "retired");

    await expect(
      service.updateMachineStatus("user-1", "org-1", machine.id, "active"),
    ).rejects.toThrow(ConflictError);
  });

  it("hides a machine that belongs to a different organization behind NotFoundError", async () => {
    const service = buildService();
    const machine = await service.createMachine("user-1", "org-A", baseInput);

    await expect(
      service.updateMachineStatus("user-2", "org-B", machine.id, "under_maintenance"),
    ).rejects.toThrow(NotFoundError);
  });
});
