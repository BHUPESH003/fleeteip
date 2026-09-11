import { type Kysely, sql } from "kysely";

/**
 * Creates `logsheets` (rental_id, machine_id, log_date is the shape §16
 * locks; machine_id is denormalized from rentals.machine_id for §17's
 * machine-level history queries) and seeds `logsheet.manage`, granted to
 * `owner`. See docs/execution-and-billing-design.md §4.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("logsheets")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("rental_id", "uuid", (col) =>
      col.notNull().references("rentals.id").onDelete("cascade"),
    )
    .addColumn("machine_id", "uuid", (col) =>
      col.notNull().references("machines.id").onDelete("restrict"),
    )
    .addColumn("log_date", "date", (col) => col.notNull())
    .addColumn("shift", "text")
    .addColumn("operating_hours", "numeric")
    .addColumn("idle_hours", "numeric")
    .addColumn("overtime_hours", "numeric")
    .addColumn("operator_name", "text")
    .addColumn("fuel_consumed", "numeric")
    .addColumn("fuel_unit", "text")
    .addColumn("remarks", "text")
    .addColumn("customer_confirmed", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("logsheets_rental_id_log_date_key", ["rental_id", "log_date"])
    .execute();

  await db.schema
    .createIndex("logsheets_machine_id_idx")
    .on("logsheets")
    .column("machine_id")
    .execute();

  const permission = await db
    .insertInto("permissions")
    .values({ code: "logsheet.manage" })
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
    .where("code", "=", "logsheet.manage")
    .executeTakeFirst();
  if (permission) {
    await db.deleteFrom("role_permissions").where("permission_id", "=", permission.id).execute();
  }
  await db.deleteFrom("permissions").where("code", "=", "logsheet.manage").execute();

  await db.schema.dropTable("logsheets").execute();
}
