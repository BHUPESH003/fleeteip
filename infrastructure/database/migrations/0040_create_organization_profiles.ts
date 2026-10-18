import { sql, type Kysely } from "kysely";

/**
 * Company details for an organization: address, GST/tax identifiers, bank
 * details, a logo URL, a website, and a list of contact persons with their
 * designation and numbers.
 *
 * Kept in a separate `organization_profiles` table (one row per
 * organization) rather than widening `organizations`: that table is
 * deliberately minimal identity-only (id/type/name/code/status), its columns
 * are platform-owned, and ~25 test fakes model it. A tenant-editable profile
 * is a different concern with its own permission (organization.manage) and
 * optional-everywhere shape, so it lives on its own.
 *
 * Contact persons are a child table (`organization_contacts`) — a company
 * has several (owner, accounts, site in-charge, …), each with a name,
 * designation and phone/email.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("organization_profiles")
    .addColumn("organization_id", "uuid", (col) =>
      col.primaryKey().references("organizations.id").onDelete("cascade"),
    )
    .addColumn("address_line1", "text")
    .addColumn("address_line2", "text")
    .addColumn("city", "text")
    .addColumn("state", "text")
    .addColumn("postal_code", "text")
    .addColumn("country", "text")
    .addColumn("gst_number", "text")
    .addColumn("pan_number", "text")
    .addColumn("bank_name", "text")
    .addColumn("bank_account_name", "text")
    .addColumn("bank_account_number", "text")
    .addColumn("bank_ifsc", "text")
    .addColumn("bank_branch", "text")
    .addColumn("website", "text")
    .addColumn("logo_url", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("organization_contacts")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("organization_id", "uuid", (col) =>
      col.notNull().references("organizations.id").onDelete("cascade"),
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("designation", "text")
    .addColumn("phone", "text")
    .addColumn("email", "text")
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("organization_contacts_organization_id_idx")
    .on("organization_contacts")
    .column("organization_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("organization_contacts").execute();
  await db.schema.dropTable("organization_profiles").execute();
}
