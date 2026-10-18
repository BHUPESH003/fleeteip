/** Repository ports for the Organizations module — see identity/domain/ports.ts for rationale. */

export interface OrganizationTypeRecord {
  id: string;
  code: string;
  name: string;
}

export interface OrganizationRecord {
  id: string;
  organization_type_id: string;
  name: string;
  code: string;
  status: string;
  created_at: Date | string;
}

export interface OrganizationWithTypeRecord extends OrganizationRecord {
  organization_type_code: string;
}

export interface OrganizationRepositoryPort {
  findTypeByCode(code: string): Promise<OrganizationTypeRecord | undefined>;
  create(input: {
    organizationTypeId: string;
    name: string;
    code: string;
  }): Promise<OrganizationRecord>;
  findById(id: string): Promise<OrganizationRecord | undefined>;
  findWithTypeById(id: string): Promise<OrganizationWithTypeRecord | undefined>;
  codeExists(code: string): Promise<boolean>;
  // Name lookup for a counterparty picker (e.g. Rental Company selecting a
  // known Renter to quote) — not a general org directory, just enough to
  // replace a raw organization-id text input with a real Select.
  listByType(organizationTypeCode: string): Promise<OrganizationWithTypeRecord[]>;
  // Platform Admin only — every organization across every tenant, bypassing
  // the usual per-caller-organization scoping. Never reused for a tenant
  // request; see docs/platform-admin-architecture-requirements.md point 3.
  listAllForPlatformAdmin(): Promise<OrganizationWithTypeRecord[]>;
  updateStatus(id: string, status: "active" | "suspended"): Promise<OrganizationRecord>;
}

// Kept off OrganizationRepositoryPort on purpose: that port is faked in
// ~25 test files that never edit a profile. Only OrganizationService needs
// it; OrganizationRepository implements both.
export interface OrganizationProfileRepositoryPort {
  updateName(id: string, name: string): Promise<OrganizationRecord>;
  // Company details (0040). Returns undefined when a profile row hasn't been
  // created yet (the service treats that as an empty profile).
  findProfile(organizationId: string): Promise<OrganizationProfileRecord | undefined>;
  listContacts(organizationId: string): Promise<OrganizationContactRecord[]>;
  // Full replace: upserts the profile row and replaces the contacts list
  // with the supplied one in a single transaction.
  saveProfile(
    organizationId: string,
    profile: OrganizationProfileUpdate,
    contacts: OrganizationContactInputRecord[] | null,
  ): Promise<void>;
}

// 0040 — all fields nullable; a profile is filled in gradually.
export interface OrganizationProfileRecord {
  organization_id: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  gst_number: string | null;
  pan_number: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_branch: string | null;
  website: string | null;
  logo_url: string | null;
}

export interface OrganizationContactRecord {
  id: string;
  name: string;
  designation: string | null;
  phone: string | null;
  email: string | null;
}

export type OrganizationProfileUpdate = Omit<OrganizationProfileRecord, "organization_id">;

export interface OrganizationContactInputRecord {
  name: string;
  designation: string | null;
  phone: string | null;
  email: string | null;
}

export interface MembershipRecord {
  id: string;
  user_id: string;
  organization_id: string;
  role_id: string;
  status: string;
  created_at: Date | string;
}

export interface MembershipWithOrganizationRow {
  id: string;
  status: string;
  created_at: Date | string;
  role_id: string;
  role_name: string;
  organization_id: string;
  organization_name: string;
  organization_code: string;
  organization_created_at: Date | string;
  organization_type_code: string;
}

export interface ActiveMembershipRecord {
  id: string;
  status: string;
  role_id: string;
}

// One row per member of an organization, joined with the user's public
// identity and the role's name — feeds the org admin "Members" screen.
// Deliberately never carries password_hash (see identity/domain/ports.ts'
// UserRecord vs. PublicUserRecord split) — this query joins users but never
// selects that column.
export interface OrganizationMemberRow {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  role_id: string;
  role_name: string;
  status: string;
  created_at: Date | string;
}

export interface OrganizationInviteRecord {
  id: string;
  organization_id: string;
  role_id: string;
  token_hash: string;
  invited_by_user_id: string | null;
  status: string;
  expires_at: Date | string;
  accepted_by_user_id: string | null;
  created_at: Date | string;
}

// Joined view for the public preview screen — never exposes token_hash or
// any tenant-private data beyond what an unauthenticated visitor should see
// before deciding whether to sign up/accept.
export interface OrganizationInviteWithContextRow {
  id: string;
  organization_id: string;
  organization_name: string;
  organization_type_code: string;
  role_id: string;
  role_name: string;
  status: string;
  expires_at: Date | string;
}

// Admin list row — role name joined in, token_hash deliberately not selected.
export interface OrganizationInviteListRow {
  id: string;
  organization_id: string;
  role_name: string;
  status: string;
  expires_at: Date | string;
  created_at: Date | string;
}

export interface InviteRepositoryPort {
  create(input: {
    organizationId: string;
    roleId: string;
    tokenHash: string;
    invitedByUserId: string;
    expiresAt: Date;
  }): Promise<OrganizationInviteRecord>;
  findByTokenHash(tokenHash: string): Promise<OrganizationInviteRecord | undefined>;
  findWithContextByTokenHash(
    tokenHash: string,
  ): Promise<OrganizationInviteWithContextRow | undefined>;
  markAccepted(id: string, acceptedByUserId: string): Promise<OrganizationInviteRecord>;
  // Always scoped by organizationId — an invite id alone never resolves
  // across tenants.
  listByOrganization(organizationId: string, limit: number): Promise<OrganizationInviteListRow[]>;
  findByIdInOrganization(
    id: string,
    organizationId: string,
  ): Promise<OrganizationInviteListRow | undefined>;
  // Conditional on status still being "pending" — undefined if it no longer is.
  markRevoked(id: string): Promise<OrganizationInviteRecord | undefined>;
}

export interface MembershipRepositoryPort {
  create(input: {
    userId: string;
    organizationId: string;
    roleId: string;
    status: string;
  }): Promise<MembershipRecord>;
  listWithOrganizationByUserId(userId: string): Promise<MembershipWithOrganizationRow[]>;
  findActiveMembership(
    userId: string,
    organizationId: string,
  ): Promise<ActiveMembershipRecord | undefined>;
  listByOrganization(organizationId: string): Promise<OrganizationMemberRow[]>;
  updateRole(membershipId: string, roleId: string): Promise<MembershipRecord>;
}
