import { describe, expect, it } from "vitest";
import { AuthService } from "../src/modules/identity/application/auth-service.js";
import { hashPassword, verifyPassword } from "../src/modules/identity/domain/password.js";
import type {
  SessionListRecord,
  SessionRecord,
  SessionRepositoryPort,
  UserRecord,
  UserRepositoryPort,
} from "../src/modules/identity/domain/ports.js";
import { hashSessionToken } from "../src/modules/identity/domain/session-token.js";
import { NotFoundError, ValidationError } from "../src/shared/errors.js";

const OLD_PASSWORD = "OldPassword123!";
const NEW_PASSWORD = "NewPassword456!";

type Row = SessionRecord & SessionListRecord & { token_hash: string };

async function setup() {
  const user: UserRecord = {
    id: "user-1",
    email: "owner@example.com",
    password_hash: await hashPassword(OLD_PASSWORD),
    display_name: "Owner",
    status: "active",
    created_at: new Date(),
  };
  const future = new Date(Date.now() + 86_400_000);
  const sessions: Row[] = [
    { id: "s-current", user_id: "user-1", token_hash: hashSessionToken("tok-current"), expires_at: future, created_at: new Date(), last_seen_at: new Date(), user_agent: "Firefox" },
    { id: "s-other", user_id: "user-1", token_hash: hashSessionToken("tok-other"), expires_at: future, created_at: new Date(), last_seen_at: new Date(Date.now() - 3_600_000), user_agent: null },
    { id: "s-stranger", user_id: "user-2", token_hash: hashSessionToken("tok-stranger"), expires_at: future, created_at: new Date(), last_seen_at: new Date(), user_agent: null },
  ];
  const touched: string[] = [];

  const userRepository: UserRepositoryPort = {
    findByEmail: async () => user,
    findById: async (id) => (id === user.id ? user : undefined),
    create: async () => {
      throw new Error("not used");
    },
    listAllForPlatformAdmin: async () => [],
    updateStatus: async () => user,
    findPasswordHashById: async (id) => (id === user.id ? user.password_hash : undefined),
    updatePasswordHash: async (_id, hash) => {
      user.password_hash = hash;
    },
  };
  const remove = (keep: (row: Row) => boolean) => {
    const kept = sessions.filter(keep);
    const removed = sessions.length - kept.length;
    sessions.splice(0, sessions.length, ...kept);
    return removed;
  };
  const sessionRepository: SessionRepositoryPort = {
    create: async () => {
      throw new Error("not used");
    },
    findActiveByTokenHash: async (hash) => sessions.find((s) => s.token_hash === hash),
    deleteByTokenHash: async () => undefined,
    deleteByUserId: async () => undefined,
    touch: async (id) => void touched.push(id),
    listActiveByUserId: async (userId) => sessions.filter((s) => s.user_id === userId),
    deleteByIdForUser: async (id, userId) => remove((s) => !(s.id === id && s.user_id === userId)) > 0,
    deleteOthersForUser: async (userId, keep) => remove((s) => s.user_id !== userId || s.id === keep),
  };
  const service = new AuthService(userRepository, sessionRepository, {} as never, {} as never, {} as never);
  const current = { sessionId: "s-current", userId: "user-1" };
  return { service, user, sessions, touched, current };
}

describe("signed-in password change and session management", () => {
  it("rejects a wrong current password as a field error and changes nothing", async () => {
    const { service, user, sessions, current } = await setup();
    const before = user.password_hash;
    const error = await service
      .changePassword(current, { currentPassword: "wrong", newPassword: NEW_PASSWORD })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).issues[0]?.path).toBe("currentPassword");
    expect(user.password_hash).toBe(before);
    expect(sessions).toHaveLength(3);
  });

  it("changes the password and signs out only the user's other sessions", async () => {
    const { service, user, sessions, current } = await setup();
    await service.changePassword(current, { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD });
    expect(await verifyPassword(NEW_PASSWORD, user.password_hash)).toBe(true);
    expect(sessions.map((s) => s.id)).toEqual(["s-current", "s-stranger"]);
  });

  it("lists own sessions with the current one flagged and no token data", async () => {
    const { service, current } = await setup();
    const { sessions } = await service.listSessions(current);
    expect(sessions.map((s) => [s.id, s.current])).toEqual([
      ["s-current", true],
      ["s-other", false],
    ]);
    expect(Object.keys(sessions[0]!).sort()).toEqual(["createdAt", "current", "id", "lastSeenAt", "userAgent"]);
  });

  it("revokes only the caller's own sessions", async () => {
    const { service, sessions, current } = await setup();
    await expect(service.revokeSession(current, "s-stranger")).rejects.toBeInstanceOf(NotFoundError);
    await service.revokeSession(current, "s-other");
    expect(sessions.map((s) => s.id)).toEqual(["s-current", "s-stranger"]);
  });

  it("revoke-others keeps the current session", async () => {
    const { service, sessions, current } = await setup();
    await service.revokeOtherSessions(current);
    expect(sessions.map((s) => s.id)).toEqual(["s-current", "s-stranger"]);
  });

  it("bumps last_seen_at only when it is more than a few minutes old", async () => {
    const { service, touched } = await setup();
    expect(await service.resolveSession("tok-current")).toMatchObject({ sessionId: "s-current", userId: "user-1" });
    expect(touched).toEqual([]);
    await service.resolveSession("tok-other");
    expect(touched).toEqual(["s-other"]);
  });
});
