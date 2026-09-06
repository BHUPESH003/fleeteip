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
      .returning(["id", "organization_type_id", "name", "code", "created_at"])
      .executeTakeFirstOrThrow();
  }

  findById(id: string) {
    return this.db
      .selectFrom("organizations")
      .select(["id", "organization_type_id", "name", "code", "created_at"])
      .where("id", "=", id)
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
}
