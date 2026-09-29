import { InvoiceStatus } from "@fleetip/contracts/billing";
import { sql, type Kysely } from "kysely";
import type { InvoiceListParams } from "@fleetip/contracts/list";
import type { Database } from "../../../infrastructure/database/types.js";
import { executePage } from "../../../infrastructure/database/list-page.js";
import { todayInBusinessZone } from "../../../shared/business-date.js";
import { containsPattern, type ParsedListQuery } from "../../../shared/list-query.js";
import { isFullyPaid } from "../domain/invoice-status.js";
import type {
  CreateInvoiceInput,
  CreatePaymentInput,
  InvoiceLineItemRecord,
  InvoiceListRecord,
  InvoiceRecord,
  InvoiceRepositoryPort,
  PaymentRecord,
} from "../domain/ports.js";

const INVOICE_COLUMNS = [
  "id",
  "rental_company_organization_id",
  "rental_id",
  "invoice_number",
  "billing_period_start",
  "billing_period_end",
  "status",
  "subtotal",
  "tax_amount",
  "adjustment_amount",
  "total_amount",
  "due_date",
  "notes",
  "created_at",
  "updated_at",
] as const;

const PAYMENT_COLUMNS = [
  "id",
  "invoice_id",
  "amount",
  "paid_date",
  "method",
  "reference",
  "notes",
  "created_at",
] as const;

