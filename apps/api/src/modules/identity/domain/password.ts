import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

/**
 * ponytail: Node's built-in scrypt KDF instead of an added native dependency
 * (argon2). Same properties that matter here — salted, slow, timing-safe
 * verification — with zero install risk. Swap for argon2/bcrypt only if a
 * concrete reason (e.g. cross-language hash compatibility) shows up later.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [saltHex, keyHex] = storedHash.split(":");
  if (!saltHex || !keyHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const storedKey = Buffer.from(keyHex, "hex");
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  if (derivedKey.length !== storedKey.length) return false;
  return timingSafeEqual(derivedKey, storedKey);
}

// A fixed, valid-shaped hash with no corresponding real password — used to
// run the same slow KDF on a login attempt against an email that doesn't
// exist, so the response time doesn't reveal account existence. See the
// security-review danger zone recorded for auth-service.ts's login().
export const DUMMY_PASSWORD_HASH = `${"00".repeat(16)}:${"00".repeat(KEY_LENGTH)}`;
