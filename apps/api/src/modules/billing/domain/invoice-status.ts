import { InvoiceStatus } from "@fleetip/contracts/billing";
import { toPaise } from "../../../shared/money.js";

const VALID_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: [InvoiceStatus.issued, InvoiceStatus.cancelled],
  issued: [InvoiceStatus.paid, InvoiceStatus.overdue, InvoiceStatus.cancelled],
  overdue: [InvoiceStatus.paid, InvoiceStatus.cancelled],
  paid: [],
  cancelled: [],
};

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

// Exact paise compare — a float >= would leave 0.1 + 0.2 against 0.3 unpaid.
export function isFullyPaid(totalAmount: number, amountPaid: number): boolean {
  return toPaise(amountPaid) >= toPaise(totalAmount);
}
