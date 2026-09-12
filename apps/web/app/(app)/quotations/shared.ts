import type { CommercialQuotation, QuotationOffer } from "@fleetip/contracts/quotation";
import type { StatusMap } from "@fleetip/ui";
import { daysUntil } from "../../../lib/format";

export const QUOTATION_STATUS_MAP: StatusMap = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Sent", tone: "warning" },
  negotiating: { label: "Negotiating", tone: "info" },
  awarded: { label: "Awarded", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  expired: { label: "Expired", tone: "neutral" },
  withdrawn: { label: "Withdrawn", tone: "danger" },
};

export const OFFER_STATUS_MAP: StatusMap = {
  pending: { label: "Pending", tone: "warning" },
  accepted: { label: "Accepted", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  superseded: { label: "Superseded", tone: "neutral" },
};

/**
 * Awarding requires the Renter's explicit acceptance whenever a real
 * in-app Renter is on the other end — an auction-sourced quotation is
 * exempt (the Renter's earlier participant selection already is that
 * consent). Mirrors the server-side gate in awardQuotation/acceptQuotation
 * — the server remains the real enforcement point regardless of this.
 */
export function needsRenterAcceptance(quotation: CommercialQuotation): boolean {
  return (
    Boolean(quotation.renterOrganizationId) &&
    !quotation.sourceAuctionId &&
    !quotation.renterAcceptedAt
  );
}

export function acceptanceLabel(quotation: CommercialQuotation): { text: string; tone: "success" | "warning" | "neutral" } {
  if (!quotation.renterOrganizationId) return { text: "Not applicable (external client)", tone: "neutral" };
  if (quotation.sourceAuctionId) return { text: "Not applicable (from auction)", tone: "neutral" };
  if (quotation.renterAcceptedAt) return { text: `Accepted ${quotation.renterAcceptedAt.slice(0, 10)}`, tone: "success" };
  return { text: "Awaiting acceptance", tone: "warning" };
}

const RATE_UNIT_DAYS: Record<string, number> = {
  day: 1,
  week: 7,
  month: 30,
};

/** rate x real day-equivalent duration; null when open-ended or rate unit is "shift" (no honest day-equivalent). */
export function contractValue(quotation: CommercialQuotation): number | null {
  if (!quotation.endDate) return null;
  const unitDays = RATE_UNIT_DAYS[quotation.rateUnit];
  if (!unitDays) return null;
  const days = daysUntil(quotation.endDate) - daysUntil(quotation.startDate);
  if (days <= 0) return null;
  return Math.round((days / unitDays) * quotation.rate);
}

export function rateDelta(
  quotation: CommercialQuotation,
  offers: QuotationOffer[],
): { amount: number; tone: "success" | "warning" | "neutral" } | null {
  const opening = offers[0];
  if (!opening) return null;
  const delta = quotation.rate - opening.rate;
  if (delta === 0) return { amount: 0, tone: "neutral" };
  return { amount: delta, tone: delta < 0 ? "success" : "warning" };
}
