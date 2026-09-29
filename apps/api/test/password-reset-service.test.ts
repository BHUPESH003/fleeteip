import { describe, expect, it } from "vitest";
import { PasswordResetService } from "../src/modules/identity/application/password-reset-service.js";
import { hashPassword, verifyPassword } from "../src/modules/identity/domain/password.js";
import type {
  MailMessage,
  PasswordResetTokenRepositoryPort,
  SessionRepositoryPort,
  UserRecord,
  UserRepositoryPort,
} from "../src/modules/identity/domain/ports.js";
import { hashSessionToken } from "../src/modules/identity/domain/session-token.js";
import { ValidationError } from "../src/shared/errors.js";

const WEB_ORIGIN = "http://web.test";
const NEW_PASSWORD = "BrandNewPass456!";

interface TokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
}

async function setup(
  status = "active",
  send?: (message: MailMessage) => Promise<void>,
  logMailError?: (error: unknown) => void,
) {
  const user: UserRecord = {
    id: "user-1",
    email: "owner@example.com",
    password_hash: await hashPassword("OldPassword123!"),
    display_name: "Owner",
    status,
    created_at: new Date(),
  };
  const tokens: TokenRow[] = [];
  const mail: MailMessage[] = [];
  const deletedSessionsFor: string[] = [];

  const userRepository: UserRepositoryPort = {
    findByEmail: async (email) => (email === user.email ? user : undefined),
    findById: async () => {
      throw new Error("not used in this test");
    },
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

  const tokenRepository: PasswordResetTokenRepositoryPort = {
    create: async (input) => {
      tokens.push({
        id: `token-${tokens.length + 1}`,
        user_id: input.userId,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt,
        used_at: null,
      });
    },
    invalidateUnusedByUserId: async (userId) => {
      for (const t of tokens) if (t.user_id === userId && !t.used_at) t.used_at = new Date();
    },
    findByTokenHash: async (hash) => tokens.find((t) => t.token_hash === hash),
    redeem: async ({ tokenId, userId, passwordHash }) => {
      const t = tokens.find((row) => row.id === tokenId);
      if (!t || t.used_at) return false;
      t.used_at = new Date();
      if (userId === user.id) user.password_hash = passwordHash;
      return true;
    },
  };

  const sessionRepository: SessionRepositoryPort = {
    create: async () => {
      throw new Error("not used in this test");
    },
    findActiveByTokenHash: async () => {
      throw new Error("not used in this test");
    },
    deleteByTokenHash: async () => {
      throw new Error("not used in this test");
    },
    deleteByUserId: async (userId) => {
      deletedSessionsFor.push(userId);
    },
  };

  const service = new PasswordResetService(
    userRepository,
    tokenRepository,
    sessionRepository,
    { send: send ?? (async (message) => void mail.push(message)) },
    WEB_ORIGIN,
    logMailError,
  );
  return { service, user, tokens, mail, deletedSessionsFor };
}

function tokenFromMail(message: MailMessage): string {
  const match = message.text.match(/reset-password\?token=([^\s]+)/);
  if (!match?.[1]) throw new Error("no link in mail");
  return decodeURIComponent(match[1]);
}

describe("PasswordResetService", () => {
  it("does nothing for an unknown email", async () => {
    const { service, tokens, mail } = await setup();
    await service.requestReset({ email: "nobody@example.com" });
    expect(tokens).toHaveLength(0);
    expect(mail).toHaveLength(0);
  });

  it("does nothing for a suspended account", async () => {
    const { service, tokens, mail } = await setup("suspended");
    await service.requestReset({ email: "owner@example.com" });
    expect(tokens).toHaveLength(0);
    expect(mail).toHaveLength(0);
  });

  it("stores only the token hash and mails a link with the raw token", async () => {
    const { service, tokens, mail } = await setup();
    await service.requestReset({ email: "owner@example.com" });

    expect(mail).toHaveLength(1);
    expect(mail[0]!.to).toBe("owner@example.com");
    expect(mail[0]!.text).toContain(`${WEB_ORIGIN}/reset-password?token=`);
    const token = tokenFromMail(mail[0]!);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.token_hash).toBe(hashSessionToken(token));
    expect(tokens[0]!.token_hash).not.toBe(token);
    const ttl = tokens[0]!.expires_at.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(59 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it("invalidates older unused tokens on a new request", async () => {
    const { service, mail } = await setup();
    await service.requestReset({ email: "owner@example.com" });
    await service.requestReset({ email: "owner@example.com" });
    const [first, second] = mail.map(tokenFromMail);

    await expect(
      service.confirmReset({ token: first!, password: NEW_PASSWORD }),
    ).rejects.toBeInstanceOf(ValidationError);
    await service.confirmReset({ token: second!, password: NEW_PASSWORD });
  });

  it("sets the new password, marks the token used and deletes all sessions", async () => {
    const { service, user, tokens, mail, deletedSessionsFor } = await setup();
    await service.requestReset({ email: "owner@example.com" });
    await service.confirmReset({ token: tokenFromMail(mail[0]!), password: NEW_PASSWORD });

    expect(await verifyPassword(NEW_PASSWORD, user.password_hash)).toBe(true);
    expect(tokens[0]!.used_at).not.toBeNull();
    expect(deletedSessionsFor).toEqual([user.id]);
  });

  it("rejects a used token", async () => {
    const { service, mail } = await setup();
    await service.requestReset({ email: "owner@example.com" });
    const token = tokenFromMail(mail[0]!);
    await service.confirmReset({ token, password: NEW_PASSWORD });
    await expect(service.confirmReset({ token, password: NEW_PASSWORD })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects an expired token without changing the password", async () => {
    const { service, user, tokens, mail, deletedSessionsFor } = await setup();
    await service.requestReset({ email: "owner@example.com" });
    tokens[0]!.expires_at = new Date(Date.now() - 1000);
    const before = user.password_hash;

    await expect(
      service.confirmReset({ token: tokenFromMail(mail[0]!), password: NEW_PASSWORD }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(user.password_hash).toBe(before);
    expect(deletedSessionsFor).toHaveLength(0);
  });

  it("rejects an unknown token", async () => {
    const { service } = await setup();
    await expect(
      service.confirmReset({ token: "not-a-real-token", password: NEW_PASSWORD }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("doesn't wait on or fail with the mail send, and logs a send failure", async () => {
    const logged: unknown[] = [];
    const failure = new Error("smtp down");
    const { service, tokens } = await setup(
      "active",
      () => new Promise((_, reject) => setTimeout(() => reject(failure), 10)),
      (error) => logged.push(error),
    );
    await expect(service.requestReset({ email: "owner@example.com" })).resolves.toBeUndefined();
    expect(tokens).toHaveLength(1);
    expect(logged).toHaveLength(0); // resolved before the send settled
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(logged).toEqual([failure]);
  });
});
