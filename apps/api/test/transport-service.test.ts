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
  CreateTransportInput,
  TransportRecord,
  TransportRepositoryPort,
  UpdateTransportInput,
} from "../src/modules/transport/domain/ports.js";
import { TransportService } from "../src/modules/transport/application/transport-service.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../src/shared/errors.js";

const OWNER_ROLE_ID = "role-owner";
const RC_ORG_ID = "org-rental-company";
const OTHER_RC_ORG_ID = "org-other-rental-company";
const RENTAL_ID = "rental-1";

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
      roleId === OWNER_ROLE_ID ? ["transport.manage"] : [],
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
    machine_id: "machine-1",
    status: "confirmed",
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

function fakeTransportRepository(): TransportRepositoryPort {
  const records = new Map<string, TransportRecord>();
  let nextId = 1;
  return {
    create: async (input: CreateTransportInput) => {
      const record: TransportRecord = {
        id: `transport-${nextId++}`,
        rental_id: input.rentalId,
        leg: input.leg,
        pickup_location: input.pickupLocation ?? null,
        destination: input.destination ?? null,
        planned_date: input.plannedDate ?? null,
        actual_date: null,
        status: "planned",
        transport_details: input.transportDetails ?? null,
        charges: input.charges ?? null,
        notes: input.notes ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      records.set(record.id, record);
      return record;
    },
    findByRentalAndLeg: async (rentalId, leg) =>
      [...records.values()].find((r) => r.rental_id === rentalId && r.leg === leg),
    listByRental: async (rentalId) => [...records.values()].filter((r) => r.rental_id === rentalId),
    update: async (id: string, updates: UpdateTransportInput) => {
      const existing = records.get(id);
      if (!existing) throw new Error("not used in this test");
      const updated: TransportRecord = {
        ...existing,
        ...(updates.status !== undefined && { status: updates.status }),
        ...(updates.actualDate !== undefined && { actual_date: updates.actualDate }),
        ...(updates.notes !== undefined && { notes: updates.notes }),
        updated_at: new Date(),
      };
      records.set(id, updated);
      return updated;
    },
  };
}

function buildService(rentals: RentalRecord[] = [rental()]) {
  return new TransportService(
    fakeTransportRepository(),
    fakeRentalRepository(rentals),
    fakePermissionService(),
  );
}

describe("TransportService", () => {
  it("rejects transport management for a Renter organization", async () => {
    const service = new TransportService(
      fakeTransportRepository(),
      fakeRentalRepository([rental()]),
      fakePermissionService("renter"),
    );
    await expect(
      service.createTransport("user-1", RC_ORG_ID, RENTAL_ID, { leg: "mobilization" }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("hides a rental belonging to a different organization behind NotFoundError", async () => {
    const service = buildService([rental({ rental_company_organization_id: OTHER_RC_ORG_ID })]);
    await expect(
      service.createTransport("user-1", RC_ORG_ID, RENTAL_ID, { leg: "mobilization" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("creates a mobilization transport record for a real Rental", async () => {
    const service = buildService();
    const record = await service.createTransport("user-1", RC_ORG_ID, RENTAL_ID, {
      leg: "mobilization",
      pickupLocation: "Yard A",
      destination: "Site B",
    });
    expect(record.status).toBe("planned");
    expect(record.leg).toBe("mobilization");
  });

  it("rejects an illegal transport status transition", async () => {
    const service = buildService();
    await service.createTransport("user-1", RC_ORG_ID, RENTAL_ID, { leg: "mobilization" });
    await expect(
      service.updateTransport("user-1", RC_ORG_ID, RENTAL_ID, "mobilization", {
        status: "delivered",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("runs the full planned -> dispatched -> delivered lifecycle", async () => {
    const service = buildService();
    await service.createTransport("user-1", RC_ORG_ID, RENTAL_ID, { leg: "mobilization" });
    await service.updateTransport("user-1", RC_ORG_ID, RENTAL_ID, "mobilization", {
      status: "dispatched",
    });
    const delivered = await service.updateTransport(
      "user-1",
      RC_ORG_ID,
      RENTAL_ID,
      "mobilization",
      {
        status: "delivered",
        actualDate: "2026-03-01",
      },
    );
    expect(delivered.status).toBe("delivered");
    expect(delivered.actualDate).toBe("2026-03-01");
  });

  it("tracks mobilization and demobilization as independent legs", async () => {
    const service = buildService();
    await service.createTransport("user-1", RC_ORG_ID, RENTAL_ID, { leg: "mobilization" });
    await service.createTransport("user-1", RC_ORG_ID, RENTAL_ID, { leg: "demobilization" });
    const list = await service.listByRental("user-1", RC_ORG_ID, RENTAL_ID);
    expect(list).toHaveLength(2);
  });

  it("rejects updating a leg that has no transport record yet", async () => {
    const service = buildService();
    await expect(
      service.updateTransport("user-1", RC_ORG_ID, RENTAL_ID, "demobilization", {
        status: "dispatched",
      }),
    ).rejects.toThrow(NotFoundError);
  });
});
