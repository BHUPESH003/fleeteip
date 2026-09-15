import type { RateUnit } from "@fleetip/contracts/rental";
import type { QuotationResponseStatus } from "@fleetip/contracts/quotation";

export interface QuotationResponseRecord {
  id: string;
  requirement_id: string;
  rental_company_organization_id: string;
  status: QuotationResponseStatus;
  indicative_rate: number | null;
  indicative_rate_unit: RateUnit | null;
  notes: string | null;
  quotation_requested_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface SubmitQuotationResponseInput {
  requirementId: string;
  rentalCompanyOrganizationId: string;
  status: QuotationResponseStatus;
  indicativeRate?: number;
  indicativeRateUnit?: RateUnit;
  notes?: string;
}

export interface QuotationResponseRepositoryPort {
  // Upserts on (requirement_id, rental_company_organization_id) — a Rental
  // Company has at most one response per Requirement; resubmitting updates
  // it rather than creating a duplicate row. See
  // docs/marketplace-core-loop-design.md §5.
  submit(input: SubmitQuotationResponseInput): Promise<QuotationResponseRecord>;
  findByRequirementAndOrganization(
    requirementId: string,
    rentalCompanyOrganizationId: string,
  ): Promise<QuotationResponseRecord | undefined>;
  findById(id: string): Promise<QuotationResponseRecord | undefined>;
  listByRequirement(requirementId: string): Promise<QuotationResponseRecord[]>;
  markQuotationRequested(id: string): Promise<QuotationResponseRecord>;
  // Every "interested" response this Rental Company has been explicitly
  // asked to formalize, that doesn't have one yet — the Quotations page's
  // "Requested" filter. Excluding already-fulfilled ones is left to the
  // caller (cross-referencing CommercialQuotation.quotationResponseId),
  // same as elsewhere in this codebase — this repository stays
  // CommercialQuotation-agnostic.
  listRequestedByRentalCompanyOrganization(
    rentalCompanyOrganizationId: string,
  ): Promise<QuotationResponseRecord[]>;
}
