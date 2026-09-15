import { type Kysely, sql } from "kysely";

/**
 * Creates `projects` — a Renter's first-class grouping of Requirements,
 * Quotations, Rentals, Work Orders, Transport, Logsheets and Billing under
 * one site/engagement, replacing the free-text `projectName`/`projectLocation`
 * strings repeated on every Requirement/Rental with a real FK. A per-Renter
 * reference-number counter mirrors `quotation_reference_sequences`
 * (0010)/`invoice_reference_sequences` (0014) — same race-free pattern.
 *
 * Seeds `project.manage`, Renter-only (a Project belongs to the Renter
 * organization; a Rental Company only ever sees Project context threaded
 * through Requirement/Quotation/Rental, never the Project resource itself).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("project_reference_sequences")
    .addColumn("organization_id", "uuid", (col) =>
      col.primaryKey().references("organizations.id").onDelete("cascade"),
    )
    .addColumn("next_value", "integer", (col) => col.notNull().defaultTo(1))
    .execute();

  await db.schema
    .createTable("projects")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("renter_organization_id", "uuid", (col) =>
      col.notNull().references("organizations.id").onDelete("cascade"),
    )
    .addColumn("project_code", "text", (col) => col.notNull())
    .addColumn("project_type", "text", (col) => col.notNull())
    .addColumn("project_name", "text", (col) => col.notNull())
    .addColumn("site_location", "text", (col) => col.notNull())
    .addColumn("state", "text")
    .addColumn("district", "text")
    .addColumn("start_date", "date", (col) => col.notNull())
    .addColumn("end_date", "date")
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("projects_renter_organization_id_project_code_key", [
      "renter_organization_id",
      "project_code",
    ])
    .execute();

  await db.schema
    .createIndex("projects_renter_organization_id_idx")
    .on("projects")
    .column("renter_organization_id")
    .execute();

  const permission = await db
    .insertInto("permissions")
    .values({ code: "project.manage" })
    .returning(["id"])
    .executeTakeFirstOrThrow();

  const ownerRole = await db
    .selectFrom("roles")
    .select("id")
    .where("name", "=", "owner")
    .executeTakeFirstOrThrow();

  await db
    .insertInto("role_permissions")
    .values({ role_id: ownerRole.id, permission_id: permission.id })
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  const permission = await db
    .selectFrom("permissions")
    .select("id")
    .where("code", "=", "project.manage")
    .executeTakeFirst();

  if (permission) {
    await db.deleteFrom("role_permissions").where("permission_id", "=", permission.id).execute();
  }
  await db.deleteFrom("permissions").where("code", "=", "project.manage").execute();

  await db.schema.dropTable("projects").execute();
  await db.schema.dropTable("project_reference_sequences").execute();
}
