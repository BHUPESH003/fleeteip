import type { ColumnType, Generated } from "kysely";

/** A required timestamp with no DB default (e.g. sessions.expires_at). */
type Timestamp = ColumnType<Date, Date | string, Date | string>;

/** A DB-defaulted, never-updated timestamp (every table's created_at). */
type CreatedAt = ColumnType<Date, Date | string | undefined, never>;

export interface OrganizationTypesTable {
  id: Generated<string>;
  code: string;
  name: string;
  created_at: CreatedAt;
}

export interface OrganizationsTable {
  id: Generated<string>;
  organization_type_id: string;
  name: string;
  code: string;
  created_at: CreatedAt;
}

export interface UsersTable {
  id: Generated<string>;
  email: string;
  password_hash: string;
  display_name: string;
  created_at: CreatedAt;
}

export interface RolesTable {
  id: Generated<string>;
  name: string;
  created_at: CreatedAt;
}

export interface PermissionsTable {
  id: Generated<string>;
  code: string;
  created_at: CreatedAt;
}

export interface RolePermissionsTable {
  role_id: string;
  permission_id: string;
}

export interface MembershipsTable {
  id: Generated<string>;
  user_id: string;
  organization_id: string;
  role_id: string;
  status: string;
  created_at: CreatedAt;
}

export interface SessionsTable {
  id: Generated<string>;
  user_id: string;
  token_hash: string;
  expires_at: Timestamp;
  created_at: CreatedAt;
}

export interface Database {
  organization_types: OrganizationTypesTable;
  organizations: OrganizationsTable;
  users: UsersTable;
  roles: RolesTable;
  permissions: PermissionsTable;
  role_permissions: RolePermissionsTable;
  memberships: MembershipsTable;
  sessions: SessionsTable;
}
