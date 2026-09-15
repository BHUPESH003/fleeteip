import type { Kysely } from "kysely";

/**
 * Persists the Renter's "Request quotation" action (previously a
 * fire-and-forget notification only — see docs/decisions.md) onto the
 * QuotationResponse it targets, so the Rental Company can see which of
 * their own "interested" responses are waiting on a formal quotation
 * without depending on still having the notification. Nullable: most
 * responses are never explicitly requested (the Rental Company may just
 * formalize one on their own initiative).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("quotation_responses")
    .addColumn("quotation_requested_at", "timestamptz")
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("quotation_responses").dropColumn("quotation_requested_at").execute();
}
