import { describe, expect, it } from "vitest";
import type {
  MembershipRepositoryPort,
  OrganizationRepositoryPort,
} from "../src/modules/organizations/domain/ports.js";
import type { RoleRepositoryPort } from "../src/modules/permissions/domain/ports.js";
import { AuthService } from "../src/modules/identity/application/auth-service.js";
import { hashPassword } from "../src/modules/identity/domain/password.js";
import type {
  SessionRepositoryPort,
  UserRecord,
  UserRepositoryPort,
} from "../src/modules/identity/domain/ports.js";
import { ForbiddenError, UnauthorizedError } from "../src/shared/errors.js";

const REAL_PASSWORD = "CorrectHorse123!";

function fakeUserRepository(users: UserRecord[]): UserRepositoryPort {
  return {
    findByEmail: async (email) => users.find((u) => u.email === email),
    findById: async (id) => users.find((u) => u.id === id),
    create: async () => {
      throw new Error("not used in this test");
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
    findWithTypeById: async () => {
      throw new Error("not used in this test");
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

function fakeMembershipRepository(): MembershipRepositoryPort {
  return {
    create: async () => {
      throw new Error("not used in this test");
    },
    listWithOrganizationByUserId: async () => [],
    findActiveMembership: async () => {
      throw new Error("not used in this test");
    },
    listByOrganization: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeRoleRepository(): RoleRepositoryPort {
  return {
    findByName: async () => {
      throw new Error("not used in this test");
    },
    hasPermission: async () => {
      throw new Error("not used in this test");
    },
    listPermissionCodesByRoleId: async () => [],
  };
}

async function buildService(users: UserRecord[]) {
  return new AuthService(
    fakeUserRepository(users),
    fakeSessionRepository(),
    fakeOrganizationRepository(),
    fakeMembershipRepository(),
    fakeRoleRepository(),
  );
}

describe("AuthService.login", () => {
  it("logs in with a correct password", async () => {
    const passwordHash = await hashPassword(REAL_PASSWORD);
    const service = await buildService([
      {
        id: "user-1",
        email: "owner@example.com",
        password_hash: passwordHash,
        display_name: "Owner",
        status: "active",
        created_at: new Date(),
      },
    ]);
    const result = await service.login({ email: "owner@example.com", password: REAL_PASSWORD });
    expect(result.user.email).toBe("owner@example.com");
  });

  it("rejects a wrong password", async () => {
    const passwordHash = await hashPassword(REAL_PASSWORD);
    const service = await buildService([
      {
        id: "user-1",
        email: "owner@example.com",
        password_hash: passwordHash,
        display_name: "Owner",
        status: "active",
        created_at: new Date(),
      },
    ]);
    await expect(
      service.login({ email: "owner@example.com", password: "wrong-password" }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("rejects a nonexistent email with the same error as a wrong password", async () => {
    const service = await buildService([]);
    await expect(
      service.login({ email: "nobody@example.com", password: REAL_PASSWORD }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("rejects a correct password for a suspended account", async () => {
    const passwordHash = await hashPassword(REAL_PASSWORD);
    const service = await buildService([
      {
        id: "user-1",
        email: "owner@example.com",
        password_hash: passwordHash,
        display_name: "Owner",
        status: "suspended",
        created_at: new Date(),
      },
    ]);
    await expect(
      service.login({ email: "owner@example.com", password: REAL_PASSWORD }),
    ).rejects.toThrow(ForbiddenError);
  });
});
