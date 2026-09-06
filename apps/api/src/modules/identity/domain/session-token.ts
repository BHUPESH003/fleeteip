import { createHash, randomBytes } from "node:crypto";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function generateSessionToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
  };
}

/** Session tokens are already high-entropy random values, so a fast hash (not a slow KDF) is fine here. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
