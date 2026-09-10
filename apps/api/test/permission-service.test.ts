import { describe, expect, it } from "vitest";
import type {
  ActiveMembershipRecord,
  MembershipRepositoryPort,
} from "../src/modules/organizations/domain/ports.js";
import type { RoleRepositoryPort } from "../src/modules/permissions/domain/ports.js";
import { PermissionService } from "../src/modules/permissions/application/permission-service.js";
import { ForbiddenError } from "../src/shared/errors.js";

const OWNER_ROLE_ID = "role-owner";
const MEMBER_ROLE_ID = "role-member";

function fakeMembershipRepository(
  membership: ActiveMembershipRecord | undefined,
): MembershipRepositoryPort {
  return {
    findActiveMembership: async () => membership,
    create: async () => {
      throw new Error("not used in this test");
    },
    listWithOrganizationByUserId: async () => [],
  };
}

function fakeRoleRepository(): RoleRepositoryPort {
  return {
    findByName: async (name) =>
      name === "owner" ? { id: OWNER_ROLE_ID, name } : { id: MEMBER_ROLE_ID, name },
    hasPermission: async (roleId, permissionCode) =>
      roleId === OWNER_ROLE_ID && permissionCode === "organization.manage",
    listPermissionCodesByRoleId: async (roleId) =>
      roleId === OWNER_ROLE_ID ? ["organization.manage"] : [],
  };
}

describe("PermissionService", () => {
  it("grants a permission the user's role has, in a joined organization", async () => {
    const membership = { id: "m1", status: "active", role_id: OWNER_ROLE_ID };
    const service = new PermissionService(
      fakeMembershipRepository(membership),
      fakeRoleRepository(),
    );

    await expect(service.hasPermission("user-1", "org-1", "organization.manage")).resolves.toBe(
      true,
    );
  });

  it("denies a permission the user's role does not have", async () => {
    const membership = { id: "m2", status: "active", role_id: MEMBER_ROLE_ID };
    const service = new PermissionService(
      fakeMembershipRepository(membership),
      fakeRoleRepository(),
    );

    await expect(service.hasPermission("user-2", "org-1", "organization.manage")).resolves.toBe(
      false,
    );
  });

  it("denies when the user has no active membership in that organization at all", async () => {
    const service = new PermissionService(
      fakeMembershipRepository(undefined),
      fakeRoleRepository(),
    );

    await expect(service.hasPermission("user-3", "org-1", "organization.manage")).resolves.toBe(
      false,
    );
  });

  it("requirePermission throws ForbiddenError instead of returning false", async () => {
    const service = new PermissionService(
      fakeMembershipRepository(undefined),
      fakeRoleRepository(),
    );

    await expect(service.requirePermission("user-4", "org-1", "membership.manage")).rejects.toThrow(
      ForbiddenError,
    );
  });
});
