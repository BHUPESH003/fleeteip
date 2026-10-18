import type { Kysely } from "kysely";

/**
 * Makes machines.registration_number nullable.
 *
 * Not every machine has a road registration number: crawler/tracked
 * equipment (crawler cranes, tracked excavators, dozers, etc.) has none at
 * all, so "registration number" is genuinely "not applicable" for them
 * rather than a value that happens to be unknown. The column was created
 * NOT NULL in 0004; the business rule it encoded (every machine has a
 * registration) is wrong, so the constraint is dropped.
 *
 * assetCode remains NOT NULL — it is the fleet's own identifier and is now
 * auto-assigned by EquipmentService.createMachine when the caller doesn't
 * supply one, so it is always present.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("machines")
    .alterColumn("registration_number", (col) => col.dropNotNull())
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  // Backfill any NULLs before restoring NOT NULL, so the down migration can't
  // fail on data created while the column was nullable.
  await db
    .updateTable("machines")
    .set({ registration_number: "" })
    .where("registration_number", "is", null)
    .execute();
  await db.schema
    .alterTable("machines")
    .alterColumn("registration_number", (col) => col.setNotNull())
    .execute();
}
