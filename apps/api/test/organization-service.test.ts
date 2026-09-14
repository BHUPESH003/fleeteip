import { describe, expect, it } from "vitest";
import type { OrganizationTypeCode } from "@fleetip/contracts/organization";
import type {
  ActiveMembershipRecord,
  MembershipRecord,
  MembershipRepositoryPort,
  OrganizationMemberRow,
  OrganizationRepositoryPort,
} from "../src/modules/organizations/domain/ports.js";
import type { RoleRepositoryPort } from "../src/modules/permissions/domain/ports.js";
import { PermissionService } from "../src/modules/permissions/application/permission-service.js";
import type { UserRecord, UserRepositoryPort } from "../src/modules/identity/domain/ports.js";
import { OrganizationService } from "../src/modules/organizations/application/organization-service.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../src/shared/errors.js";

const OWNER_ROLE_ID = "role-owner";
const MEMBER_ROLE_ID = "role-member";
const RC_ORG_ID = "org-rental-company";
const OWNER_USER_ID = "user-owner";

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
  };
  const roleRepository: RoleRepositoryPort = {
    findByName: async (name) => ({ id: OWNER_ROLE_ID, name }),
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

function fakeMembershipRepository(): MembershipRepositoryPort {
  const members: OrganizationMemberRow[] = [
    {
      id: "membership-1",
      user_id: OWNER_USER_ID,
      email: "owner@apex.example",
      display_name: "Apex Owner",
      role_name: "owner",
      status: "active",
      created_at: new Date(),
    },
  ];
  let nextId = 2;
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
      return { id: member.id, status: member.status, role_id: OWNER_ROLE_ID };
    },
    listByOrganization: async () => members,
  };
}

function fakeUserRepository(): UserRepositoryPort {
  const users: UserRecord[] = [
    {
      id: OWNER_USER_ID,
      email: "owner@apex.example",
      password_hash: "hashed",
      display_name: "Apex Owner",
      status: "active",
      created_at: new Date(),
    },
    {
      id: "user-new",
      email: "new.member@apex.example",
      password_hash: "hashed",
      display_name: "New Member",
      status: "active",
      created_at: new Date(),
    },
  ];
  return {
    findByEmail: async (email) => users.find((u) => u.email === email),
    findById: async (id) => users.find((u) => u.id === id),
    listAllForPlatformAdmin: async () => {
      throw new Error("not used in this test");
    },
    updateStatus: async () => {
      throw new Error("not used in this test");
    },
    create: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeRoleRepository(): RoleRepositoryPort {
  return {
    findByName: async (name) => ({ id: name === "owner" ? OWNER_ROLE_ID : MEMBER_ROLE_ID, name }),
    hasPermission: async (roleId) => roleId === OWNER_ROLE_ID,
    listPermissionCodesByRoleId: async (roleId) =>
      roleId === OWNER_ROLE_ID
        ? ["organization.manage", "membership.manage", "equipment.manage", "rental.manage"]
        : [],
  };
}

function buildService(organizationTypeCode: OrganizationTypeCode = "rental_company") {
  return new OrganizationService(
    fakeOrganizationTypeRepository(organizationTypeCode),
    fakeMembershipRepository(),
    fakeRoleRepository(),
    fakeUserRepository(),
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

  it("invites an existing FleetIP user by email as a new member", async () => {
    const service = buildService();
    const member = await service.inviteMember(OWNER_USER_ID, RC_ORG_ID, {
      email: "new.member@apex.example",
      roleName: "member",
    });
    expect(member.status).toBe("invited");
    expect(member.displayName).toBe("New Member");
  });

  it("rejects inviting an email with no FleetIP account", async () => {
    const service = buildService();
    await expect(
      service.inviteMember(OWNER_USER_ID, RC_ORG_ID, {
        email: "nobody@example.com",
        roleName: "member",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects inviting a user who is already an active member", async () => {
    const service = buildService();
    await expect(
      service.inviteMember(OWNER_USER_ID, RC_ORG_ID, {
        email: "owner@apex.example",
        roleName: "member",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("lists roles filtered to the caller's own organization type's permissions", async () => {
    const service = buildService("rental_company");
    const roles = await service.listRolesAndPermissions(OWNER_USER_ID, RC_ORG_ID);
    const owner = roles.find((r) => r.roleName === "owner");
    expect(owner?.permissions).toContain("equipment.manage");
    // organization.manage/membership.manage apply to both org types, so
    // they remain even after the org-type filter.
    expect(owner?.permissions).toContain("organization.manage");
  });

  it("rejects membership management for a caller without membership.manage", async () => {
    const service = buildService();
    await expect(service.listMembers("user-outsider", RC_ORG_ID)).rejects.toThrow(ForbiddenError);
  });
});
