import { type Kysely, sql } from "kysely";

/**
 * Per-rental activity log, readable by both parties. organization_id is the
 * acting organization (what the other side is shown); actor_user_id is kept
 * for the acting side's own audit but never returned across the party line.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("rental_events")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("rental_id", "uuid", (col) => col.notNull().references("rentals.id").onDelete("cascade"))
    .addColumn("organization_id", "uuid", (col) => col.notNull().references("organizations.id"))
    .addColumn("actor_user_id", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("detail", "jsonb")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("rental_events_rental_id_created_at_idx")
    .on("rental_events")
    .columns(["rental_id", "created_at"])
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("rental_events").execute();
}
