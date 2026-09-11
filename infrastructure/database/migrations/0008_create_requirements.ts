import { type Kysely, sql } from "kysely";

/**
 * Creates the `requirements` table (the RFQ a Renter posts) and seeds the
 * two new permissions it needs — `rfq.manage` (Renter: create/close/cancel)
 * and `rfq.respond` (Rental Company: discover/respond) — granted to the
 * `owner` role, in the same migration as the table itself so the DB seed can
 * never drift from the contracts-level declaration again (the exact gap
 * 0007 had to close for rental.manage).
 *
 * See docs/marketplace-core-loop-design.md §4.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("requirements")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("renter_organization_id", "uuid", (col) =>
      col.notNull().references("organizations.id").onDelete("cascade"),
    )
    .addColumn("product_subcategory_id", "uuid", (col) =>
      col.notNull().references("product_subcategories.id").onDelete("restrict"),
    )
    .addColumn("capacity", "numeric")
    .addColumn("capacity_unit", "text")
    .addColumn("quantity", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("project_name", "text")
    .addColumn("project_location", "text")
    .addColumn("requested_start_date", "date", (col) => col.notNull())
    .addColumn("expected_duration_value", "integer")
    .addColumn("expected_duration_unit", "text")
    .addColumn("shift_requirement", "text")
    .addColumn("validity_date", "date", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("notes", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("requirements_renter_organization_id_idx")
    .on("requirements")
    .column("renter_organization_id")
    .execute();

  // Discovery query filters on status = 'open' AND validity_date >= today.
  await db.schema
    .createIndex("requirements_status_validity_date_idx")
    .on("requirements")
    .columns(["status", "validity_date"])
    .execute();

  const permissions = await db
    .insertInto("permissions")
    .values([{ code: "rfq.manage" }, { code: "rfq.respond" }])
    .returning(["id"])
    .execute();

  const ownerRole = await db
    .selectFrom("roles")
    .select("id")
    .where("name", "=", "owner")
    .executeTakeFirstOrThrow();

  await db
    .insertInto("role_permissions")
    .values(
      permissions.map((permission) => ({ role_id: ownerRole.id, permission_id: permission.id })),
    )
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  const permissions = await db
    .selectFrom("permissions")
    .select("id")
    .where("code", "in", ["rfq.manage", "rfq.respond"])
    .execute();

  if (permissions.length > 0) {
    await db
      .deleteFrom("role_permissions")
      .where(
        "permission_id",
        "in",
        permissions.map((permission) => permission.id),
      )
      .execute();
  }
  await db.deleteFrom("permissions").where("code", "in", ["rfq.manage", "rfq.respond"]).execute();

  await db.schema.dropTable("requirements").execute();
}
