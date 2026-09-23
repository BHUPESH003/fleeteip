import type { ClientSnapshot, OperatorScope, RateUnit } from "@fleetip/contracts/rental";
import type {
  AlternateDateStatus,
  CommercialQuotationStatus,
  QuotationOfferStatus,
  ResponsibleParty,
} from "@fleetip/contracts/quotation";

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
  fuel_scope: ResponsibleParty | null;
  dehire_terms: string | null;
  operator_scope: OperatorScope | null;
  accommodation_scope: ResponsibleParty | null;
  working_hours: number | null;
  working_days_per_week: number | null;
  minimum_rental_period_value: number | null;
  minimum_rental_period_unit: RateUnit | null;
  gst_terms: string | null;
  notice_period_days: number | null;
  validity_date: string;
  commercial_notes: string | null;
  company_terms: string | null;
  status: CommercialQuotationStatus;
  renter_accepted_at: Date | string | null;
  proposed_alternate_start_date: string | null;
  proposed_alternate_end_date: string | null;
  alternate_date_status: AlternateDateStatus;
  alternate_date_reason: string | null;
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
  fuelScope?: ResponsibleParty;
  dehireTerms?: string;
  operatorScope?: OperatorScope;
  accommodationScope?: ResponsibleParty;
  workingHours?: number;
  workingDaysPerWeek?: number;
  minimumRentalPeriodValue?: number;
  minimumRentalPeriodUnit?: RateUnit;
  gstTerms?: string;
  noticePeriodDays?: number;
  validityDate: string;
  commercialNotes?: string;
  companyTerms?: string;
}

export interface UpdateCommercialQuotationTermsInput {
  mobilizationCharge?: number;
  demobilizationCharge?: number;
  overtimeRate?: number;
  paymentTerms?: string;
  shiftStructure?: string;
  sundayCondition?: string;
  fuelNorms?: string;
  fuelScope?: ResponsibleParty;
  dehireTerms?: string;
  operatorScope?: OperatorScope;
  accommodationScope?: ResponsibleParty;
  workingHours?: number;
  workingDaysPerWeek?: number;
  minimumRentalPeriodValue?: number;
  minimumRentalPeriodUnit?: RateUnit;
  gstTerms?: string;
  noticePeriodDays?: number;
  commercialNotes?: string;
  companyTerms?: string;
}

// Written when an offer is accepted — the negotiable subset only. See
// docs/marketplace-core-loop-design.md §7.
export interface ApplyAcceptedOfferInput {
  rate: number;
  rateUnit: RateUnit;
  startDate: string;
  endDate: string | null;
}

export interface ProposeAlternateDatesInput {
  startDate: string;
  endDate?: string;
  reason?: string;
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
  // Global search — reference number/client name match, scoped to one side
  // of the party split (mirrors listByRentalCompany/listByRenter).
  searchByRentalCompany(
    rentalCompanyOrganizationId: string,
    query: string,
  ): Promise<CommercialQuotationRecord[]>;
  searchByRenter(renterOrganizationId: string, query: string): Promise<CommercialQuotationRecord[]>;
  // Sets alternate_date_status to "pending" with the proposed dates/reason —
  // the Rental Company's side of the one sanctioned post-creation
  // date-change channel (see commercialQuotationSchema.alternateDateStatus).
  proposeAlternateDates(
    id: string,
    input: ProposeAlternateDatesInput,
  ): Promise<CommercialQuotationRecord>;
  // "accepted": atomically copies proposed_alternate_start/end_date onto
  // start_date/end_date, resets alternate_date_status to "none", and nulls
  // the proposed_* columns. "rejected": just resets status to "none" and
  // nulls the proposed_* columns, leaving start_date/end_date untouched.
  respondToAlternateDates(
    id: string,
    decision: "accepted" | "rejected",
  ): Promise<CommercialQuotationRecord>;
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

// Category/equipment-specific commercial responsibilities that don't warrant
// a dedicated column (wire rope scope, ground preparation, support crane,
// ...) — see this phase's brief §9.
export interface QuotationScopeItemRecord {
  id: string;
  quotation_id: string;
  item: string;
  responsible_party: ResponsibleParty;
  notes: string | null;
  created_at: Date | string;
}

export interface CreateQuotationScopeItemInput {
  quotationId: string;
  item: string;
  responsibleParty: ResponsibleParty;
  notes?: string;
}

export interface QuotationScopeItemRepositoryPort {
  create(input: CreateQuotationScopeItemInput): Promise<QuotationScopeItemRecord>;
  findById(id: string): Promise<QuotationScopeItemRecord | undefined>;
  listByQuotation(quotationId: string): Promise<QuotationScopeItemRecord[]>;
  delete(id: string): Promise<void>;
}
