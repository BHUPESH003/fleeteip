import { describe, expect, it } from "vitest";
import type { OrganizationTypeCode } from "@fleetip/contracts/organization";
import type { RequirementStatus } from "@fleetip/contracts/rfq";
import type {
  ActiveMembershipRecord,
  MembershipRepositoryPort,
  OrganizationRepositoryPort,
} from "../src/modules/organizations/domain/ports.js";
import type { RoleRepositoryPort } from "../src/modules/permissions/domain/ports.js";
import { PermissionService } from "../src/modules/permissions/application/permission-service.js";
import type {
  ProductSubcategoryRecord,
  ProductSubcategoryRepositoryPort,
} from "../src/modules/catalogue/domain/ports.js";
import type {
  CreateRequirementInput,
  RequirementRecord,
  RequirementRepositoryPort,
} from "../src/modules/marketplace/rfq/domain/ports.js";
import type { ProjectRecord, ProjectRepositoryPort } from "../src/modules/marketplace/project/domain/ports.js";
import { RequirementService } from "../src/modules/marketplace/rfq/application/requirement-service.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../src/shared/errors.js";

const OWNER_ROLE_ID = "role-owner";
const RENTER_ORG_ID = "org-renter";
const OTHER_RENTER_ORG_ID = "org-other-renter";
const RC_ORG_ID = "org-rental-company";
const SUBCATEGORY_ID = "subcategory-1";
const PROJECT_ID = "project-1";

