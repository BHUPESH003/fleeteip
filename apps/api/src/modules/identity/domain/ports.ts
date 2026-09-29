/**
 * Repository ports: the application layer (AuthService) depends on these
 * interfaces, never on the concrete Kysely-backed classes in
 * `../infrastructure`. Keeps identity's business logic persistence-agnostic
 * and lets tests substitute an in-memory fake instead of a real database.
 */

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  status: string;
  created_at: Date | string;
}

export type PublicUserRecord = Omit<UserRecord, "password_hash">;

export interface UserRepositoryPort {
  findByEmail(email: string): Promise<UserRecord | undefined>;
  findById(id: string): Promise<PublicUserRecord | undefined>;
  create(input: {
    email: string;
    passwordHash: string;
    displayName: string;
  }): Promise<PublicUserRecord>;
  // Platform Admin only — see OrganizationRepositoryPort.listAllForPlatformAdmin.
  listAllForPlatformAdmin(): Promise<PublicUserRecord[]>;
  updateStatus(id: string, status: "active" | "suspended"): Promise<PublicUserRecord>;
}

export interface SessionRecord {
  id: string;
  user_id: string;
  expires_at: Date | string;
}

export interface SessionRepositoryPort {
  create(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<SessionRecord>;
  findActiveByTokenHash(tokenHash: string): Promise<SessionRecord | undefined>;
  deleteByTokenHash(tokenHash: string): Promise<unknown>;
  deleteByUserId(userId: string): Promise<unknown>;
}

export interface PasswordResetTokenRecord {
  id: string;
  user_id: string;
  expires_at: Date | string;
  used_at: Date | string | null;
}

export interface PasswordResetTokenRepositoryPort {
  create(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<unknown>;
  /** Stamps used_at on every still-unused token of this user, so only the newest link works. */
  invalidateUnusedByUserId(userId: string): Promise<unknown>;
  findByTokenHash(tokenHash: string): Promise<PasswordResetTokenRecord | undefined>;
  /**
   * Marks the token used AND sets the user's new password hash atomically.
   * Returns false if the token was already used (lost a race with a
   * concurrent redeem) — the password is then left untouched.
   */
  redeem(input: { tokenId: string; userId: string; passwordHash: string }): Promise<boolean>;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailerPort {
  send(message: MailMessage): Promise<void>;
}
