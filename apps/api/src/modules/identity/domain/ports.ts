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
}
