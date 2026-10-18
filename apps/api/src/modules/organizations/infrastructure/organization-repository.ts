import type { Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type {
  OrganizationContactInputRecord,
  OrganizationProfileRepositoryPort,
  OrganizationProfileUpdate,
  OrganizationRepositoryPort,
} from "../domain/ports.js";

export class OrganizationRepository
  implements OrganizationRepositoryPort, OrganizationProfileRepositoryPort
{
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

  updateName(id: string, name: string) {
    return this.db
      .updateTable("organizations")
      .set({ name })
      .where("id", "=", id)
      .returning(["id", "organization_type_id", "name", "code", "status", "created_at"])
      .executeTakeFirstOrThrow();
  }

  // --- Company details (0040) ---

  findProfile(organizationId: string) {
    return this.db
      .selectFrom("organization_profiles")
      .select([
        "organization_id",
        "address_line1",
        "address_line2",
        "city",
        "state",
        "postal_code",
        "country",
        "gst_number",
        "pan_number",
        "bank_name",
        "bank_account_name",
        "bank_account_number",
        "bank_ifsc",
        "bank_branch",
        "website",
        "logo_url",
      ])
      .where("organization_id", "=", organizationId)
      .executeTakeFirst();
  }

  listContacts(organizationId: string) {
    return this.db
      .selectFrom("organization_contacts")
      .select(["id", "name", "designation", "phone", "email"])
      .where("organization_id", "=", organizationId)
      .orderBy("sort_order")
      .orderBy("created_at")
      .execute();
  }

  // Full replace: upsert the single profile row, then swap the contacts
  // list for the supplied one — all inside one transaction so a partial
  // failure never leaves half a save behind. `contacts === null` leaves the
  // existing contacts untouched (the caller didn't send a list).
  async saveProfile(
    organizationId: string,
    profile: OrganizationProfileUpdate,
    contacts: OrganizationContactInputRecord[] | null,
  ): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("organization_profiles")
        .values({ organization_id: organizationId, ...profile, updated_at: new Date() })
        .onConflict((oc) =>
          oc.column("organization_id").doUpdateSet({ ...profile, updated_at: new Date() }),
        )
        .execute();

      if (contacts !== null) {
        await trx
          .deleteFrom("organization_contacts")
          .where("organization_id", "=", organizationId)
          .execute();
        if (contacts.length > 0) {
          await trx
            .insertInto("organization_contacts")
            .values(
              contacts.map((contact, index) => ({
                organization_id: organizationId,
                name: contact.name,
                designation: contact.designation,
                phone: contact.phone,
                email: contact.email,
                sort_order: index,
              })),
            )
            .execute();
        }
      }
    });
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
