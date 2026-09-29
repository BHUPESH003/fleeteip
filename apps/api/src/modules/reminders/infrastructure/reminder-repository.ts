import { InvoiceStatus } from "@fleetip/contracts/billing";
import { RentalStatus } from "@fleetip/contracts/rental";
import { type Kysely, sql } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type { ReminderKind, ReminderRepositoryPort } from "../domain/ports.js";

export class ReminderRepository implements ReminderRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  private activeRentals() {
    return this.db
      .selectFrom("rentals")
      .innerJoin("machines", "machines.id", "rentals.machine_id")
      .select([
        "rentals.id",
        "rentals.rental_company_organization_id",
        "rentals.renter_organization_id",
        "rentals.end_date",
        "machines.asset_code",
      ])
      .where("rentals.status", "=", RentalStatus.active);
  }

  listActiveRentalsEndingOn(date: string) {
    return this.activeRentals().where("rentals.end_date", "=", date).execute();
  }

  listActiveRentalsEndedBefore(date: string) {
    return this.activeRentals().where("rentals.end_date", "<", date).execute();
  }

  listUnpaidInvoicesDueBefore(date: string) {
    return this.db
      .selectFrom("invoices")
      .innerJoin("rentals", "rentals.id", "invoices.rental_id")
      .select([
        "invoices.id",
        "invoices.invoice_number",
        "invoices.rental_company_organization_id",
        "invoices.due_date",
        "rentals.renter_organization_id",
      ])
      .where("invoices.status", "in", [InvoiceStatus.issued, InvoiceStatus.overdue])
      .where("invoices.due_date", "<", date)
      .execute();
  }

  listActiveRentalsWithoutLogsheetOn(date: string) {
    return this.activeRentals()
      .where(sql<string>`coalesce(rentals.actual_start_date, rentals.start_date)`, "<=", date)
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom("logsheets")
              .select("logsheets.id")
              .whereRef("logsheets.rental_id", "=", "rentals.id")
              .where("logsheets.log_date", "=", date),
          ),
        ),
      )
      .execute();
  }

  async claim(kind: ReminderKind, recordId: string, businessDate: string) {
    const inserted = await this.db
      .insertInto("reminder_log")
      .values({ kind, record_id: recordId, business_date: businessDate })
      .onConflict((oc) => oc.columns(["kind", "record_id", "business_date"]).doNothing())
      .returning("id")
      .executeTakeFirst();
    return inserted !== undefined;
  }
}
