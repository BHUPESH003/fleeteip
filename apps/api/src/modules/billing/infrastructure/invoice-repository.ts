import type { InvoiceStatus } from "@fleetip/contracts/billing";
import { sql, type Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type {
  CreateInvoiceInput,
  CreatePaymentInput,
  InvoiceLineItemRecord,
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
    const year = new Date().getFullYear();
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
          status: "draft",
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

  async listByRentalCompany(rentalCompanyOrganizationId: string) {
    const rows = await this.db
      .selectFrom("invoices")
      .selectAll()
      .where("rental_company_organization_id", "=", rentalCompanyOrganizationId)
      .orderBy("created_at", "desc")
      .execute();
    return rows as InvoiceRecord[];
  }

  async listByRenter(renterOrganizationId: string) {
    const rows = await this.db
      .selectFrom("invoices")
      .innerJoin("rentals", "rentals.id", "invoices.rental_id")
      .selectAll("invoices")
      .where("rentals.renter_organization_id", "=", renterOrganizationId)
      .orderBy("invoices.created_at", "desc")
      .execute();
    return rows as InvoiceRecord[];
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
      .set({ status: "overdue", updated_at: new Date() })
      .where("id", "=", id)
      .where("status", "=", "issued")
      .where(sql<boolean>`due_date < current_date`)
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
      if (amountPaid >= Number(invoice.total_amount) && invoice.status !== "paid") {
        updatedInvoice = await trx
          .updateTable("invoices")
          .set({ status: "paid", updated_at: new Date() })
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
