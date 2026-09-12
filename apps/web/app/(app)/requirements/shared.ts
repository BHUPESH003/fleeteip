import type { QuotationResponseStatus } from "@fleetip/contracts/quotation";
import type { RequirementStatus } from "@fleetip/contracts/rfq";
import type { StatusMap } from "@fleetip/ui";
import { daysUntil } from "../../../lib/format";

export const REQUIREMENT_STATUS_MAP: StatusMap = {
  open: { label: "Open", tone: "info" },
  closed: { label: "Closed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export const RESPONSE_STATUS_MAP: StatusMap = {
  interested: { label: "Interested", tone: "success" },
  not_interested: { label: "Not interested", tone: "neutral" },
};

export function requirementStatus(status: RequirementStatus) {
  return REQUIREMENT_STATUS_MAP[status];
}

export function responseStatus(status: QuotationResponseStatus) {
  return RESPONSE_STATUS_MAP[status];
}

export function validityTone(validityDate: string): "danger" | "warning" | "neutral" {
  const days = daysUntil(validityDate);
  if (days <= 2) return "danger";
  if (days <= 7) return "warning";
  return "neutral";
}
