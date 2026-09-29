import type { Kysely } from "kysely";

/**
 * A pending change to a rental's planned dates, proposed by the Rental
 * Company and accepted or rejected by the Renter — the same
 * propose/respond shape as commercial_quotations' alternate dates (0029).
 * One proposal at a time: date_change_proposed_at IS NOT NULL means one is
 * pending; accept, reject and withdraw all clear the four columns.
 * proposed_end_date NULL with a pending proposal means "open-ended".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("rentals")
    .addColumn("proposed_start_date", "date")
    .addColumn("proposed_end_date", "date")
    .addColumn("date_change_reason", "text")
    .addColumn("date_change_proposed_at", "timestamptz")
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("rentals")
    .dropColumn("date_change_proposed_at")
    .dropColumn("date_change_reason")
    .dropColumn("proposed_end_date")
    .dropColumn("proposed_start_date")
    .execute();
}
