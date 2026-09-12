import { describe, expect, it } from "vitest";
import type { OrganizationTypeCode } from "@fleetip/contracts/organization";
import type {
  ActiveMembershipRecord,
  MembershipRepositoryPort,
  OrganizationRepositoryPort,
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
    listByOrganization: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeRoleRepository(): RoleRepositoryPort {
  return {
    findByName: async (name) =>
      name === "owner" ? { id: OWNER_ROLE_ID, name } : { id: MEMBER_ROLE_ID, name },
    hasPermission: async (roleId, permissionCode) =>
      roleId === OWNER_ROLE_ID &&
      (permissionCode === "organization.manage" || permissionCode === "equipment.manage"),
    listPermissionCodesByRoleId: async (roleId) =>
      roleId === OWNER_ROLE_ID ? ["organization.manage", "equipment.manage"] : [],
  };
}

// Defaults to rental_company — none of the existing tests care which type,
// since organization.manage/membership.manage apply to both; the dedicated
// org-type test below picks "renter" explicitly.
function fakeOrganizationRepository(
  organizationTypeCode: OrganizationTypeCode = "rental_company",
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
      name: "Test Org",
      code: "TESTORG",
      created_at: new Date(),
    }),
    codeExists: async () => {
      throw new Error("not used in this test");
    },
    listByType: async () => {
      throw new Error("not used in this test");
    },
  };
}

describe("PermissionService", () => {
  it("grants a permission the user's role has, in a joined organization", async () => {
    const membership = { id: "m1", status: "active", role_id: OWNER_ROLE_ID };
    const service = new PermissionService(
      fakeMembershipRepository(membership),
      fakeRoleRepository(),
      fakeOrganizationRepository(),
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
      fakeOrganizationRepository(),
    );

    await expect(service.hasPermission("user-2", "org-1", "organization.manage")).resolves.toBe(
      false,
    );
  });

  it("denies when the user has no active membership in that organization at all", async () => {
    const service = new PermissionService(
      fakeMembershipRepository(undefined),
      fakeRoleRepository(),
      fakeOrganizationRepository(),
    );

    await expect(service.hasPermission("user-3", "org-1", "organization.manage")).resolves.toBe(
      false,
    );
  });

  it("requirePermission throws ForbiddenError instead of returning false", async () => {
    const service = new PermissionService(
      fakeMembershipRepository(undefined),
      fakeRoleRepository(),
      fakeOrganizationRepository(),
    );

    await expect(service.requirePermission("user-4", "org-1", "membership.manage")).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("denies a permission the role would grant, when the organization's type isn't allowed to hold it", async () => {
    const membership = { id: "m5", status: "active", role_id: OWNER_ROLE_ID };
    const service = new PermissionService(
      fakeMembershipRepository(membership),
      fakeRoleRepository(),
      fakeOrganizationRepository("renter"),
    );

    // equipment.manage is rental_company-only (PERMISSION_ORGANIZATION_TYPES) —
    // the fake role repository would grant it, so this proves the org-type
    // check is a real, independent gate rather than piggybacking on the role check.
    await expect(service.hasPermission("user-5", "org-1", "equipment.manage")).resolves.toBe(false);
  });
});
