import { InvoiceStatus, type Invoice, type InvoiceDetail } from "@fleetip/contracts/billing";
import type { Rental } from "@fleetip/contracts/rental";
import { daysBetween } from "../../../lib/format";

// Only the client-writable subset: updateInvoiceStatus's request schema
// accepts "issued" | "cancelled" only — `paid` and `overdue` are
// server-side transitions (a payment that covers the total marks it paid;
// getInvoiceDetail flips an issued invoice past its due date to overdue).
// The server also lets an overdue invoice be cancelled (invoice-status.ts).
export function legalNextInvoiceStatuses(current: InvoiceStatus): Array<typeof InvoiceStatus.issued | typeof InvoiceStatus.cancelled> {
  if (current === InvoiceStatus.draft) return [InvoiceStatus.issued, InvoiceStatus.cancelled];
  if (current === InvoiceStatus.issued || current === InvoiceStatus.overdue) return [InvoiceStatus.cancelled];
  return [];
}

export function isUnpaid(status: InvoiceStatus): status is typeof InvoiceStatus.issued | typeof InvoiceStatus.overdue {
  return status === InvoiceStatus.issued || status === InvoiceStatus.overdue;
}

/**
 * The freshest stored status. The list can lag the detail: fetching the
 * detail is what flips issued → overdue (plan §1), so the newer record wins.
 */
export function storedStatus(invoice: Invoice, detail: InvoiceDetail | null | undefined): InvoiceStatus {
  if (detail && detail.invoice.updatedAt >= invoice.updatedAt) return detail.invoice.status;
  return invoice.status;
}

/** Stored status, with an issued invoice past its due date read as overdue. */
export function effectiveStatus(invoice: Invoice, detail: InvoiceDetail | null | undefined, today: string): InvoiceStatus {
  const status = storedStatus(invoice, detail);
  return status === InvoiceStatus.issued && invoice.dueDate < today ? InvoiceStatus.overdue : status;
}

export function daysOverdue(invoice: Invoice, today: string): number {
  return Math.max(0, daysBetween(invoice.dueDate, today));
}

/** Customer as the rental records it: an external client snapshot or a FleetIP organization. */
export function customerOf(rental: Rental | undefined, names: Map<string, string>): { name: string; onFleetIp: boolean } | null {
  if (!rental) return null;
  if (rental.clientSnapshot) return { name: rental.clientSnapshot.name, onFleetIp: false };
  if (rental.renterOrganizationId) return { name: names.get(rental.renterOrganizationId) ?? "FleetIP customer", onFleetIp: true };
  return null;
}

/** Runs `worker` over `items`, at most `size` at a time (invoice details are one call each — ticket d). */
export async function runPool<T>(items: T[], size: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(lanes);
}
