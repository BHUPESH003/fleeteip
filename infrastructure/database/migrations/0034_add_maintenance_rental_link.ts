import type { Kysely } from "kysely";

/**
 * A workshop job can be logged against the rental it happened on (a
 * breakdown on site). Nullable: most jobs have no rental. Deleting a rental
 * keeps the job and drops the link.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("maintenance_records")
    .addColumn("rental_id", "uuid", (col) => col.references("rentals.id").onDelete("set null"))
    .execute();

  await db.schema
    .createIndex("maintenance_records_rental_id_idx")
    .on("maintenance_records")
    .column("rental_id")
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("maintenance_records").dropColumn("rental_id").execute();
}