function fakeProjectRepository(
  projects: ProjectRecord[] = [
    {
      id: PROJECT_ID,
      renter_organization_id: RENTER_ORG_ID,
      project_code: "PRJ-2026-1",
      project_type: "Bridge and Metro",
      project_name: "Metro Bridge Foundation",
      site_location: "Jaipur",
      state: null,
      district: null,
      start_date: "2026-03-01",
      end_date: null,
      status: "active",
      created_at: new Date(),
      updated_at: new Date(),
    },
  ],
): ProjectRepositoryPort {
  return {
    nextReferenceNumber: async () => {
      throw new Error("not used in this test");
    },
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async (id) => projects.find((p) => p.id === id),
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

function fakePermissionService(organizationTypeCode: OrganizationTypeCode = "renter") {
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
      roleId === OWNER_ROLE_ID ? ["rfq.manage", "rfq.respond"] : [],
  };
  return new PermissionService(
    membershipRepository,
    roleRepository,
    fakeOrganizationTypeRepository({
      [RENTER_ORG_ID]: organizationTypeCode,
      [OTHER_RENTER_ORG_ID]: "renter",
      [RC_ORG_ID]: "rental_company",
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

function fakeProductSubcategoryRepository(
  subcategories: ProductSubcategoryRecord[] = [
    {
      id: SUBCATEGORY_ID,
      product_category_id: "category-1",
      code: "TRACKED",
      name: "Tracked Excavator",
      created_at: new Date(),
    },
  ],
): ProductSubcategoryRepositoryPort {
  return {
    listByCategory: async () => {
      throw new Error("not used in this test");
    },
    findById: async (id) => subcategories.find((subcategory) => subcategory.id === id),
    create: async () => {
      throw new Error("not used in this test");
    },
    updateName: async () => {
      throw new Error("not used in this test");
    },
    codeExistsInCategory: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeRequirementRepository(): RequirementRepositoryPort {
  const requirements = new Map<string, RequirementRecord>();
  let nextId = 1;

  return {
    create: async (input: CreateRequirementInput) => {
      const record: RequirementRecord = {
        id: `requirement-${nextId++}`,
        renter_organization_id: input.renterOrganizationId,
        project_id: input.projectId,
        product_subcategory_id: input.productSubcategoryId,
        capacity: input.capacity ?? null,
        capacity_unit: input.capacityUnit ?? null,
        boom_length: input.boomLength ?? null,
        quantity: input.quantity,
        project_name: input.projectName ?? null,
        project_location: input.projectLocation ?? null,
        requested_start_date: input.requestedStartDate,
        expected_duration_value: input.expectedDurationValue ?? null,
        expected_duration_unit: input.expectedDurationUnit ?? null,
        shift_pattern: input.shiftPattern ?? null,
        crew_requirement: input.crewRequirement ?? null,
        shift_requirement: input.shiftRequirement ?? null,
        validity_date: input.validityDate,
        status: "open",
        notes: input.notes ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      requirements.set(record.id, record);
      return record;
    },
    findById: async (id) => requirements.get(id),
    listByRenter: async (renterOrganizationId) =>
      [...requirements.values()].filter((r) => r.renter_organization_id === renterOrganizationId),
    listOpenForDiscovery: async () =>
      [...requirements.values()].filter(
        (r) => r.status === "open" && r.validity_date >= "2026-01-01",
      ),
    updateStatus: async (id: string, status: RequirementStatus) => {
      const existing = requirements.get(id);
      if (!existing) throw new Error("not used in this test");
      const updated = { ...existing, status, updated_at: new Date() };
      requirements.set(id, updated);
      return updated;
    },
    updateFields: async (id, updates) => {
      const existing = requirements.get(id);
      if (!existing) throw new Error("not used in this test");
      const updated: RequirementRecord = {
        ...existing,
        ...(updates.capacity !== undefined && { capacity: updates.capacity }),
        ...(updates.capacityUnit !== undefined && { capacity_unit: updates.capacityUnit }),
        ...(updates.quantity !== undefined && { quantity: updates.quantity }),
        ...(updates.projectName !== undefined && { project_name: updates.projectName }),
        ...(updates.projectLocation !== undefined && {
          project_location: updates.projectLocation,
        }),
        ...(updates.requestedStartDate !== undefined && {
          requested_start_date: updates.requestedStartDate,
        }),
        ...(updates.validityDate !== undefined && { validity_date: updates.validityDate }),
        ...(updates.notes !== undefined && { notes: updates.notes }),
        updated_at: new Date(),
      };
      requirements.set(id, updated);
      return updated;
    },
    search: async () => {
      throw new Error("not used in this test");
    },
  };
}

function buildService(subcategories?: ProductSubcategoryRecord[]) {
  return new RequirementService(
    fakeRequirementRepository(),
    fakeProductSubcategoryRepository(subcategories),
    fakePermissionService(),
    fakeProjectRepository(),
  );
}

const baseInput = {
  projectId: PROJECT_ID,
  productSubcategoryId: SUBCATEGORY_ID,
  quantity: 1,
  requestedStartDate: "2026-03-01",
  validityDate: "2026-02-15",
};

describe("RequirementService", () => {
  it("rejects creating a requirement against an unknown product subcategory", async () => {
    const service = buildService();
    await expect(
      service.createRequirement("user-1", RENTER_ORG_ID, {
        ...baseInput,
        productSubcategoryId: "unknown-subcategory",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("creates an open requirement for a real product subcategory", async () => {
    const service = buildService();
    const requirement = await service.createRequirement("user-1", RENTER_ORG_ID, baseInput);
    expect(requirement.status).toBe("open");
    expect(requirement.renterOrganizationId).toBe(RENTER_ORG_ID);
  });

  // The caller never supplies projectName/projectLocation at all (removed
  // from CreateRequirementRequest — projectId is the sole input) — this
  // snapshot still matters for the cross-tenant Open Market view, which has
  // no access to the Renter's own Project records. See docs/decisions.md.
  it("snapshots the resolved project's own name and location onto the requirement", async () => {
    const service = buildService();
    const requirement = await service.createRequirement("user-1", RENTER_ORG_ID, baseInput);
    expect(requirement.projectName).toBe("Metro Bridge Foundation");
    expect(requirement.projectLocation).toBe("Jaipur");
  });

  it("rejects requirement management for a Rental Company organization", async () => {
    const service = new RequirementService(
      fakeRequirementRepository(),
      fakeProductSubcategoryRepository(),
      fakePermissionService("rental_company"),
      fakeProjectRepository(),
    );
    await expect(service.createRequirement("user-1", RENTER_ORG_ID, baseInput)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("rejects creating a requirement against a project in a different organization", async () => {
    const service = buildService();
    await expect(
      service.createRequirement("user-1", OTHER_RENTER_ORG_ID, baseInput),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects creating a requirement against a non-active project", async () => {
    const service = new RequirementService(
      fakeRequirementRepository(),
      fakeProductSubcategoryRepository(),
      fakePermissionService(),
      fakeProjectRepository([
        {
          id: PROJECT_ID,
          renter_organization_id: RENTER_ORG_ID,
          project_code: "PRJ-2026-1",
          project_type: "Bridge and Metro",
          project_name: "Metro Bridge Foundation",
          site_location: "Jaipur",
          state: null,
          district: null,
          start_date: "2026-03-01",
          end_date: null,
          status: "completed",
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]),
    );
    await expect(service.createRequirement("user-1", RENTER_ORG_ID, baseInput)).rejects.toThrow(
      ValidationError,
    );
  });

  it("hides a requirement belonging to a different organization behind NotFoundError", async () => {
    const service = buildService();
    const requirement = await service.createRequirement("user-1", RENTER_ORG_ID, baseInput);
    await expect(
      service.getRequirement("user-2", OTHER_RENTER_ORG_ID, requirement.id),
    ).rejects.toThrow(NotFoundError);
  });

  it("lists requirements only for the acting organization", async () => {
    const service = buildService();
    await service.createRequirement("user-1", RENTER_ORG_ID, baseInput);
    const list = await service.listRequirements("user-1", RENTER_ORG_ID);
    expect(list).toHaveLength(1);
  });

  it("allows editing fields while a requirement is open", async () => {
    const service = buildService();
    const requirement = await service.createRequirement("user-1", RENTER_ORG_ID, baseInput);
    const updated = await service.updateRequirement("user-1", RENTER_ORG_ID, requirement.id, {
      projectName: "Metro Line 3",
      quantity: 2,
    });
    expect(updated.projectName).toBe("Metro Line 3");
    expect(updated.quantity).toBe(2);
  });

  it("rejects moving the requested start date before the requirement's own validity date", async () => {
    const service = buildService();
    const requirement = await service.createRequirement("user-1", RENTER_ORG_ID, baseInput);
    // baseInput's validityDate is 2026-02-15 — moving requestedStartDate to
    // 2026-02-01 (only field in the payload) must still be checked against
    // it, even though validityDate itself isn't part of this update.
    await expect(
      service.updateRequirement("user-1", RENTER_ORG_ID, requirement.id, {
        requestedStartDate: "2026-02-01",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects editing requirement fields once it is no longer open", async () => {
    const service = buildService();
    const requirement = await service.createRequirement("user-1", RENTER_ORG_ID, baseInput);
    await service.updateRequirementStatus("user-1", RENTER_ORG_ID, requirement.id, "closed");
    await expect(
      service.updateRequirement("user-1", RENTER_ORG_ID, requirement.id, { quantity: 3 }),
    ).rejects.toThrow(ConflictError);
  });

  it("hides a requirement edit for a different organization behind NotFoundError", async () => {
    const service = buildService();
    const requirement = await service.createRequirement("user-1", RENTER_ORG_ID, baseInput);
    await expect(
      service.updateRequirement("user-2", OTHER_RENTER_ORG_ID, requirement.id, { quantity: 3 }),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects an illegal requirement status transition", async () => {
    const service = buildService();
    const requirement = await service.createRequirement("user-1", RENTER_ORG_ID, baseInput);
    await service.updateRequirementStatus("user-1", RENTER_ORG_ID, requirement.id, "cancelled");
    await expect(
      service.updateRequirementStatus("user-1", RENTER_ORG_ID, requirement.id, "closed"),
    ).rejects.toThrow(ConflictError);
  });

  it("allows closing an open requirement", async () => {
    const service = buildService();
    const requirement = await service.createRequirement("user-1", RENTER_ORG_ID, baseInput);
    const closed = await service.updateRequirementStatus(
      "user-1",
      RENTER_ORG_ID,
      requirement.id,
      "closed",
    );
    expect(closed.status).toBe("closed");
  });

  it("lets a Rental Company discover open requirements broadcast by any Renter", async () => {
    const requirementRepository = fakeRequirementRepository();
    const service = new RequirementService(
      requirementRepository,
      fakeProductSubcategoryRepository(),
      fakePermissionService(),
      fakeProjectRepository(),
    );
    await service.createRequirement("user-1", RENTER_ORG_ID, baseInput);

    const rentalCompanyService = new RequirementService(
      requirementRepository,
      fakeProductSubcategoryRepository(),
      fakePermissionService("rental_company"),
      fakeProjectRepository(),
    );
    const discovered = await rentalCompanyService.discoverRequirements("user-2", RC_ORG_ID);
    expect(discovered).toHaveLength(1);
  });

  it("rejects discovery for a Renter organization (rfq.respond is Rental-Company-only)", async () => {
    const service = buildService();
    await expect(service.discoverRequirements("user-1", RENTER_ORG_ID)).rejects.toThrow(
      ForbiddenError,
    );
  });
});
