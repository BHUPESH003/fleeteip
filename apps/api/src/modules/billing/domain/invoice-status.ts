import { InvoiceStatus } from "@fleetip/contracts/billing";

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
