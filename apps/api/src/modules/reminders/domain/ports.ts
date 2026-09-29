/** A rental a reminder is about. renter is null for an external (non-FleetIP) client. */
export interface ReminderRentalRecord {
  id: string;
  rental_company_organization_id: string;
  renter_organization_id: string | null;
  asset_code: string;
  end_date: string | null;
}

export interface ReminderInvoiceRecord {
  id: string;
  invoice_number: string;
  rental_company_organization_id: string;
  renter_organization_id: string | null;
  due_date: string;
}

export type ReminderKind = "rental_ending_soon" | "rental_end_passed" | "invoice_overdue" | "logsheet_missing";

export interface ReminderRepositoryPort {
  listActiveRentalsEndingOn(date: string): Promise<ReminderRentalRecord[]>;
  listActiveRentalsEndedBefore(date: string): Promise<ReminderRentalRecord[]>;
  /** Issued (or already flipped to overdue) invoices whose due date is before `date`. */
  listUnpaidInvoicesDueBefore(date: string): Promise<ReminderInvoiceRecord[]>;
  /** Active rentals already started by `date` with no logsheet dated `date`. */
  listActiveRentalsWithoutLogsheetOn(date: string): Promise<ReminderRentalRecord[]>;
  /**
   * Records that this reminder is being sent. True only for the first caller
   * per (kind, record, business date) — across restarts and processes.
   */
  claim(kind: ReminderKind, recordId: string, businessDate: string): Promise<boolean>;
}
