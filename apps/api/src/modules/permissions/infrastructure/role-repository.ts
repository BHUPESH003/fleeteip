import type { Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import { ConflictError } from "../../../shared/errors.js";
import type { RoleRecord, RoleRepositoryPort } from "../domain/ports.js";

// SQLSTATE 23503 = foreign_key_violation — backstops against a role still
// referenced by memberships.role_id or organization_invites.role_id (both
// ON DELETE RESTRICT), same pattern as ProductRepository.isUniqueViolation.
function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23503"
  );
}

const ROLE_COLUMNS = ["id", "name", "organization_id"] as const;

export class RoleRepository implements RoleRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  findByName(name: string) {
    return this.db
      .selectFrom("roles")
      .select(ROLE_COLUMNS)
      .where("name", "=", name)
      .where("organization_id", "is", null)
      .executeTakeFirst();
  }

  findById(id: string) {
    return this.db.selectFrom("roles").select(ROLE_COLUMNS).where("id", "=", id).executeTakeFirst();
  }

  listForOrganization(organizationId: string) {
    return this.db
      .selectFrom("roles")
      .select(ROLE_COLUMNS)
      .where((eb) =>
        eb.or([eb("organization_id", "is", null), eb("organization_id", "=", organizationId)]),
      )
      // Builtin (organization_id null) first, then the organization's own
      // roles in creation order — deterministic, not alphabetical/random.
      .orderBy(({ ref }) => ref("organization_id"), "asc")
      .execute();
  }

  async create(input: {
    organizationId: string;
    name: string;
    permissionCodes: string[];
  }): Promise<RoleRecord> {
    return this.db.transaction().execute(async (trx) => {
      const role = await trx
        .insertInto("roles")
        .values({ name: input.name, organization_id: input.organizationId })
        .returning(ROLE_COLUMNS)
        .executeTakeFirstOrThrow();
      await this.grantPermissions(trx, role.id, input.permissionCodes);
      return role;
    });
  }

  async update(id: string, input: { name: string; permissionCodes: string[] }): Promise<RoleRecord> {
    return this.db.transaction().execute(async (trx) => {
      const role = await trx
        .updateTable("roles")
        .set({ name: input.name })
        .where("id", "=", id)
        .returning(ROLE_COLUMNS)
        .executeTakeFirstOrThrow();
      await trx.deleteFrom("role_permissions").where("role_id", "=", id).execute();
      await this.grantPermissions(trx, id, input.permissionCodes);
      return role;
    });
  }

  async delete(id: string): Promise<void> {
    try {
      await this.db.deleteFrom("roles").where("id", "=", id).execute();
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictError("This role is still assigned to a member or a pending invite");
      }
      throw error;
    }
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

  async listPermissionCodesByRoleId(roleId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom("role_permissions")
      .innerJoin("permissions", "permissions.id", "role_permissions.permission_id")
      .select("permissions.code as code")
      .where("role_permissions.role_id", "=", roleId)
      .execute();
    return rows.map((row) => row.code);
  }

  private async grantPermissions(
    trx: Kysely<Database>,
    roleId: string,
    permissionCodes: string[],
  ): Promise<void> {
    if (permissionCodes.length === 0) return;
    const permissionRows = await trx
      .selectFrom("permissions")
      .select(["id", "code"])
      .where("code", "in", permissionCodes)
      .execute();
    if (permissionRows.length !== permissionCodes.length) {
      throw new Error("One or more permission codes are not seeded reference data");
    }
    await trx
      .insertInto("role_permissions")
      .values(permissionRows.map((permission) => ({ role_id: roleId, permission_id: permission.id })))
      .execute();
  }
}