export class InvoiceRepository implements InvoiceRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async nextInvoiceNumber(rentalCompanyOrganizationId: string): Promise<string> {
    const result = await sql<{ value: string }>`
      INSERT INTO invoice_reference_sequences (organization_id, next_value)
      VALUES (${rentalCompanyOrganizationId}, 2)
      ON CONFLICT (organization_id)
      DO UPDATE SET next_value = invoice_reference_sequences.next_value + 1
      RETURNING next_value - 1 AS value
    `.execute(this.db);
    const value = result.rows[0]?.value;
    const year = todayInBusinessZone().slice(0, 4);
    return `INV-${year}-${value}`;
  }

  async create(input: CreateInvoiceInput): Promise<InvoiceRecord> {
    return this.db.transaction().execute(async (trx) => {
      const invoiceRow = await trx
        .insertInto("invoices")
        .values({
          rental_company_organization_id: input.rentalCompanyOrganizationId,
          rental_id: input.rentalId,
          invoice_number: input.invoiceNumber,
          billing_period_start: input.billingPeriodStart,
          billing_period_end: input.billingPeriodEnd,
          status: InvoiceStatus.draft,
          subtotal: input.subtotal,
          tax_amount: input.taxAmount,
          adjustment_amount: input.adjustmentAmount,
          total_amount: input.totalAmount,
          due_date: input.dueDate,
          notes: input.notes ?? null,
        })
        .returning(INVOICE_COLUMNS)
        .executeTakeFirstOrThrow();

      await trx
        .insertInto("invoice_line_items")
        .values(
          input.lineItems.map((item) => ({
            invoice_id: invoiceRow.id,
            description: item.description,
            quantity: item.quantity,
            rate: item.rate,
            amount: item.amount,
          })),
        )
        .execute();

      return invoiceRow as InvoiceRecord;
    });
  }

  async findById(id: string) {
    const row = await this.db
      .selectFrom("invoices")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row as InvoiceRecord | undefined;
  }

  // One query: each invoice with its payment total / latest payment date.
  // "Past due" uses the business day as a parameter, not the DB session's
  // current_date (risk register §2.5).
  private selectInvoicesWithPayments(today = todayInBusinessZone()) {
    return this.db
      .selectFrom("invoices")
      .leftJoin(
        (eb) =>
          eb
            .selectFrom("payments")
            .select((eb) => [
              "invoice_id",
              eb.fn.sum<number>("amount").as("amount_paid"),
              eb.fn.max("paid_date").as("last_paid_date"),
            ])
            .groupBy("invoice_id")
            .as("payment_totals"),
        (join) => join.onRef("payment_totals.invoice_id", "=", "invoices.id"),
      )
      .selectAll("invoices")
      .select([
        sql<number>`coalesce(payment_totals.amount_paid, 0)`.as("amount_paid"),
        "payment_totals.last_paid_date",
        sql<boolean>`invoices.due_date < ${today}::date`.as("past_due"),
      ]);
  }

  async listByRentalCompany(rentalCompanyOrganizationId: string) {
    const rows = await this.selectInvoicesWithPayments()
      .where("invoices.rental_company_organization_id", "=", rentalCompanyOrganizationId)
      .orderBy("invoices.created_at", "desc")
      .execute();
    return rows as InvoiceListRecord[];
  }

  async listByRenter(renterOrganizationId: string) {
    const rows = await this.selectInvoicesWithPayments()
      .innerJoin("rentals", "rentals.id", "invoices.rental_id")
      .where("rentals.renter_organization_id", "=", renterOrganizationId)
      .orderBy("invoices.created_at", "desc")
      .execute();
    return rows as InvoiceListRecord[];
  }

  async listInvoicesPage(
    party: "rentalCompany" | "renter",
    organizationId: string,
    query: ParsedListQuery<InvoiceListParams>,
  ) {
    const today = todayInBusinessZone();
    let q = this.selectInvoicesWithPayments(today);
    q =
      party === "rentalCompany"
        ? q.where("invoices.rental_company_organization_id", "=", organizationId)
        : q.where("invoices.rental_id", "in", (eb) =>
            eb.selectFrom("rentals").select("rentals.id").where("rentals.renter_organization_id", "=", organizationId),
          );
    if (query.status === InvoiceStatus.overdue) {
      // Matches the list's `overdue` flag: flipped already, or issued and past due.
      q = q.where((eb) =>
        eb.or([
          eb("invoices.status", "=", InvoiceStatus.overdue),
          eb.and([eb("invoices.status", "=", InvoiceStatus.issued), eb("invoices.due_date", "<", today)]),
        ]),
      );
    } else if (query.status) {
      q = q.where("invoices.status", "=", query.status);
    }
    if (query.rentalId) q = q.where("invoices.rental_id", "=", query.rentalId);
    if (query.from) q = q.where("invoices.due_date", ">=", query.from);
    if (query.to) q = q.where("invoices.due_date", "<=", query.to);
    if (query.q) q = q.where("invoices.invoice_number", "ilike", containsPattern(query.q));
    const sortColumn = { createdAt: "invoices.created_at", dueDate: "invoices.due_date" }[query.sort];
    return executePage(q, sortColumn, "invoices.id", query, (row) => row as InvoiceListRecord);
  }

  async listLineItems(invoiceId: string) {
    const rows = await this.db
      .selectFrom("invoice_line_items")
      .selectAll()
      .where("invoice_id", "=", invoiceId)
      .execute();
    return rows as InvoiceLineItemRecord[];
  }

  async listPayments(invoiceId: string) {
    const rows = await this.db
      .selectFrom("payments")
      .selectAll()
      .where("invoice_id", "=", invoiceId)
      .orderBy("paid_date", "asc")
      .execute();
    return rows as PaymentRecord[];
  }

  async updateStatus(id: string, status: InvoiceStatus) {
    const row = await this.db
      .updateTable("invoices")
      .set({ status, updated_at: new Date() })
      .where("id", "=", id)
      .returning(INVOICE_COLUMNS)
      .executeTakeFirstOrThrow();
    return row as InvoiceRecord;
  }

  async markOverdueIfDue(id: string) {
    const row = await this.db
      .updateTable("invoices")
      .set({ status: InvoiceStatus.overdue, updated_at: new Date() })
      .where("id", "=", id)
      .where("status", "=", InvoiceStatus.issued)
      .where("due_date", "<", todayInBusinessZone())
      .returning(INVOICE_COLUMNS)
      .executeTakeFirst();
    if (row) return row as InvoiceRecord;
    return this.findById(id);
  }

  async recordPayment(input: CreatePaymentInput) {
    return this.db.transaction().execute(async (trx) => {
      const paymentRow = await trx
        .insertInto("payments")
        .values({
          invoice_id: input.invoiceId,
          amount: input.amount,
          paid_date: input.paidDate,
          method: input.method ?? null,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
        })
        .returning(PAYMENT_COLUMNS)
        .executeTakeFirstOrThrow();

      const invoice = await trx
        .selectFrom("invoices")
        .selectAll()
        .where("id", "=", input.invoiceId)
        .executeTakeFirstOrThrow();

      const sumResult = await sql<{ total: string }>`
        SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE invoice_id = ${input.invoiceId}
      `.execute(trx);
      const amountPaid = Number(sumResult.rows[0]?.total ?? 0);

      let updatedInvoice = invoice;
      if (isFullyPaid(Number(invoice.total_amount), amountPaid) && invoice.status !== InvoiceStatus.paid) {
        updatedInvoice = await trx
          .updateTable("invoices")
          .set({ status: InvoiceStatus.paid, updated_at: new Date() })
          .where("id", "=", input.invoiceId)
          .returning(INVOICE_COLUMNS)
          .executeTakeFirstOrThrow();
      }

      return {
        payment: paymentRow as PaymentRecord,
        invoice: updatedInvoice as InvoiceRecord,
      };
    });
  }
}
