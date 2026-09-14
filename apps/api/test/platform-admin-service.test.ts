import { describe, expect, it } from "vitest";
import type {
  OrganizationRepositoryPort,
  OrganizationWithTypeRecord,
} from "../src/modules/organizations/domain/ports.js";
import type { PublicUserRecord, UserRepositoryPort } from "../src/modules/identity/domain/ports.js";
import type {
  RequirementRecord,
  RequirementRepositoryPort,
} from "../src/modules/marketplace/rfq/domain/ports.js";
import type {
  AuctionRecord,
  AuctionRepositoryPort,
} from "../src/modules/marketplace/auction/domain/ports.js";
import { CatalogueService } from "../src/modules/catalogue/application/catalogue-service.js";
import { PlatformAdminService } from "../src/modules/platform-admin/application/platform-admin-service.js";
import { NotFoundError } from "../src/shared/errors.js";

function fakeOrganizationRepository(): OrganizationRepositoryPort {
  const orgs: OrganizationWithTypeRecord[] = [
    {
      id: "org-1",
      organization_type_id: "type-rental_company",
      organization_type_code: "rental_company",
      name: "Apex Equipment Rentals",
      code: "APEX",
      status: "active",
      created_at: new Date(),
    },
    {
      id: "org-2",
      organization_type_id: "type-renter",
      organization_type_code: "renter",
      name: "Metro Infra Builders",
      code: "METRO",
      status: "active",
      created_at: new Date(),
    },
  ];
  return {
    findTypeByCode: async () => {
      throw new Error("not used in this test");
    },
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async (id) => orgs.find((o) => o.id === id),
    findWithTypeById: async (id) => orgs.find((o) => o.id === id),
    listAllForPlatformAdmin: async () => orgs,
    updateStatus: async (id, status) => {
      const org = orgs.find((o) => o.id === id);
      if (!org) throw new Error("not found");
      org.status = status;
      return org;
    },
    codeExists: async () => {
      throw new Error("not used in this test");
    },
    listByType: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeUserRepository(): UserRepositoryPort {
  const users: PublicUserRecord[] = [
    { id: "user-1", email: "owner@apex.example", display_name: "Apex Owner", status: "active", created_at: new Date() },
  ];
  return {
    findByEmail: async () => {
      throw new Error("not used in this test");
    },
    findById: async (id) => users.find((u) => u.id === id),
    create: async () => {
      throw new Error("not used in this test");
    },
    listAllForPlatformAdmin: async () => users,
    updateStatus: async (id, status) => {
      const user = users.find((u) => u.id === id);
      if (!user) throw new Error("not found");
      user.status = status;
      return user;
    },
  };
}

function fakeRequirementRepository(): RequirementRepositoryPort {
  const requirement: RequirementRecord = {
    id: "requirement-1",
    renter_organization_id: "org-2",
    project_id: "project-1",
    product_subcategory_id: "subcategory-1",
    capacity: null,
    capacity_unit: null,
    boom_length: null,
    quantity: 1,
    project_name: "Metro Bridge",
    project_location: null,
    requested_start_date: "2026-03-01",
    expected_duration_value: null,
    expected_duration_unit: null,
    shift_pattern: null,
    crew_requirement: null,
    shift_requirement: null,
    validity_date: "2026-02-15",
    status: "open",
    notes: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
  return {
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async () => {
      throw new Error("not used in this test");
    },
    listByRenter: async () => {
      throw new Error("not used in this test");
    },
    listOpenForDiscovery: async () => [requirement],
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

function fakeAuctionRepository(): AuctionRepositoryPort {
  const auctions: AuctionRecord[] = [
    {
      id: "auction-1",
      requirement_id: "requirement-2",
      created_by_organization_id: "org-2",
      bidding_direction: "descending",
      base_price: 9000,
      max_bids_per_participant: null,
      starts_at: new Date(),
      ends_at: new Date(),
      status: "live",
      created_at: new Date(),
      updated_at: new Date(),
    },
  ];
  return {
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async () => {
      throw new Error("not used in this test");
    },
    listByRequirement: async () => {
      throw new Error("not used in this test");
    },
    listByOwnerOrganization: async () => {
      throw new Error("not used in this test");
    },
    listByParticipantOrganization: async () => {
      throw new Error("not used in this test");
    },
    listAllForPlatformAdmin: async () => auctions,
    syncStatus: async () => {
      throw new Error("not used in this test");
    },
    closeNow: async () => {
      throw new Error("not used in this test");
    },
    cancel: async () => {
      throw new Error("not used in this test");
    },
    addParticipant: async () => {
      throw new Error("not used in this test");
    },
    findParticipantByOrganization: async () => {
      throw new Error("not used in this test");
    },
    findParticipantById: async () => {
      throw new Error("not used in this test");
    },
    updateParticipantStatus: async () => {
      throw new Error("not used in this test");
    },
    listParticipants: async () => {
      throw new Error("not used in this test");
    },
    placeBid: async () => {
      throw new Error("not used in this test");
    },
    listBids: async () => {
      throw new Error("not used in this test");
    },
    findResult: async () => {
      throw new Error("not used in this test");
    },
    listEvents: async () => {
      throw new Error("not used in this test");
    },
  };
}

function buildService() {
  const catalogueService = new CatalogueService(
    {
      listAll: async () => [],
      findById: async () => undefined,
      create: async (input) => ({ id: "category-1", ...input, created_at: new Date() }),
      updateName: async () => {
        throw new Error("not used in this test");
      },
      codeExists: async () => false,
    },
    {
      listByCategory: async () => [],
      findById: async () => undefined,
      create: async () => {
        throw new Error("not used in this test");
      },
      updateName: async () => {
        throw new Error("not used in this test");
      },
      codeExistsInCategory: async () => false,
    },
    {
      listAll: async () => [],
      findById: async () => undefined,
      create: async () => {
        throw new Error("not used in this test");
      },
      update: async () => {
        throw new Error("not used in this test");
      },
    },
    // PermissionService is never called by the *AsPlatformAdmin methods —
    // pass a throwing stub to prove that.
    { requirePermission: async () => { throw new Error("must not be called"); } } as never,
  );
  return new PlatformAdminService(
    catalogueService,
    fakeOrganizationRepository(),
    fakeUserRepository(),
    fakeRequirementRepository(),
    fakeAuctionRepository(),
  );
}

describe("PlatformAdminService", () => {
  it("lists every organization across every tenant", async () => {
    const service = buildService();
    const organizations = await service.listOrganizations();
    expect(organizations).toHaveLength(2);
    expect(organizations.map((o) => o.code)).toEqual(["APEX", "METRO"]);
  });

  it("suspends and reactivates an organization", async () => {
    const service = buildService();
    const suspended = await service.setOrganizationStatus("org-1", "suspended");
    expect(suspended.status).toBe("suspended");
    const reactivated = await service.setOrganizationStatus("org-1", "active");
    expect(reactivated.status).toBe("active");
  });

  it("rejects suspending an organization that doesn't exist", async () => {
    const service = buildService();
    await expect(service.setOrganizationStatus("unknown-org", "suspended")).rejects.toThrow(
      NotFoundError,
    );
  });

  it("lists every user and can suspend one", async () => {
    const service = buildService();
    const users = await service.listUsers();
    expect(users).toHaveLength(1);
    const suspended = await service.setUserStatus("user-1", "suspended");
    expect(suspended.status).toBe("suspended");
  });

  it("creates a catalogue category without any organization/permission context", async () => {
    const service = buildService();
    const category = await service.catalogueService.createCategoryAsPlatformAdmin({
      code: "EXCAVATOR",
      name: "Excavator",
    });
    expect(category.code).toBe("EXCAVATOR");
  });

  it("lists open requirements and live/scheduled auctions across every tenant for oversight", async () => {
    const service = buildService();
    const requirements = await service.listOpenRequirements();
    expect(requirements).toHaveLength(1);
    const auctions = await service.listAuctions();
    expect(auctions).toHaveLength(1);
  });

  it("computes dashboard counts across organizations/users/requirements/auctions", async () => {
    const service = buildService();
    const counts = await service.getDashboardCounts();
    expect(counts).toEqual({
      organizations: 2,
      users: 1,
      openRequirements: 1,
      liveAuctions: 1,
    });
  });
});
