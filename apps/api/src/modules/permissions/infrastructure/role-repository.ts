import type { Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type { RoleRepositoryPort } from "../domain/ports.js";

export class RoleRepository implements RoleRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  findByName(name: string) {
    return this.db
      .selectFrom("roles")
      .select(["id", "name"])
      .where("name", "=", name)
      .executeTakeFirst();
  }

  hasPermission(roleId: string, permissionCode: string): Promise<boolean> {
    return this.db
      .selectFrom("role_permissions")
      .innerJoin("permissions", "permissions.id", "role_permissions.permission_id")
      .select("role_permissions.role_id")
      .where("role_permissions.role_id", "=", roleId)
      .where("permissions.code", "=", permissionCode)
      .executeTakeFirst()
      .then((row) => row !== undefined);
  }
}
