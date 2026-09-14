import type {
  CreateInvoiceRequest,
  Invoice,
  InvoiceDetail,
  InvoiceLineItem,
  Payment,
  RecordPaymentRequest,
} from "@fleetip/contracts/billing";
import { ConflictError, ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import type { RentalRepositoryPort } from "../../marketplace/rental/domain/ports.js";
import { PermissionService } from "../../permissions/application/permission-service.js";
import { NotificationService } from "../../notification/application/notification-service.js";
import { canTransition } from "../domain/invoice-status.js";
import type {
  InvoiceLineItemRecord,
  InvoiceRecord,
  InvoiceRepositoryPort,
  PaymentRecord,
} from "../domain/ports.js";

function toInvoice(record: InvoiceRecord): Invoice {
  return {
    id: record.id,
    rentalCompanyOrganizationId: record.rental_company_organization_id,
    rentalId: record.rental_id,
    invoiceNumber: record.invoice_number,
    billingPeriodStart: record.billing_period_start,
    billingPeriodEnd: record.billing_period_end,
    status: record.status,
    subtotal: record.subtotal,
    taxAmount: record.tax_amount,
    adjustmentAmount: record.adjustment_amount,
    totalAmount: record.total_amount,
    dueDate: record.due_date,
    notes: record.notes,
    createdAt: new Date(record.created_at).toISOString(),
    updatedAt: new Date(record.updated_at).toISOString(),
  };
}

function toLineItem(record: InvoiceLineItemRecord): InvoiceLineItem {
  return {
    id: record.id,
    invoiceId: record.invoice_id,
    description: record.description,
    quantity: record.quantity,
    rate: record.rate,
    amount: record.amount,
    createdAt: new Date(record.created_at).toISOString(),
  };
}

function toPayment(record: PaymentRecord): Payment {
  return {
    id: record.id,
    invoiceId: record.invoice_id,
    amount: record.amount,
    paidDate: record.paid_date,
    method: record.method,
    reference: record.reference,
    notes: record.notes,
    createdAt: new Date(record.created_at).toISOString(),
  };
}

export class BillingService {
  constructor(
    private readonly invoiceRepository: InvoiceRepositoryPort,
    private readonly rentalRepository: RentalRepositoryPort,
    private readonly permissionService: PermissionService,
    private readonly notificationService: NotificationService,
  ) {}

  // Best-effort side effect — never blocks the real business action. See
  // CommercialQuotationService's identical wrapper for why.
  private async notify(input: Parameters<NotificationService["notify"]>[0]): Promise<void> {
    try {
      await this.notificationService.notify(input);
    } catch {
      // swallow
    }
  }

  private async notifyRenterOfInvoice(
    rentalId: string,
    input: Omit<Parameters<NotificationService["notify"]>[0], "recipientOrganizationId">,
  ): Promise<void> {
    const rental = await this.rentalRepository.findById(rentalId);
    if (!rental?.renter_organization_id) return;
    await this.notify({ ...input, recipientOrganizationId: rental.renter_organization_id });
  }

  async createInvoice(
    userId: string,
    rentalCompanyOrganizationId: string,
    input: CreateInvoiceRequest,
  ): Promise<Invoice> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "billing.manage",
    );
    const rental = await this.rentalRepository.findById(input.rentalId);
    if (!rental || rental.rental_company_organization_id !== rentalCompanyOrganizationId) {
      throw new NotFoundError("Rental not found in this organization");
    }

    const lineItems = input.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      rate: item.rate,
      amount: item.quantity * item.rate,
    }));
    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const taxAmount = input.taxAmount ?? 0;
    const adjustmentAmount = input.adjustmentAmount ?? 0;
    const totalAmount = subtotal + taxAmount + adjustmentAmount;

    const invoiceNumber = await this.invoiceRepository.nextInvoiceNumber(
      rentalCompanyOrganizationId,
    );

    const record = await this.invoiceRepository.create({
      rentalCompanyOrganizationId,
      rentalId: input.rentalId,
      invoiceNumber,
      billingPeriodStart: input.billingPeriodStart,
      billingPeriodEnd: input.billingPeriodEnd,
      subtotal,
      taxAmount,
      adjustmentAmount,
      totalAmount,
      dueDate: input.dueDate,
      notes: input.notes,
      lineItems,
    });
    return toInvoice(record);
  }

  async listInvoices(userId: string, organizationId: string): Promise<Invoice[]> {
    const canManage = await this.permissionService.hasPermission(
      userId,
      organizationId,
      "billing.manage",
    );
    if (canManage) {
      const records = await this.invoiceRepository.listByRentalCompany(organizationId);
      return records.map(toInvoice);
    }
    const canRespond = await this.permissionService.hasPermission(
      userId,
      organizationId,
      "billing.respond",
    );
    if (canRespond) {
      const records = await this.invoiceRepository.listByRenter(organizationId);
      return records.map(toInvoice);
    }
    throw new ForbiddenError();
  }

  async getInvoiceDetail(
    userId: string,
    organizationId: string,
    invoiceId: string,
  ): Promise<InvoiceDetail> {
    const canManage = await this.permissionService.hasPermission(
      userId,
      organizationId,
      "billing.manage",
    );
    const canRespond =
      !canManage &&
      (await this.permissionService.hasPermission(userId, organizationId, "billing.respond"));
    if (!canManage && !canRespond) throw new ForbiddenError();

    let record = await this.invoiceRepository.findById(invoiceId);
    if (!record) throw new NotFoundError("Invoice not found");
    record = (await this.invoiceRepository.markOverdueIfDue(invoiceId)) ?? record;

    const isRentalCompanyParty = record.rental_company_organization_id === organizationId;
    let isRenterParty = false;
    if (!isRentalCompanyParty) {
      const rental = await this.rentalRepository.findById(record.rental_id);
      isRenterParty = rental?.renter_organization_id === organizationId;
    }
    if (!isRentalCompanyParty && !isRenterParty) {
      throw new NotFoundError("Invoice not found");
    }

    const [lineItems, payments] = await Promise.all([
      this.invoiceRepository.listLineItems(invoiceId),
      this.invoiceRepository.listPayments(invoiceId),
    ]);
    const amountPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);

    return {
      invoice: toInvoice(record),
      lineItems: lineItems.map(toLineItem),
      payments: payments.map(toPayment),
      amountPaid,
      balanceDue: record.total_amount - amountPaid,
    };
  }

  async updateInvoiceStatus(
    userId: string,
    rentalCompanyOrganizationId: string,
    invoiceId: string,
    status: "issued" | "cancelled",
  ): Promise<Invoice> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "billing.manage",
    );
    const existing = await this.requireOwnedInvoice(rentalCompanyOrganizationId, invoiceId);
    if (!canTransition(existing.status, status)) {
      throw new ConflictError(`Cannot transition invoice from ${existing.status} to ${status}`);
    }
    const record = await this.invoiceRepository.updateStatus(invoiceId, status);
    if (status === "issued") {
      await this.notifyRenterOfInvoice(record.rental_id, {
        type: "billing.invoice_issued",
        title: "Invoice issued",
        message: `Invoice ${record.invoice_number} has been issued.`,
        relatedResourceType: "invoice",
        relatedResourceId: record.id,
      });
    }
    return toInvoice(record);
  }

  async recordPayment(
    userId: string,
    rentalCompanyOrganizationId: string,
    invoiceId: string,
    input: RecordPaymentRequest,
  ): Promise<Invoice> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "billing.manage",
    );
    const existing = await this.requireOwnedInvoice(rentalCompanyOrganizationId, invoiceId);
    if (existing.status !== "issued" && existing.status !== "overdue") {
      throw new ConflictError("Payments can only be recorded against an issued invoice");
    }

    const { invoice } = await this.invoiceRepository.recordPayment({
      invoiceId,
      amount: input.amount,
      paidDate: input.paidDate,
      method: input.method,
      reference: input.reference,
      notes: input.notes,
    });
    await this.notifyRenterOfInvoice(invoice.rental_id, {
      type: "billing.payment_recorded",
      title: "Payment recorded",
      message: `A payment of ${input.amount} was recorded against invoice ${invoice.invoice_number}.`,
      relatedResourceType: "invoice",
      relatedResourceId: invoice.id,
    });
    return toInvoice(invoice);
  }

  private async requireOwnedInvoice(
    rentalCompanyOrganizationId: string,
    invoiceId: string,
  ): Promise<InvoiceRecord> {
    let existing = await this.invoiceRepository.findById(invoiceId);
    if (!existing || existing.rental_company_organization_id !== rentalCompanyOrganizationId) {
      throw new NotFoundError("Invoice not found in this organization");
    }
    existing = (await this.invoiceRepository.markOverdueIfDue(invoiceId)) ?? existing;
    return existing;
  }
}
