import { describe, expect, it } from "vitest";
import type {
  InviteRepositoryPort,
  MembershipRecord,
  MembershipRepositoryPort,
  OrganizationInviteRecord,
  OrganizationRepositoryPort,
} from "../src/modules/organizations/domain/ports.js";
import type { RoleRepositoryPort } from "../src/modules/permissions/domain/ports.js";
import { PermissionService } from "../src/modules/permissions/application/permission-service.js";
import { AuthService } from "../src/modules/identity/application/auth-service.js";
import type {
  SessionRepositoryPort,
  UserRecord,
  UserRepositoryPort,
} from "../src/modules/identity/domain/ports.js";
import { InviteService } from "../src/modules/organizations/application/invite-service.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../src/shared/errors.js";

const ORG_ID = "org-rental-company";
const OWNER_USER_ID = "user-owner";
const OWNER_ROLE_ID = "role-owner";
const MEMBER_ROLE_ID = "role-member";
const WEB_ORIGIN = "https://app.fleetip.example";

function fakeInviteRepository(invites: OrganizationInviteRecord[]): InviteRepositoryPort {
  return {
    create: async (input) => {
      const record: OrganizationInviteRecord = {
        id: `invite-${invites.length + 1}`,
        organization_id: input.organizationId,
        role_id: input.roleId,
        token_hash: input.tokenHash,
        invited_by_user_id: input.invitedByUserId,
        status: "pending",
        expires_at: input.expiresAt,
        accepted_by_user_id: null,
        created_at: new Date(),
      };
      invites.push(record);
      return record;
    },
    findByTokenHash: async (tokenHash) => invites.find((i) => i.token_hash === tokenHash),
    findWithContextByTokenHash: async (tokenHash) => {
      const invite = invites.find((i) => i.token_hash === tokenHash);
      if (!invite) return undefined;
      return {
        id: invite.id,
        organization_id: invite.organization_id,
        organization_name: "Apex Equipment Rentals",
        organization_type_code: "rental_company",
        role_id: invite.role_id,
        role_name: invite.role_id === OWNER_ROLE_ID ? "owner" : "member",
        status: invite.status,
        expires_at: invite.expires_at,
      };
    },
    markAccepted: async (id, acceptedByUserId) => {
      const invite = invites.find((i) => i.id === id);
      if (!invite) throw new Error("invite not found");
      invite.status = "accepted";
      invite.accepted_by_user_id = acceptedByUserId;
      return invite;
    },
  };
}

function fakeMembershipRepository(activeMembers: Set<string>): MembershipRepositoryPort {
  const created: MembershipRecord[] = [];
  return {
    create: async (input) => {
      const record: MembershipRecord = {
        id: `membership-${created.length + 1}`,
        user_id: input.userId,
        organization_id: input.organizationId,
        role_id: input.roleId,
        status: input.status,
        created_at: new Date(),
      };
      created.push(record);
      activeMembers.add(`${input.userId}:${input.organizationId}`);
      return record;
    },
    listWithOrganizationByUserId: async () => [],
    findActiveMembership: async (userId, organizationId) =>
      activeMembers.has(`${userId}:${organizationId}`)
        ? { id: "membership-existing", status: "active", role_id: OWNER_ROLE_ID }
        : undefined,
    listByOrganization: async () => [],
  };
}

function fakeRoleRepository(): RoleRepositoryPort {
  return {
    findByName: async (name) => ({ id: name === "owner" ? OWNER_ROLE_ID : MEMBER_ROLE_ID, name }),
    hasPermission: async (roleId) => roleId === OWNER_ROLE_ID,
    listPermissionCodesByRoleId: async (roleId) =>
      roleId === OWNER_ROLE_ID ? ["organization.manage", "membership.manage"] : [],
  };
}

