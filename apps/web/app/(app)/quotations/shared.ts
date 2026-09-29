import {
  CommercialQuotationStatus,
  type CommercialQuotation,
  type QuotationOffer,
  type ResponsibleParty,
} from "@fleetip/contracts/quotation";
import type { OperatorScope } from "@fleetip/contracts/rental";
import type { BadgeTone } from "@fleetip/ui";
import { daysBetween, formatDateTime } from "../../../lib/format";
import { validityInfo, type ValidityInfo } from "../requirements/shared";

/** Terms, scope items and counter-offers can change only in these (CommercialQuotationService EDITABLE_STATUSES). */
/** Terms and scope items are frozen once sent (the API enforces the same rule). */
export function canEditTerms(status: CommercialQuotationStatus): boolean {
  return status === CommercialQuotationStatus.draft;
}

/** Still in play: the validity date matters until it's accepted, rejected or closed. */
function isOpen(status: CommercialQuotationStatus): boolean {
  return status === CommercialQuotationStatus.draft || isNegotiable(status);
}

/** Offers, acceptance, rejection, award and alternate dates need a sent quotation. */
export function isNegotiable(status: CommercialQuotationStatus): boolean {
  return status === CommercialQuotationStatus.sent || status === CommercialQuotationStatus.negotiating;
}

/**
 * Awarding requires the Renter's explicit acceptance whenever a real
 * in-app Renter is on the other end — including a quotation sourced from an
 * auction. (An earlier version exempted auction-sourced quotations on the
 * reasoning that selecting a participant was already consent — that was
 * wrong: selection only picks who gets to quote, not the terms they later
 * set, so the Rental Company could award those terms unilaterally with no
 * Accept/counter-offer option ever shown to the Renter. Reverted.)
 * Mirrors the server-side gate in awardQuotation/acceptQuotation — the
 * server remains the real enforcement point regardless of this.
 */
export function needsRenterAcceptance(quotation: CommercialQuotation): boolean {
  return Boolean(quotation.renterOrganizationId) && !quotation.renterAcceptedAt;
}

export interface AcceptanceLabel {
  text: string;
  tone: BadgeTone;
  title: string;
}

/**
 * Acceptance is a timestamp (renterAcceptedAt), not a status — there is no
 * "accepted" quotation status (docs/marketplace-core-loop-design.md §6), and
 * any change to the terms clears it. Rendered as a derived label, never a chip.
 */
export function acceptanceLabel(quotation: CommercialQuotation, viewer: "renter" | "rental_company"): AcceptanceLabel | null {
  if (quotation.renterAcceptedAt) {
    return {
      text: viewer === "renter" ? "Accepted by you" : "Accepted by customer",
      tone: "success",
      title: `Accepted ${formatDateTime(quotation.renterAcceptedAt)}. A change to the terms clears it.`,
    };
  }
  if (!isNegotiable(quotation.status)) return null;
  if (!quotation.renterOrganizationId) {
    return {
      text: "Customer not on FleetIP",
      tone: "neutral",
      title: "No acceptance step in FleetIP — award it once you've agreed terms with the customer.",
    };
  }
  return viewer === "renter"
    ? { text: "Not accepted yet", tone: "warning", title: "You haven't accepted these terms yet." }
    : { text: "Waiting for acceptance", tone: "warning", title: "The customer hasn't accepted these terms yet. Award needs their acceptance." };
}

/** Validity only matters while the quotation can still be answered; it lapses (expires) after this date. */
export function quotationValidity(quotation: CommercialQuotation, today: string): ValidityInfo | null {
  if (!isOpen(quotation.status)) return null;
  const info = validityInfo(quotation.validityDate, today);
  return info.days < 0 ? { ...info, label: "Lapsed" } : info;
}

const RATE_UNIT_DAYS: Record<string, number> = { day: 1, week: 7, month: 30 };

/**
 * Rate × day-equivalent duration — an estimate. Null when open-ended or the
 * rate is per shift (no honest day-equivalent).
 */
export function contractValue(quotation: Pick<CommercialQuotation, "startDate" | "endDate" | "rate" | "rateUnit">): number | null {
  if (!quotation.endDate) return null;
  const unitDays = RATE_UNIT_DAYS[quotation.rateUnit];
  if (!unitDays) return null;
  const days = daysBetween(quotation.startDate, quotation.endDate);
  if (days <= 0) return null;
  return Math.round((days / unitDays) * quotation.rate);
}

/** Change from the opening offer; null when nobody has made an offer. */
export function rateDelta(quotation: CommercialQuotation, offers: QuotationOffer[]): number | null {
  const opening = offers[0];
  if (!opening) return null;
  return quotation.rate - opening.rate;
}

export const RESPONSIBLE_PARTY_LABEL: Record<ResponsibleParty, string> = {
  client: "Customer's scope",
  company: "Rental company's scope",
};

export const RESPONSIBLE_PARTY_OPTIONS = (Object.keys(RESPONSIBLE_PARTY_LABEL) as ResponsibleParty[]).map((value) => ({
  value,
  label: RESPONSIBLE_PARTY_LABEL[value],
}));

export const OPERATOR_LABEL: Record<OperatorScope, string> = {
  with_operator: "With operator",
  without_operator: "Without operator",
};

export const OPERATOR_OPTIONS = (Object.keys(OPERATOR_LABEL) as OperatorScope[]).map((value) => ({
  value,
  label: OPERATOR_LABEL[value],
}));

/** Customer on a quotation: a FleetIP Renter (name needs quotation.manage to resolve) or a client snapshot. */
export function quotationCustomer(quotation: CommercialQuotation, renterNames: Map<string, string> | null): { name: string; note: string } {
  if (quotation.clientSnapshot) return { name: quotation.clientSnapshot.name, note: "Not on FleetIP · details as entered" };
  if (quotation.renterOrganizationId) {
    const name = renterNames?.get(quotation.renterOrganizationId);
    return name
      ? { name, note: "FleetIP customer" }
      : { name: "FleetIP customer", note: renterNames ? "Organization not found" : "Name needs the Quotations permission" };
  }
  return { name: "Customer not recorded", note: "" };
}
