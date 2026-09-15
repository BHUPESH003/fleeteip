import type { Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type { OrganizationRepositoryPort } from "../domain/ports.js";

export class OrganizationRepository implements OrganizationRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  findTypeByCode(code: string) {
    return this.db
      .selectFrom("organization_types")
      .select(["id", "code", "name"])
      .where("code", "=", code)
      .executeTakeFirst();
  }

  create(input: { organizationTypeId: string; name: string; code: string }) {
    return this.db
      .insertInto("organizations")
      .values({
        organization_type_id: input.organizationTypeId,
        name: input.name,
        code: input.code,
      })
      .returning(["id", "organization_type_id", "name", "code", "status", "created_at"])
      .executeTakeFirstOrThrow();
  }

  findById(id: string) {
    return this.db
      .selectFrom("organizations")
      .select(["id", "organization_type_id", "name", "code", "status", "created_at"])
      .where("id", "=", id)
      .executeTakeFirst();
  }

  updateStatus(id: string, status: "active" | "suspended") {
    return this.db
      .updateTable("organizations")
      .set({ status })
      .where("id", "=", id)
      .returning(["id", "organization_type_id", "name", "code", "status", "created_at"])
      .executeTakeFirstOrThrow();
  }

  findWithTypeById(id: string) {
    return this.db
      .selectFrom("organizations")
      .innerJoin(
        "organization_types",
        "organization_types.id",
        "organizations.organization_type_id",
      )
      .select([
        "organizations.id as id",
        "organizations.organization_type_id as organization_type_id",
        "organizations.name as name",
        "organizations.code as code",
        "organizations.status as status",
        "organizations.created_at as created_at",
        "organization_types.code as organization_type_code",
      ])
      .where("organizations.id", "=", id)
      .executeTakeFirst();
  }

  codeExists(code: string) {
    return this.db
      .selectFrom("organizations")
      .select("id")
      .where("code", "=", code)
      .executeTakeFirst()
      .then((row) => row !== undefined);
  }

  listByType(organizationTypeCode: string) {
    return this.db
      .selectFrom("organizations")
      .innerJoin(
        "organization_types",
        "organization_types.id",
        "organizations.organization_type_id",
      )
      .select([
        "organizations.id as id",
        "organizations.organization_type_id as organization_type_id",
        "organizations.name as name",
        "organizations.code as code",
        "organizations.status as status",
        "organizations.created_at as created_at",
        "organization_types.code as organization_type_code",
      ])
      .where("organization_types.code", "=", organizationTypeCode)
      .orderBy("organizations.name")
      .execute();
  }

  // Platform Admin only — every organization, no per-caller scoping. See
  // OrganizationRepositoryPort.listAllForPlatformAdmin.
  listAllForPlatformAdmin() {
    return this.db
      .selectFrom("organizations")
      .innerJoin(
        "organization_types",
        "organization_types.id",
        "organizations.organization_type_id",
      )
      .select([
        "organizations.id as id",
        "organizations.organization_type_id as organization_type_id",
        "organizations.name as name",
        "organizations.code as code",
        "organizations.status as status",
        "organizations.created_at as created_at",
        "organization_types.code as organization_type_code",
      ])
      .orderBy("organizations.created_at", "desc")
      .execute();
  }
}