function fakeOrganizationRepository(): OrganizationRepositoryPort {
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
      organization_type_id: "type-rental_company",
      organization_type_code: "rental_company",
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

function fakeUserRepository(users: UserRecord[]): UserRepositoryPort {
  let nextId = users.length + 1;
  return {
    findByEmail: async (email) => users.find((u) => u.email === email),
    findById: async (id) => users.find((u) => u.id === id),
    create: async (input) => {
      const record: UserRecord = {
        id: `user-${nextId++}`,
        email: input.email,
        password_hash: input.passwordHash,
        display_name: input.displayName,
        status: "active",
        created_at: new Date(),
      };
      users.push(record);
      return record;
    },
    listAllForPlatformAdmin: async () => {
      throw new Error("not used in this test");
    },
    updateStatus: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeSessionRepository(): SessionRepositoryPort {
  return {
    create: async (input) => ({ id: "session-1", user_id: input.userId, expires_at: input.expiresAt }),
    findActiveByTokenHash: async () => {
      throw new Error("not used in this test");
    },
    deleteByTokenHash: async () => {
      throw new Error("not used in this test");
    },
  };
}

function buildService(
  options: {
    invites?: OrganizationInviteRecord[];
    activeMembers?: Set<string>;
    users?: UserRecord[];
  } = {},
) {
  const invites = options.invites ?? [];
  const activeMembers = options.activeMembers ?? new Set([`${OWNER_USER_ID}:${ORG_ID}`]);
  const users = options.users ?? [];

  const inviteRepository = fakeInviteRepository(invites);
  const membershipRepository = fakeMembershipRepository(activeMembers);
  const roleRepository = fakeRoleRepository();
  const organizationRepository = fakeOrganizationRepository();
  const permissionService = new PermissionService(
    membershipRepository,
    roleRepository,
    organizationRepository,
  );
  const authService = new AuthService(
    fakeUserRepository(users),
    fakeSessionRepository(),
    organizationRepository,
    membershipRepository,
    roleRepository,
  );

  const inviteService = new InviteService(
    inviteRepository,
    membershipRepository,
    roleRepository,
    permissionService,
    authService,
    WEB_ORIGIN,
  );

  return { inviteService, invites, activeMembers, users };
}

describe("InviteService.createInvite", () => {
  it("creates a pending, shareable invite for a caller with membership.manage", async () => {
    const { inviteService, invites } = buildService();
    const result = await inviteService.createInvite(OWNER_USER_ID, ORG_ID, "member");
    expect(result.invite.status).toBe("pending");
    expect(result.invite.roleName).toBe("member");
    expect(result.link).toBe(`${WEB_ORIGIN}/invite/${result.token}`);
    expect(invites).toHaveLength(1);
  });

  it("rejects a caller without membership.manage", async () => {
    const { inviteService } = buildService({ activeMembers: new Set() });
    await expect(inviteService.createInvite(OWNER_USER_ID, ORG_ID, "member")).rejects.toThrow(
      ForbiddenError,
    );
  });
});

describe("InviteService.getPreview", () => {
  it("returns organization/role context for a pending invite", async () => {
    const { inviteService } = buildService();
    const { token } = await inviteService.createInvite(OWNER_USER_ID, ORG_ID, "member");
    const preview = await inviteService.getPreview(token);
    expect(preview).toEqual({
      organizationName: "Apex Equipment Rentals",
      organizationTypeCode: "rental_company",
      roleName: "member",
      status: "pending",
      expired: false,
    });
  });

  it("flags an expired invite instead of hiding it", async () => {
    const { inviteService, invites } = buildService();
    const { token } = await inviteService.createInvite(OWNER_USER_ID, ORG_ID, "member");
    invites[0]!.expires_at = new Date(Date.now() - 1000);
    const preview = await inviteService.getPreview(token);
    expect(preview.expired).toBe(true);
  });

  it("rejects an unknown token", async () => {
    const { inviteService } = buildService();
    await expect(inviteService.getPreview("bogus-token")).rejects.toThrow(NotFoundError);
  });
});

describe("InviteService.accept", () => {
  it("creates a brand-new account and an active membership, without a redundant organization", async () => {
    const { inviteService, users, activeMembers } = buildService();
    const { token } = await inviteService.createInvite(OWNER_USER_ID, ORG_ID, "member");

    const result = await inviteService.accept(token, {
      newAccount: {
        email: "new.member@apex.example",
        password: "CorrectHorse123!",
        displayName: "New Member",
      },
    });

    expect(result.authResult?.user.email).toBe("new.member@apex.example");
    expect(result.organizationId).toBe(ORG_ID);
    expect(result.roleName).toBe("member");
    expect(users).toHaveLength(1);
    expect(activeMembers.has(`${result.authResult!.user.id}:${ORG_ID}`)).toBe(true);
  });

  it("accepts for an already logged-in existing user, issuing no new session", async () => {
    const { inviteService, activeMembers } = buildService();
    const { token } = await inviteService.createInvite(OWNER_USER_ID, ORG_ID, "member");

    const result = await inviteService.accept(token, { existingUserId: "user-existing" });

    expect(result.authResult).toBeNull();
    expect(activeMembers.has(`user-existing:${ORG_ID}`)).toBe(true);
  });

  it("rejects a new-account accept missing required fields", async () => {
    const { inviteService } = buildService();
    const { token } = await inviteService.createInvite(OWNER_USER_ID, ORG_ID, "member");
    await expect(
      inviteService.accept(token, { newAccount: { email: "", password: "", displayName: "" } }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects an unknown token", async () => {
    const { inviteService } = buildService();
    await expect(
      inviteService.accept("bogus-token", { existingUserId: "user-existing" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects accepting an already-accepted invite", async () => {
    const { inviteService } = buildService();
    const { token } = await inviteService.createInvite(OWNER_USER_ID, ORG_ID, "member");
    await inviteService.accept(token, { existingUserId: "user-first" });

    await expect(
      inviteService.accept(token, { existingUserId: "user-second" }),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects accepting an expired invite", async () => {
    const { inviteService, invites } = buildService();
    const { token } = await inviteService.createInvite(OWNER_USER_ID, ORG_ID, "member");
    invites[0]!.expires_at = new Date(Date.now() - 1000);

    await expect(
      inviteService.accept(token, { existingUserId: "user-existing" }),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects a user who already belongs to the organization", async () => {
    const { inviteService } = buildService();
    const { token } = await inviteService.createInvite(OWNER_USER_ID, ORG_ID, "member");

    await expect(
      inviteService.accept(token, { existingUserId: OWNER_USER_ID }),
    ).rejects.toThrow(ConflictError);
  });
});
