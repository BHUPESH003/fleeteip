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
  role_name: string;
  status: string;
  created_at: Date | string;
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
}
