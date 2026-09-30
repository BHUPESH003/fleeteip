import { z } from "zod";
import { isoDate } from "../shared/dates.js";

export const invoiceStatusSchema = z.enum(["draft", "issued", "paid", "overdue", "cancelled"]);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
/** InvoiceStatus.x names each value once; `InvoiceStatus` is also the type. */
export const InvoiceStatus = invoiceStatusSchema.enum;

export const invoiceLineItemSchema = z.object({
  id: z.string().uuid(),
  invoiceId: z.string().uuid(),
  description: z.string().min(1).max(300),
  quantity: z.number().positive(),
  rate: z.number().nonnegative(),
  amount: z.number().nonnegative(),
  createdAt: z.string().datetime(),
});
export type InvoiceLineItem = z.infer<typeof invoiceLineItemSchema>;

export const createInvoiceLineItemSchema = z.object({
  description: z.string().min(1).max(300),
  quantity: z.number().positive(),
  rate: z.number().nonnegative(),
});
export type CreateInvoiceLineItem = z.infer<typeof createInvoiceLineItemSchema>;

export const paymentSchema = z.object({
  id: z.string().uuid(),
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  paidDate: isoDate(),
  method: z.string().min(1).max(100).nullable(),
  reference: z.string().min(1).max(200).nullable(),
  notes: z.string().min(1).max(1000).nullable(),
  createdAt: z.string().datetime(),
});
export type Payment = z.infer<typeof paymentSchema>;

export const recordPaymentRequestSchema = z.object({
  amount: z.number().positive(),
  paidDate: isoDate(),
  method: z.string().min(1).max(100).optional(),
  reference: z.string().min(1).max(200).optional(),
  notes: z.string().min(1).max(1000).optional(),
});
export type RecordPaymentRequest = z.infer<typeof recordPaymentRequestSchema>;

export const invoiceSchema = z.object({
  id: z.string().uuid(),
  rentalCompanyOrganizationId: z.string().uuid(),
  rentalId: z.string().uuid(),
  invoiceNumber: z.string(),
  billingPeriodStart: isoDate(),
  billingPeriodEnd: isoDate(),
  status: invoiceStatusSchema,
  subtotal: z.number().nonnegative(),
  taxAmount: z.number().nonnegative(),
  adjustmentAmount: z.number(),
  totalAmount: z.number(),
  dueDate: isoDate(),
  notes: z.string().min(1).max(2000).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Invoice = z.infer<typeof invoiceSchema>;

// List rows carry the payment summary the detail computes, so a list view
// needn't fetch every invoice's detail. Additive over `Invoice`.
export const invoiceListItemSchema = invoiceSchema.extend({
  balanceDue: z.number(),
  // Issued, past its due date, with a balance left — whether or not the lazy
  // issued -> overdue status flip has run yet.
  overdue: z.boolean(),
  // Latest payment date once fully paid; null while a balance remains.
  paidAt: isoDate().nullable(),
});
export type InvoiceListItem = z.infer<typeof invoiceListItemSchema>;

export const invoiceDetailSchema = z.object({
  invoice: invoiceSchema,
  lineItems: z.array(invoiceLineItemSchema),
  payments: z.array(paymentSchema),
  amountPaid: z.number().nonnegative(),
  balanceDue: z.number(),
});
export type InvoiceDetail = z.infer<typeof invoiceDetailSchema>;

export const createInvoiceRequestSchema = z
  .object({
    rentalId: z.string().uuid(),
    billingPeriodStart: isoDate(),
    billingPeriodEnd: isoDate(),
    dueDate: isoDate(),
    taxAmount: z.number().nonnegative().optional(),
    adjustmentAmount: z.number().optional(),
    notes: z.string().min(1).max(2000).optional(),
    lineItems: z.array(createInvoiceLineItemSchema).min(1),
  })
  // No "not in the past" rule on the billing period — invoicing a period
  // that already happened (billing last month's rental) is the normal case.
  .refine((data) => data.billingPeriodEnd >= data.billingPeriodStart, {
    message: "Billing period end cannot be before the billing period start",
    path: ["billingPeriodEnd"],
  })
  .refine((data) => data.dueDate >= data.billingPeriodEnd, {
    message: "Due date cannot be before the billing period ends",
    path: ["dueDate"],
  });
export type CreateInvoiceRequest = z.infer<typeof createInvoiceRequestSchema>;

export const updateInvoiceStatusRequestSchema = z.object({
  status: z.enum(["issued", "cancelled"]),
});
export type UpdateInvoiceStatusRequest = z.infer<typeof updateInvoiceStatusRequestSchema>;
