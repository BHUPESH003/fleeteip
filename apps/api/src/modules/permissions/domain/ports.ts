/** Repository port for the Permissions module — see identity/domain/ports.ts for rationale. */

export interface RoleRecord {
  id: string;
  name: string;
  // null = built-in/global role (only "owner"); a real organization id
  // scopes the role — and everything it grants — to that organization alone.
  organization_id: string | null;
}

export interface RoleRepositoryPort {
  // Builtin-only lookup (organization_id IS NULL) — used to resolve the
  // fixed "owner" role at signup, never for a caller-supplied role name.
  findByName(name: string): Promise<RoleRecord | undefined>;
  findById(id: string): Promise<RoleRecord | undefined>;
  // Every role usable in this organization: the one built-in "owner" role,
  // plus every role scoped to this organization specifically (its own
  // "member" and any custom roles it has created).
  listForOrganization(organizationId: string): Promise<RoleRecord[]>;
  create(input: {
    organizationId: string;
    name: string;
    permissionCodes: string[];
  }): Promise<RoleRecord>;
  // Replaces both the name and the full permission set — callers always
  // send the complete desired state, never a partial patch.
  update(id: string, input: { name: string; permissionCodes: string[] }): Promise<RoleRecord>;
  // Throws ConflictError if the role is still referenced by a membership or
  // a pending invite (both are ON DELETE RESTRICT) — never a raw DB error.
  delete(id: string): Promise<void>;
  hasPermission(roleId: string, permissionCode: string): Promise<boolean>;
  listPermissionCodesByRoleId(roleId: string): Promise<string[]>;
}
