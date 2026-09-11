import type { InvoiceStatus } from "@fleetip/contracts/billing";

export interface InvoiceRecord {
  id: string;
  rental_company_organization_id: string;
  rental_id: string;
  invoice_number: string;
  billing_period_start: string;
  billing_period_end: string;
  status: InvoiceStatus;
  subtotal: number;
  tax_amount: number;
  adjustment_amount: number;
  total_amount: number;
  due_date: string;
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface InvoiceLineItemRecord {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  created_at: Date | string;
}

export interface PaymentRecord {
  id: string;
  invoice_id: string;
  amount: number;
  paid_date: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  created_at: Date | string;
}

export interface CreateInvoiceLineItemInput {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface CreateInvoiceInput {
  rentalCompanyOrganizationId: string;
  rentalId: string;
  invoiceNumber: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  subtotal: number;
  taxAmount: number;
  adjustmentAmount: number;
  totalAmount: number;
  dueDate: string;
  notes?: string;
  lineItems: CreateInvoiceLineItemInput[];
}

export interface CreatePaymentInput {
  invoiceId: string;
  amount: number;
  paidDate: string;
  method?: string;
  reference?: string;
  notes?: string;
}

export interface InvoiceRepositoryPort {
  nextInvoiceNumber(rentalCompanyOrganizationId: string): Promise<string>;
  create(input: CreateInvoiceInput): Promise<InvoiceRecord>;
  findById(id: string): Promise<InvoiceRecord | undefined>;
  listByRentalCompany(rentalCompanyOrganizationId: string): Promise<InvoiceRecord[]>;
  listByRenter(renterOrganizationId: string): Promise<InvoiceRecord[]>;
  listLineItems(invoiceId: string): Promise<InvoiceLineItemRecord[]>;
  listPayments(invoiceId: string): Promise<PaymentRecord[]>;
  updateStatus(id: string, status: InvoiceStatus): Promise<InvoiceRecord>;
  // Lazily flips issued -> overdue once dueDate has passed — same shape as
  // CommercialQuotation's expireIfDue. See docs/execution-and-billing-design.md §6.
  markOverdueIfDue(id: string): Promise<InvoiceRecord | undefined>;
  // Inserts the payment, then — inside the same transaction — flips the
  // invoice to `paid` if the running payments total now covers totalAmount.
  // A deterministic transition, unlike the lazy overdue check.
  recordPayment(
    input: CreatePaymentInput,
  ): Promise<{ payment: PaymentRecord; invoice: InvoiceRecord }>;
}
