import type { StaffUser } from "@fleetip/contracts/platform-admin";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "../../identity/domain/password.js";
import { generateSessionToken, hashSessionToken } from "../../identity/domain/session-token.js";
import { UnauthorizedError } from "../../../shared/errors.js";
import type {
  PublicStaffUserRecord,
  StaffSessionRepositoryPort,
  StaffUserRepositoryPort,
} from "../domain/ports.js";

/**
 * Authenticates FleetIP's own staff (Platform Admin) — deliberately NOT
 * built on the tenant AuthService/Organization/Membership model. A staff
 * session represents "acting with platform authority," not "a member of
 * organization X," so it needs no organization at all. Reuses the exact
 * same password-hashing (scrypt) and session-token (random + hashed
 * storage) primitives as tenant auth — same trust properties, a second
 * principal type, not a second auth system. See
 * docs/platform-admin-architecture-requirements.md.
 */
export interface StaffAuthResult {
  staffUser: StaffUser;
  token: string;
  expiresAt: Date;
}

function toStaffUser(row: PublicStaffUserRecord): StaffUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export class StaffAuthService {
  constructor(
    private readonly staffUserRepository: StaffUserRepositoryPort,
    private readonly staffSessionRepository: StaffSessionRepositoryPort,
  ) {}

  async login(email: string, password: string): Promise<StaffAuthResult> {
    const staffUser = await this.staffUserRepository.findByEmail(email);
    // Same enumeration defense as AuthService.login — always run the slow
    // KDF, even for an email that doesn't exist.
    const isValidPassword = await verifyPassword(
      password,
      staffUser?.password_hash ?? DUMMY_PASSWORD_HASH,
    );
    if (!staffUser || !isValidPassword) {
      throw new UnauthorizedError("Invalid email or password");
    }
    const { token, tokenHash, expiresAt } = generateSessionToken();
    await this.staffSessionRepository.create({ staffUserId: staffUser.id, tokenHash, expiresAt });
    return { staffUser: toStaffUser(staffUser), token, expiresAt };
  }

  async logout(token: string): Promise<void> {
    await this.staffSessionRepository.deleteByTokenHash(hashSessionToken(token));
  }

  // Returns the raw record (not the StaffUser contract type) — this is the
  // internal auth check every /admin/* route uses via getAuthenticatedStaffId,
  // which only needs `.id`, not a client-shaped response.
  async getAuthenticatedStaff(token: string): Promise<PublicStaffUserRecord | null> {
    const session = await this.staffSessionRepository.findActiveByTokenHash(
      hashSessionToken(token),
    );
    if (!session) return null;
    const staffUser = await this.staffUserRepository.findById(session.staff_user_id);
    return staffUser ?? null;
  }
}
