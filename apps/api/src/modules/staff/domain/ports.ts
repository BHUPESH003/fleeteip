/**
 * Repository ports for FleetIP's own staff (Platform Admin) — a wholly
 * separate principal type from tenant `users`, see this module's
 * application/staff-auth-service.ts for why. Mirrors identity/domain/ports.ts
 * one-for-one.
 */

export interface StaffUserRecord {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  created_at: Date | string;
}

export type PublicStaffUserRecord = Omit<StaffUserRecord, "password_hash">;

export interface StaffUserRepositoryPort {
  findByEmail(email: string): Promise<StaffUserRecord | undefined>;
  findById(id: string): Promise<PublicStaffUserRecord | undefined>;
  // Used only by scripts/seed-staff-admin.ts — there is no signup route for
  // staff; a real platform-admin account is always provisioned out of band.
  create(input: {
    email: string;
    passwordHash: string;
    displayName: string;
  }): Promise<PublicStaffUserRecord>;
}

export interface StaffSessionRecord {
  id: string;
  staff_user_id: string;
  expires_at: Date | string;
}

export interface StaffSessionRepositoryPort {
  create(input: {
    staffUserId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<StaffSessionRecord>;
  findActiveByTokenHash(tokenHash: string): Promise<StaffSessionRecord | undefined>;
  deleteByTokenHash(tokenHash: string): Promise<unknown>;
}
