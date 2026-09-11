import { type Kysely, sql } from "kysely";

/**
 * Creates `maintenance_records` and seeds `maintenance.manage`, granted to
 * `owner`, in this same migration. See docs/execution-and-billing-design.md §2.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("maintenance_records")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("machine_id", "uuid", (col) =>
      col.notNull().references("machines.id").onDelete("cascade"),
    )
    .addColumn("maintenance_type", "text", (col) => col.notNull())
    .addColumn("start_date", "date", (col) => col.notNull())
    .addColumn("end_date", "date")
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("notes", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("maintenance_records_machine_id_idx")
    .on("maintenance_records")
    .column("machine_id")
    .execute();

  const permission = await db
    .insertInto("permissions")
    .values({ code: "maintenance.manage" })
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
    .where("code", "=", "maintenance.manage")
    .executeTakeFirst();
  if (permission) {
    await db.deleteFrom("role_permissions").where("permission_id", "=", permission.id).execute();
  }
  await db.deleteFrom("permissions").where("code", "=", "maintenance.manage").execute();

  await db.schema.dropTable("maintenance_records").execute();
}
