import { type Kysely, sql } from "kysely";

/**
 * Creates `transport_records` (one row per mobilization/demobilization leg
 * of a Rental) and seeds `transport.manage`, granted to `owner`. See
 * docs/execution-and-billing-design.md §3.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("transport_records")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("rental_id", "uuid", (col) =>
      col.notNull().references("rentals.id").onDelete("cascade"),
    )
    .addColumn("leg", "text", (col) => col.notNull())
    .addColumn("pickup_location", "text")
    .addColumn("destination", "text")
    .addColumn("planned_date", "date")
    .addColumn("actual_date", "date")
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("transport_details", "text")
    .addColumn("charges", "numeric")
    .addColumn("notes", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("transport_records_rental_id_leg_key", ["rental_id", "leg"])
    .execute();

  const permission = await db
    .insertInto("permissions")
    .values({ code: "transport.manage" })
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
    .where("code", "=", "transport.manage")
    .executeTakeFirst();
  if (permission) {
    await db.deleteFrom("role_permissions").where("permission_id", "=", permission.id).execute();
  }
  await db.deleteFrom("permissions").where("code", "=", "transport.manage").execute();

  await db.schema.dropTable("transport_records").execute();
}
