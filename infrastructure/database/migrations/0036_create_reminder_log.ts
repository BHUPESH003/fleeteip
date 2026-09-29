import { type Kysely, sql } from "kysely";

/**
 * One row per reminder actually sent: the unique key makes "once per record
 * per business day" hold across restarts and multiple API processes — the
 * sender inserts first (on conflict do nothing) and notifies only if its
 * insert won.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("reminder_log")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("kind", "text", (col) => col.notNull())
    .addColumn("record_id", "uuid", (col) => col.notNull())
    .addColumn("business_date", "date", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("reminder_log_kind_record_date_key", ["kind", "record_id", "business_date"])
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("reminder_log").execute();
}
