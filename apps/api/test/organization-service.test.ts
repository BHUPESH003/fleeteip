import { describe, expect, it } from "vitest";
import type { OrganizationTypeCode } from "@fleetip/contracts/organization";
import type {
  ActiveMembershipRecord,
  MembershipRecord,
  MembershipRepositoryPort,
  OrganizationMemberRow,
  OrganizationRepositoryPort,
} from "../src/modules/organizations/domain/ports.js";
import type { RoleRecord, RoleRepositoryPort } from "../src/modules/permissions/domain/ports.js";
import { PermissionService } from "../src/modules/permissions/application/permission-service.js";
import { OrganizationService } from "../src/modules/organizations/application/organization-service.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../src/shared/errors.js";

const OWNER_ROLE_ID = "role-owner";
const MEMBER_ROLE_ID = "role-member";
const RC_ORG_ID = "org-rental-company";
const OWNER_USER_ID = "user-owner";
const MEMBER_USER_ID = "user-member";

function fakePermissionService(organizationTypeCode: OrganizationTypeCode = "rental_company") {
  const membershipRepository: MembershipRepositoryPort = {
    findActiveMembership: async (userId): Promise<ActiveMembershipRecord | undefined> =>
      userId === OWNER_USER_ID
        ? { id: "membership-1", status: "active", role_id: OWNER_ROLE_ID }
        : undefined,
    create: async () => {
      throw new Error("not used in this test");
    },
    listWithOrganizationByUserId: async () => [],
    listByOrganization: async () => {
      throw new Error("not used in this test");
    },
    updateRole: async () => {
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
      roleId === OWNER_ROLE_ID ? ["organization.manage", "membership.manage"] : [],
  };
  return new PermissionService(
    membershipRepository,
    roleRepository,
    fakeOrganizationTypeRepository(organizationTypeCode),
  );
}

function fakeOrganizationTypeRepository(
  organizationTypeCode: OrganizationTypeCode,
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
    findWithTypeById: async (id) => ({
      id,
      organization_type_id: `type-${organizationTypeCode}`,
      organization_type_code: organizationTypeCode,
      name: "Apex Equipment Rentals",
      code: "APEX",
      status: "active",
      created_at: new Date(),
    }),
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

function fakeMembershipRepository(extraMembers: OrganizationMemberRow[] = []): MembershipRepositoryPort {
  const members: OrganizationMemberRow[] = [
    {
      id: "membership-1",
      user_id: OWNER_USER_ID,
      email: "owner@apex.example",
      display_name: "Apex Owner",
      role_id: OWNER_ROLE_ID,
      role_name: "owner",
      status: "active",
      created_at: new Date(),
    },
    ...extraMembers,
  ];
  let nextId = members.length + 1;
  return {
    create: async (input) => {
      const record: MembershipRecord = {
        id: `membership-${nextId++}`,
        user_id: input.userId,
        organization_id: input.organizationId,
        role_id: input.roleId,
        status: input.status,
        created_at: new Date(),
      };
      return record;
    },
    listWithOrganizationByUserId: async () => [],
    findActiveMembership: async (userId, organizationId) => {
      const member = members.find((m) => m.user_id === userId);
      if (!member || organizationId !== RC_ORG_ID) return undefined;
      return { id: member.id, status: member.status, role_id: member.role_id };
    },
    listByOrganization: async () => members,
    updateRole: async (membershipId, roleId) => {
      const member = members.find((m) => m.id === membershipId);
      if (!member) throw new Error("membership not found in this test's fake data");
      member.role_id = roleId;
      return {
        id: member.id,
        user_id: member.user_id,
        organization_id: RC_ORG_ID,
        role_id: roleId,
        status: member.status,
        created_at: member.created_at,
      };
    },
  };
}

// Stateful: the organization's own "member" role plus the built-in "owner"
// role, supporting real create/update/delete round-trips — this is what
// OrganizationService's role-management methods are actually exercised
// against below, not just a type-satisfying stub.
function fakeRoleRepository(): RoleRepositoryPort {
  const roles: RoleRecord[] = [
    { id: OWNER_ROLE_ID, name: "owner", organization_id: null },
    { id: MEMBER_ROLE_ID, name: "member", organization_id: RC_ORG_ID },
  ];
  const permissionsByRoleId: Record<string, string[]> = {
    [OWNER_ROLE_ID]: ["organization.manage", "membership.manage", "equipment.manage", "rental.manage"],
    [MEMBER_ROLE_ID]: [],
  };
  let nextId = 3;
  return {
    findByName: async (name) => roles.find((r) => r.name === name && r.organization_id === null),
    findById: async (id) => roles.find((r) => r.id === id),
    listForOrganization: async (organizationId) =>
      roles.filter((r) => r.organization_id === null || r.organization_id === organizationId),
    create: async (input) => {
      const role: RoleRecord = { id: `role-${nextId++}`, name: input.name, organization_id: input.organizationId };
      roles.push(role);
      permissionsByRoleId[role.id] = input.permissionCodes;
      return role;
    },
    update: async (id, input) => {
      const role = roles.find((r) => r.id === id);
      if (!role) throw new Error("role not found in this test's fake data");
      role.name = input.name;
      permissionsByRoleId[id] = input.permissionCodes;
      return role;
    },
    delete: async (id) => {
      const index = roles.findIndex((r) => r.id === id);
      if (index !== -1) roles.splice(index, 1);
      delete permissionsByRoleId[id];
    },
    hasPermission: async (roleId, code) => (permissionsByRoleId[roleId] ?? []).includes(code),
    listPermissionCodesByRoleId: async (roleId) => permissionsByRoleId[roleId] ?? [],
  };
}

function buildService(organizationTypeCode: OrganizationTypeCode = "rental_company") {
  return new OrganizationService(
    fakeOrganizationTypeRepository(organizationTypeCode),
    fakeMembershipRepository(),
    fakeRoleRepository(),
    fakePermissionService(organizationTypeCode),
  );
}

describe("OrganizationService", () => {
  it("returns the caller's own organization profile", async () => {
    const service = buildService();
    const organization = await service.getOrganization(OWNER_USER_ID, RC_ORG_ID);
    expect(organization.name).toBe("Apex Equipment Rentals");
  });

  it("rejects reading an organization's profile without organization.manage", async () => {
    const service = buildService();
    await expect(service.getOrganization("user-outsider", RC_ORG_ID)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("lists the organization's members", async () => {
    const service = buildService();
    const members = await service.listMembers(OWNER_USER_ID, RC_ORG_ID);
    expect(members).toHaveLength(1);
    expect(members[0]?.email).toBe("owner@apex.example");
    expect(members[0]?.roleName).toBe("owner");
  });

  it("rejects membership management for a caller without membership.manage", async () => {
    const service = buildService();
    await expect(service.listMembers("user-outsider", RC_ORG_ID)).rejects.toThrow(ForbiddenError);
  });

  it("lists the built-in owner role plus the organization's own member role", async () => {
    const service = buildService("rental_company");
    const roles = await service.listRolesAndPermissions(OWNER_USER_ID, RC_ORG_ID);
    const owner = roles.find((r) => r.roleName === "owner");
    const member = roles.find((r) => r.roleName === "member");
    expect(owner?.isBuiltin).toBe(true);
    expect(owner?.permissions).toContain("equipment.manage");
    // organization.manage/membership.manage apply to both org types, so
    // they remain even after the org-type filter.
    expect(owner?.permissions).toContain("organization.manage");
    expect(member?.isBuiltin).toBe(false);
    expect(member?.permissions).toEqual([]);
  });

  it("creates a custom role with the requested permissions", async () => {
    const service = buildService();
    const role = await service.createRole(OWNER_USER_ID, RC_ORG_ID, {
      name: "Dispatcher",
      permissions: ["rental.manage"],
    });
    expect(role.isBuiltin).toBe(false);
    expect(role.permissions).toEqual(["rental.manage"]);

    const roles = await service.listRolesAndPermissions(OWNER_USER_ID, RC_ORG_ID);
    expect(roles.some((r) => r.roleName === "Dispatcher")).toBe(true);
  });

  it("rejects creating a role with a permission that doesn't apply to this organization type", async () => {
    const service = buildService("renter");
    // equipment.manage is rental_company-only.
    await expect(
      service.createRole(OWNER_USER_ID, RC_ORG_ID, { name: "Bad Role", permissions: ["equipment.manage"] }),
    ).rejects.toThrow(ValidationError);
  });

  it("edits an existing custom role's name and permissions", async () => {
    const service = buildService();
    const updated = await service.updateRole(OWNER_USER_ID, RC_ORG_ID, MEMBER_ROLE_ID, {
      name: "Field Member",
      permissions: ["rental.manage"],
    });
    expect(updated.roleName).toBe("Field Member");
    expect(updated.permissions).toEqual(["rental.manage"]);
  });

  it("rejects editing the built-in owner role", async () => {
    const service = buildService();
    await expect(
      service.updateRole(OWNER_USER_ID, RC_ORG_ID, OWNER_ROLE_ID, {
        name: "Super Owner",
        permissions: [],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("deletes a custom role", async () => {
    const service = buildService();
    await service.deleteRole(OWNER_USER_ID, RC_ORG_ID, MEMBER_ROLE_ID);
    const roles = await service.listRolesAndPermissions(OWNER_USER_ID, RC_ORG_ID);
    expect(roles.some((r) => r.id === MEMBER_ROLE_ID)).toBe(false);
  });

  it("rejects deleting the built-in owner role", async () => {
    const service = buildService();
    await expect(service.deleteRole(OWNER_USER_ID, RC_ORG_ID, OWNER_ROLE_ID)).rejects.toThrow(
      ValidationError,
    );
  });

  it("moves a member onto a different role of the same organization", async () => {
    const service = new OrganizationService(
      fakeOrganizationTypeRepository("rental_company"),
      fakeMembershipRepository([
        {
          id: "membership-2",
          user_id: MEMBER_USER_ID,
          email: "member@apex.example",
          display_name: "Apex Member",
          role_id: MEMBER_ROLE_ID,
          role_name: "member",
          status: "active",
          created_at: new Date(),
        },
      ]),
      fakeRoleRepository(),
      fakePermissionService("rental_company"),
    );

    const updated = await service.updateMemberRole(OWNER_USER_ID, RC_ORG_ID, "membership-2", OWNER_ROLE_ID);
    expect(updated.roleId).toBe(OWNER_ROLE_ID);
    expect(updated.roleName).toBe("owner");
  });

  it("rejects demoting the organization's only active owner", async () => {
    const service = buildService();
    await expect(
      service.updateMemberRole(OWNER_USER_ID, RC_ORG_ID, "membership-1", MEMBER_ROLE_ID),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects moving a member onto an unknown role", async () => {
    const service = buildService();
    await expect(
      service.updateMemberRole(OWNER_USER_ID, RC_ORG_ID, "membership-1", "role-does-not-exist"),
    ).rejects.toThrow(NotFoundError);
  });
});
