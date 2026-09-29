import { CommercialQuotationStatus } from "@fleetip/contracts/quotation";

const VALID_TRANSITIONS: Record<CommercialQuotationStatus, CommercialQuotationStatus[]> = {
  draft: [CommercialQuotationStatus.sent, CommercialQuotationStatus.withdrawn],
  // A straight accept-as-sent -> awarded is legal — negotiation (via
  // QuotationOffer) is optional, not mandatory. See
  // docs/marketplace-core-loop-design.md §6.
  sent: [CommercialQuotationStatus.negotiating, CommercialQuotationStatus.awarded, CommercialQuotationStatus.rejected, CommercialQuotationStatus.expired, CommercialQuotationStatus.withdrawn],
  negotiating: [CommercialQuotationStatus.awarded, CommercialQuotationStatus.rejected, CommercialQuotationStatus.expired],
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
