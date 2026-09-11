import type { CommercialQuotationStatus } from "@fleetip/contracts/quotation";

const VALID_TRANSITIONS: Record<CommercialQuotationStatus, CommercialQuotationStatus[]> = {
  draft: ["sent", "withdrawn"],
  // A straight accept-as-sent -> awarded is legal — negotiation (via
  // QuotationOffer) is optional, not mandatory. See
  // docs/marketplace-core-loop-design.md §6.
  sent: ["negotiating", "awarded", "rejected", "expired", "withdrawn"],
  negotiating: ["awarded", "rejected", "expired"],
  awarded: [],
  rejected: [],
  expired: [],
  withdrawn: [],
};

export function canTransition(
  from: CommercialQuotationStatus,
  to: CommercialQuotationStatus,
): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
