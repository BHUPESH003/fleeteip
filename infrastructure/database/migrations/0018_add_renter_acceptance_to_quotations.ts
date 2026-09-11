import type { Kysely } from "kysely";

/**
 * Adds commercial_quotations.renter_accepted_at (nullable timestamptz).
 *
 * Closes the same "award to self" gap already fixed for the auction path
 * (auction.selectParticipant/assertSelectedParticipant), but for Paths A/B
 * (RFQ response / direct quotation): a Rental Company could previously send
 * a quotation and award it themselves with zero Renter action. This does
 * NOT add a new CommercialQuotationStatus value — docs/marketplace-core-loop-
 * design.md §6 deliberately keeps status as draft/sent/negotiating/awarded/…
 * only. Acceptance is a separate, orthogonal signal that gates awardQuotation
 * only when a real in-app Renter organization is on the other end (an
 * external client via clientSnapshot has no user account to click Accept —
 * that sub-case is unchanged, same as before).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("commercial_quotations")
    .addColumn("renter_accepted_at", "timestamptz")
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("commercial_quotations").dropColumn("renter_accepted_at").execute();
}
