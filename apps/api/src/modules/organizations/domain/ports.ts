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

export interface OrganizationRepositoryPort {
  findTypeByCode(code: string): Promise<OrganizationTypeRecord | undefined>;
  create(input: {
    organizationTypeId: string;
    name: string;
    code: string;
  }): Promise<OrganizationRecord>;
  findById(id: string): Promise<OrganizationRecord | undefined>;
  codeExists(code: string): Promise<boolean>;
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
}
