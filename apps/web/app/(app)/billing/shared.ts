import type { InvoiceStatus } from "@fleetip/contracts/billing";
import type { StatusMap } from "@fleetip/ui";

export const INVOICE_STATUS_MAP: StatusMap = {
  draft: { label: "Draft", tone: "neutral" },
  issued: { label: "Issued", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  overdue: { label: "Overdue", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

// Only the manually-triggerable subset — see docs/frontend-backend-gap-report.md
// notes on Phase 8: `paid` and `overdue` are server-only transitions
// (invoice-status.ts's canTransition allows more, but updateInvoiceStatus's
// own request schema only ever accepts "issued"/"cancelled" from a client).
export function legalNextInvoiceStatuses(current: InvoiceStatus): Array<"issued" | "cancelled"> {
  if (current === "draft") return ["issued", "cancelled"];
  if (current === "issued") return ["cancelled"];
  return [];
}
