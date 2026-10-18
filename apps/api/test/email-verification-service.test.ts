import { describe, expect, it } from "vitest";
import { EmailVerificationService } from "../src/modules/identity/application/email-verification-service.js";
import type {
  EmailVerificationTokenRepositoryPort,
  MailMessage,
  PasswordResetTokenRecord,
  UserRecord,
  UserRepositoryPort,
} from "../src/modules/identity/domain/ports.js";
import { hashSessionToken } from "../src/modules/identity/domain/session-token.js";
import { ValidationError } from "../src/shared/errors.js";
import { UNUSED_USER_PASSWORD_METHODS } from "./identity-fakes.js";

const USER: UserRecord = {
  id: "user-1",
  email: "a@example.com",
  password_hash: "x",
  display_name: "Asha",
  status: "active",
  email_verified_at: null,
  created_at: new Date(),
};

function setup(user: UserRecord = USER) {
  const tokens: (PasswordResetTokenRecord & { hash: string })[] = [];
  const verified: string[] = [];
  const mails: MailMessage[] = [];
  const users: UserRepositoryPort = {
    findByEmail: async (email) => (email === user.email ? user : undefined),
    findById: async () => user,
    create: async () => user,
    listAllForPlatformAdmin: async () => [],
    updateStatus: async () => user,
    ...UNUSED_USER_PASSWORD_METHODS,
  };
  const repo: EmailVerificationTokenRepositoryPort = {
    create: async ({ userId, tokenHash, expiresAt }) => {
      tokens.push({ id: `t${tokens.length}`, user_id: userId, hash: tokenHash, expires_at: expiresAt, used_at: null });
    },
    invalidateUnusedByUserId: async (userId) => {
      for (const t of tokens) if (t.user_id === userId && !t.used_at) t.used_at = new Date();
    },
    findByTokenHash: async (hash) => tokens.find((t) => t.hash === hash),
    redeem: async ({ tokenId, userId }) => {
      const t = tokens.find((x) => x.id === tokenId);
      if (!t || t.used_at) return false;
      t.used_at = new Date();
      verified.push(userId);
      return true;
    },
  };
  const service = new EmailVerificationService(users, repo, { send: async (m) => void mails.push(m) }, "https://app.test");
  const lastToken = () => decodeURIComponent(mails.at(-1)!.text.match(/token=(\S+)/)![1]!);
  return { service, tokens, verified, mails, lastToken };
}

describe("EmailVerificationService", () => {
  it("mails a link whose token verifies the account once", async () => {
    const { service, verified, lastToken, tokens } = setup();
    await service.sendVerification(USER);
    expect(tokens[0]!.hash).toBe(hashSessionToken(lastToken()));
    await service.confirm({ token: lastToken() });
    expect(verified).toEqual(["user-1"]);
    await expect(service.confirm({ token: lastToken() })).rejects.toBeInstanceOf(ValidationError);
  });

  it("only the newest link works after a resend", async () => {
    const { service, mails, lastToken } = setup();
    await service.sendVerification(USER);
    const first = lastToken();
    await service.resend({ email: USER.email });
    expect(mails).toHaveLength(2);
    await expect(service.confirm({ token: first })).rejects.toBeInstanceOf(ValidationError);
    await service.confirm({ token: lastToken() });
  });

  it("rejects an expired or unknown token", async () => {
    const { service, tokens, lastToken } = setup();
    await service.sendVerification(USER);
    tokens[0]!.expires_at = new Date(Date.now() - 1000);
    await expect(service.confirm({ token: lastToken() })).rejects.toBeInstanceOf(ValidationError);
    await expect(service.confirm({ token: "nope" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("resend sends nothing for unknown, suspended or already verified accounts", async () => {
    for (const user of [{ ...USER, status: "suspended" }, { ...USER, email_verified_at: new Date() }]) {
      const { service, mails } = setup(user);
      await service.resend({ email: user.email });
      expect(mails).toHaveLength(0);
    }
    const { service, mails } = setup();
    await service.resend({ email: "nobody@example.com" });
    expect(mails).toHaveLength(0);
  });
});
