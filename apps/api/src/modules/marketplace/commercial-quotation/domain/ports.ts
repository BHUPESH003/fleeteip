import type { ClientSnapshot, OperatorScope, RateUnit } from "@fleetip/contracts/rental";
import type { CommercialQuotationStatus, QuotationOfferStatus } from "@fleetip/contracts/quotation";

export interface CommercialQuotationRecord {
  id: string;
  rental_company_organization_id: string;
  renter_organization_id: string | null;
  client_snapshot: ClientSnapshot | null;
  requirement_id: string | null;
  quotation_response_id: string | null;
  source_auction_id: string | null;
  reference_number: string;
  machine_id: string;
  start_date: string;
  end_date: string | null;
  rate: number;
  rate_unit: RateUnit;
  mobilization_charge: number | null;
  demobilization_charge: number | null;
  overtime_rate: number | null;
  payment_terms: string | null;
  shift_structure: string | null;
  sunday_condition: string | null;
  fuel_norms: string | null;
  dehire_terms: string | null;
  operator_scope: OperatorScope | null;
  notice_period_days: number | null;
  validity_date: string;
  commercial_notes: string | null;
  status: CommercialQuotationStatus;
  renter_accepted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateCommercialQuotationInput {
  rentalCompanyOrganizationId: string;
  renterOrganizationId?: string;
  clientSnapshot?: ClientSnapshot;
  requirementId?: string;
  quotationResponseId?: string;
  sourceAuctionId?: string;
  referenceNumber: string;
  machineId: string;
  startDate: string;
  endDate?: string;
  rate: number;
  rateUnit: RateUnit;
  mobilizationCharge?: number;
  demobilizationCharge?: number;
  overtimeRate?: number;
  paymentTerms?: string;
  shiftStructure?: string;
  sundayCondition?: string;
  fuelNorms?: string;
  dehireTerms?: string;
  operatorScope?: OperatorScope;
  noticePeriodDays?: number;
  validityDate: string;
  commercialNotes?: string;
}

export interface UpdateCommercialQuotationTermsInput {
  mobilizationCharge?: number;
  demobilizationCharge?: number;
  overtimeRate?: number;
  paymentTerms?: string;
  shiftStructure?: string;
  sundayCondition?: string;
  fuelNorms?: string;
  dehireTerms?: string;
  operatorScope?: OperatorScope;
  noticePeriodDays?: number;
  commercialNotes?: string;
}

// Written when an offer is accepted — the negotiable subset only. See
// docs/marketplace-core-loop-design.md §7.
export interface ApplyAcceptedOfferInput {
  rate: number;
  rateUnit: RateUnit;
  startDate: string;
  endDate: string | null;
}

export interface CommercialQuotationRepositoryPort {
  nextReferenceNumber(rentalCompanyOrganizationId: string): Promise<string>;
  create(input: CreateCommercialQuotationInput): Promise<CommercialQuotationRecord>;
  findById(id: string): Promise<CommercialQuotationRecord | undefined>;
  listByRentalCompany(rentalCompanyOrganizationId: string): Promise<CommercialQuotationRecord[]>;
  listByRenter(renterOrganizationId: string): Promise<CommercialQuotationRecord[]>;
  updateTerms(
    id: string,
    updates: UpdateCommercialQuotationTermsInput,
  ): Promise<CommercialQuotationRecord>;
  applyAcceptedOffer(
    id: string,
    input: ApplyAcceptedOfferInput,
  ): Promise<CommercialQuotationRecord>;
  updateStatus(id: string, status: CommercialQuotationStatus): Promise<CommercialQuotationRecord>;
  // Sets/clears renter_accepted_at — the Renter's explicit "I accept these
  // terms" signal, independent of `status` (see 0018's migration comment).
  // Any subsequent term change (a direct edit or a new negotiation offer)
  // clears it back to null so a stale acceptance can never cover new terms.
  setRenterAccepted(id: string, accepted: boolean): Promise<CommercialQuotationRecord>;
  // Lazily flips sent/negotiating -> expired once validityDate has passed —
  // a plain guarded UPDATE, no lock needed (unlike Auction's close, nothing
  // else races against this transition). See
  // docs/marketplace-core-loop-design.md §6.
  expireIfDue(id: string): Promise<CommercialQuotationRecord | undefined>;
}

export interface QuotationOfferRecord {
  id: string;
  quotation_id: string;
  offered_by_organization_id: string;
  rate: number;
  rate_unit: RateUnit;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  status: QuotationOfferStatus;
  created_at: Date | string;
}

export interface CreateQuotationOfferInput {
  quotationId: string;
  offeredByOrganizationId: string;
  rate: number;
  rateUnit: RateUnit;
  startDate: string;
  endDate?: string;
  notes?: string;
}

export interface QuotationOfferRepositoryPort {
  create(input: CreateQuotationOfferInput): Promise<QuotationOfferRecord>;
  findById(id: string): Promise<QuotationOfferRecord | undefined>;
  listByQuotation(quotationId: string): Promise<QuotationOfferRecord[]>;
  // Marks every still-pending offer on this quotation superseded — at most
  // one live offer at a time. See docs/marketplace-core-loop-design.md §7.
  supersedePending(quotationId: string): Promise<void>;
  updateStatus(id: string, status: QuotationOfferStatus): Promise<QuotationOfferRecord>;
}
