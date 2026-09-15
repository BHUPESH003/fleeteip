import { describe, expect, it } from "vitest";
import type { OrganizationTypeCode } from "@fleetip/contracts/organization";
import type { ProjectStatus } from "@fleetip/contracts/project";
import type {
  ActiveMembershipRecord,
  MembershipRepositoryPort,
  OrganizationRepositoryPort,
} from "../src/modules/organizations/domain/ports.js";
import type { RoleRepositoryPort } from "../src/modules/permissions/domain/ports.js";
import { PermissionService } from "../src/modules/permissions/application/permission-service.js";
import type {
  CreateProjectInput,
  ProjectRecord,
  ProjectRepositoryPort,
} from "../src/modules/marketplace/project/domain/ports.js";
import { ProjectService } from "../src/modules/marketplace/project/application/project-service.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../src/shared/errors.js";

const OWNER_ROLE_ID = "role-owner";
const RENTER_ORG_ID = "org-renter";
const OTHER_RENTER_ORG_ID = "org-other-renter";
const RC_ORG_ID = "org-rental-company";

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
      roleId === OWNER_ROLE_ID ? ["project.manage"] : [],
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

function fakeProjectRepository(): ProjectRepositoryPort {
  const projects = new Map<string, ProjectRecord>();
  let nextId = 1;
  const sequences = new Map<string, number>();

  return {
    nextReferenceNumber: async (renterOrganizationId) => {
      const next = (sequences.get(renterOrganizationId) ?? 1) + 1;
      sequences.set(renterOrganizationId, next);
      return `PRJ-2026-${next - 1}`;
    },
    create: async (input: CreateProjectInput) => {
      const record: ProjectRecord = {
        id: `project-${nextId++}`,
        renter_organization_id: input.renterOrganizationId,
        project_code: input.projectCode,
        project_type: input.projectType,
        project_name: input.projectName,
        site_location: input.siteLocation,
        state: input.state ?? null,
        district: input.district ?? null,
        start_date: input.startDate,
        end_date: input.endDate ?? null,
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      };
      projects.set(record.id, record);
      return record;
    },
    findById: async (id) => projects.get(id),
    listByRenter: async (renterOrganizationId) =>
      [...projects.values()].filter((p) => p.renter_organization_id === renterOrganizationId),
    updateStatus: async (id: string, status: ProjectStatus) => {
      const existing = projects.get(id);
      if (!existing) throw new Error("not used in this test");
      const updated = { ...existing, status, updated_at: new Date() };
      projects.set(id, updated);
      return updated;
    },
    updateFields: async (id, updates) => {
      const existing = projects.get(id);
      if (!existing) throw new Error("not used in this test");
      const updated: ProjectRecord = {
        ...existing,
        ...(updates.projectType !== undefined && { project_type: updates.projectType }),
        ...(updates.projectName !== undefined && { project_name: updates.projectName }),
        ...(updates.siteLocation !== undefined && { site_location: updates.siteLocation }),
        ...(updates.state !== undefined && { state: updates.state }),
        ...(updates.district !== undefined && { district: updates.district }),
        ...(updates.startDate !== undefined && { start_date: updates.startDate }),
        ...(updates.endDate !== undefined && { end_date: updates.endDate }),
        updated_at: new Date(),
      };
      projects.set(id, updated);
      return updated;
    },
    search: async () => {
      throw new Error("not used in this test");
    },
  };
}

function buildService() {
  return new ProjectService(fakeProjectRepository(), fakePermissionService());
}

const baseInput = {
  projectType: "Urban Infra",
  projectName: "Metro Line 3 Viaduct",
  siteLocation: "Sector 62, Noida",
  startDate: "2026-03-01",
};

describe("ProjectService", () => {
  it("creates an active project with a generated project code", async () => {
    const service = buildService();
    const project = await service.createProject("user-1", RENTER_ORG_ID, baseInput);
    expect(project.status).toBe("active");
    expect(project.renterOrganizationId).toBe(RENTER_ORG_ID);
    expect(project.projectCode).toMatch(/^PRJ-\d{4}-\d+$/);
  });

  it("rejects project management for a Rental Company organization", async () => {
    const service = new ProjectService(fakeProjectRepository(), fakePermissionService("rental_company"));
    await expect(service.createProject("user-1", RENTER_ORG_ID, baseInput)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("hides a project belonging to a different organization behind NotFoundError", async () => {
    const service = buildService();
    const project = await service.createProject("user-1", RENTER_ORG_ID, baseInput);
    await expect(service.getProject("user-2", OTHER_RENTER_ORG_ID, project.id)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("lists projects only for the acting organization", async () => {
    const service = buildService();
    await service.createProject("user-1", RENTER_ORG_ID, baseInput);
    const list = await service.listProjects("user-1", RENTER_ORG_ID);
    expect(list).toHaveLength(1);
  });

  it("allows editing fields while a project is active", async () => {
    const service = buildService();
    const project = await service.createProject("user-1", RENTER_ORG_ID, baseInput);
    const updated = await service.updateProject("user-1", RENTER_ORG_ID, project.id, {
      siteLocation: "Sector 63, Noida",
    });
    expect(updated.siteLocation).toBe("Sector 63, Noida");
  });

  it("rejects moving the start date past the project's own end date", async () => {
    const service = buildService();
    const project = await service.createProject("user-1", RENTER_ORG_ID, {
      ...baseInput,
      endDate: "2026-04-01",
    });
    // endDate isn't part of this update at all — it must still be checked
    // against the persisted value.
    await expect(
      service.updateProject("user-1", RENTER_ORG_ID, project.id, { startDate: "2026-05-01" }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects editing project fields once it is no longer active", async () => {
    const service = buildService();
    const project = await service.createProject("user-1", RENTER_ORG_ID, baseInput);
    await service.updateProjectStatus("user-1", RENTER_ORG_ID, project.id, "completed");
    await expect(
      service.updateProject("user-1", RENTER_ORG_ID, project.id, { siteLocation: "Elsewhere" }),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects an illegal project status transition", async () => {
    const service = buildService();
    const project = await service.createProject("user-1", RENTER_ORG_ID, baseInput);
    await service.updateProjectStatus("user-1", RENTER_ORG_ID, project.id, "cancelled");
    await expect(
      service.updateProjectStatus("user-1", RENTER_ORG_ID, project.id, "completed"),
    ).rejects.toThrow(ConflictError);
  });

  it("allows completing an active project", async () => {
    const service = buildService();
    const project = await service.createProject("user-1", RENTER_ORG_ID, baseInput);
    const completed = await service.updateProjectStatus(
      "user-1",
      RENTER_ORG_ID,
      project.id,
      "completed",
    );
    expect(completed.status).toBe("completed");
  });
});
