/** Repository port for the Permissions module — see identity/domain/ports.ts for rationale. */

export interface RoleRecord {
  id: string;
  name: string;
}

export interface RoleRepositoryPort {
  findByName(name: string): Promise<RoleRecord | undefined>;
  hasPermission(roleId: string, permissionCode: string): Promise<boolean>;
}
