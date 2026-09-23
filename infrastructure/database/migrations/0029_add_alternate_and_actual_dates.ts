import type { Kysely } from "kysely";

/**
 * Two independent additions that happen to land together:
 *
 * - `commercial_quotations` gains a formal alternate-date request/approval
 *   mechanism (proposed_alternate_start/end_date, alternate_date_status,
 *   alternate_date_reason) — once a quotation's dates are locked to its
 *   Requirement's own dates at creation, this becomes the one sanctioned
 *   channel for the Rental Company to ask for a schedule change, which the
 *   Renter must explicitly accept or reject (see docs/decisions.md).
 *
 * - `rentals` gains actual start/end dates plus a verification status, so a
 *   planned-vs-actual buffer can be tracked and the Renter can verify or
 *   dispute what the Rental Company recorded — modeled after
 *   QuotationOffer's pending/accepted/rejected shape rather than another
 *   silent self-attested boolean like Logsheet's customerConfirmed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("commercial_quotations")
    .addColumn("proposed_alternate_start_date", "date")
    .execute();
  await db.schema
    .alterTable("commercial_quotations")
    .addColumn("proposed_alternate_end_date", "date")
    .execute();
  await db.schema
    .alterTable("commercial_quotations")
    .addColumn("alternate_date_status", "text", (col) => col.notNull().defaultTo("none"))
    .execute();
  await db.schema
    .alterTable("commercial_quotations")
    .addColumn("alternate_date_reason", "text")
    .execute();

  await db.schema.alterTable("rentals").addColumn("actual_start_date", "date").execute();
  await db.schema.alterTable("rentals").addColumn("actual_end_date", "date").execute();
  await db.schema
    .alterTable("rentals")
    .addColumn("actual_dates_verification_status", "text")
    .execute();
  await db.schema.alterTable("rentals").addColumn("actual_dates_dispute_reason", "text").execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("rentals").dropColumn("actual_dates_dispute_reason").execute();
  await db.schema.alterTable("rentals").dropColumn("actual_dates_verification_status").execute();
  await db.schema.alterTable("rentals").dropColumn("actual_end_date").execute();
  await db.schema.alterTable("rentals").dropColumn("actual_start_date").execute();

  await db.schema.alterTable("commercial_quotations").dropColumn("alternate_date_reason").execute();
  await db.schema.alterTable("commercial_quotations").dropColumn("alternate_date_status").execute();
  await db.schema
    .alterTable("commercial_quotations")
    .dropColumn("proposed_alternate_end_date")
    .execute();
  await db.schema
    .alterTable("commercial_quotations")
    .dropColumn("proposed_alternate_start_date")
    .execute();
}
