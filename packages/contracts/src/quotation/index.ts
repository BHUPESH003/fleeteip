import { z } from "zod";
import { clientSnapshotSchema, operatorScopeSchema, rateUnitSchema } from "../rental/index.js";
import { isPastIsoDate } from "../shared/dates.js";

// --- QuotationResponse: a Rental Company's lightweight reply to a Requirement ---

export const quotationResponseStatusSchema = z.enum(["pending", "interested", "not_interested"]);
export type QuotationResponseStatus = z.infer<typeof quotationResponseStatusSchema>;

export const quotationResponseSchema = z.object({
  id: z.string().uuid(),
  requirementId: z.string().uuid(),
  rentalCompanyOrganizationId: z.string().uuid(),
  status: quotationResponseStatusSchema,
  indicativeRate: z.number().positive().nullable(),
  indicativeRateUnit: rateUnitSchema.nullable(),
  notes: z.string().min(1).max(1000).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type QuotationResponse = z.infer<typeof quotationResponseSchema>;

export const submitQuotationResponseRequestSchema = z
  .object({
    status: z.enum(["interested", "not_interested"]),
    indicativeRate: z.number().positive().optional(),
    indicativeRateUnit: rateUnitSchema.optional(),
    notes: z.string().min(1).max(1000).optional(),
  })
  .refine(
    (data) =>
      data.status === "not_interested" || Boolean(data.indicativeRate && data.indicativeRateUnit),
    {
      message: "indicativeRate and indicativeRateUnit are required when interested",
      path: ["indicativeRate"],
    },
  );
export type SubmitQuotationResponseRequest = z.infer<typeof submitQuotationResponseRequestSchema>;

// --- CommercialQuotation: the formal, negotiable, awardable document ---

export const commercialQuotationStatusSchema = z.enum([
  "draft",
  "sent",
  "negotiating",
  "awarded",
  "rejected",
  "expired",
  "withdrawn",
]);
export type CommercialQuotationStatus = z.infer<typeof commercialQuotationStatusSchema>;

// Who bears a given cost/duty — the common case for fuel/accommodation.
// `operatorScope` (with_operator/without_operator, reused from Rental)
// already answers this for the operator; this is the same client-vs-company
// split for the handful of other terms common enough to be worth a real
// column, per this phase's brief §5.
export const responsiblePartySchema = z.enum(["client", "company"]);
export type ResponsibleParty = z.infer<typeof responsiblePartySchema>;

// Mirrors rentalSchema's term fields exactly — an awarded quotation converts
// into a Rental by copying fields across. See docs/marketplace-core-loop-design.md §6.
export const commercialQuotationSchema = z.object({
  id: z.string().uuid(),
  rentalCompanyOrganizationId: z.string().uuid(),
  renterOrganizationId: z.string().uuid().nullable(),
  clientSnapshot: clientSnapshotSchema.nullable(),
  requirementId: z.string().uuid().nullable(),
  quotationResponseId: z.string().uuid().nullable(),
  sourceAuctionId: z.string().uuid().nullable(),
  referenceNumber: z.string(),
  machineId: z.string().uuid(),
  startDate: z.string().date(),
  endDate: z.string().date().nullable(),
  rate: z.number().positive(),
  rateUnit: rateUnitSchema,
  mobilizationCharge: z.number().nonnegative().nullable(),
  demobilizationCharge: z.number().nonnegative().nullable(),
  overtimeRate: z.number().nonnegative().nullable(),
  paymentTerms: z.string().min(1).max(1000).nullable(),
  shiftStructure: z.string().min(1).max(500).nullable(),
  sundayCondition: z.string().min(1).max(500).nullable(),
  fuelNorms: z.string().min(1).max(500).nullable(),
  fuelScope: responsiblePartySchema.nullable(),
  dehireTerms: z.string().min(1).max(1000).nullable(),
  operatorScope: operatorScopeSchema.nullable(),
  // Nullable — accommodation only applies to some equipment/engagements.
  accommodationScope: responsiblePartySchema.nullable(),
  workingHours: z.number().positive().nullable(),
  workingDaysPerWeek: z.number().int().positive().max(7).nullable(),
  minimumRentalPeriodValue: z.number().int().positive().nullable(),
  minimumRentalPeriodUnit: rateUnitSchema.nullable(),
  // Free text, deliberately not a structured GSTIN/HSN/CGST-SGST breakdown —
  // Billing's tax_amount stays a plain entered figure; this is the
  // commercial *term* ("GST extra @18%", "GST inclusive"), not an invoice.
  gstTerms: z.string().min(1).max(500).nullable(),
  noticePeriodDays: z.number().int().nonnegative().nullable(),
  validityDate: z.string().date(),
  // Special/site conditions — kept distinct from companyTerms below.
  commercialNotes: z.string().min(1).max(2000).nullable(),
  // Company-specific/custom T&Cs — the flexible bucket for wording that
  // differs company to company (§5D). Deliberately separate from
  // commercialNotes (site/special conditions) so each stays legible.
  companyTerms: z.string().min(1).max(2000).nullable(),
  status: commercialQuotationStatusSchema,
  // The Renter's explicit "I accept these terms" signal — independent of
  // `status` (no separate "accepted" status; see docs/marketplace-core-loop-
  // design.md §6). Gates awardQuotation whenever a real in-app Renter is on
  // the other end; cleared back to null by any subsequent term change.
  renterAcceptedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  // Resolved server-side, only for the Renter party viewing its own
  // quotation (they hold no equipment.manage on the Rental Company's org to
  // look these up themselves) — null on every other call. Same pattern as
  // Rental.machineAssetCode/rentalCompanyOrganizationName.
  machineAssetCode: z.string().nullable(),
  productName: z.string().nullable(),
});
export type CommercialQuotation = z.infer<typeof commercialQuotationSchema>;

export const createCommercialQuotationRequestSchema = z
  .object({
    renterOrganizationId: z.string().uuid().optional(),
    clientSnapshot: clientSnapshotSchema.optional(),
    requirementId: z.string().uuid().optional(),
    quotationResponseId: z.string().uuid().optional(),
    sourceAuctionId: z.string().uuid().optional(),
    machineId: z.string().uuid(),
    startDate: z.string().date(),
    endDate: z.string().date().optional(),
    rate: z.number().positive(),
    rateUnit: rateUnitSchema,
    mobilizationCharge: z.number().nonnegative().optional(),
    demobilizationCharge: z.number().nonnegative().optional(),
    overtimeRate: z.number().nonnegative().optional(),
    paymentTerms: z.string().min(1).max(1000).optional(),
    shiftStructure: z.string().min(1).max(500).optional(),
    sundayCondition: z.string().min(1).max(500).optional(),
    fuelNorms: z.string().min(1).max(500).optional(),
    fuelScope: responsiblePartySchema.optional(),
    dehireTerms: z.string().min(1).max(1000).optional(),
    operatorScope: operatorScopeSchema.optional(),
    accommodationScope: responsiblePartySchema.optional(),
    workingHours: z.number().positive().optional(),
    workingDaysPerWeek: z.number().int().positive().max(7).optional(),
    minimumRentalPeriodValue: z.number().int().positive().optional(),
    minimumRentalPeriodUnit: rateUnitSchema.optional(),
    gstTerms: z.string().min(1).max(500).optional(),
    noticePeriodDays: z.number().int().nonnegative().optional(),
    validityDate: z.string().date(),
    commercialNotes: z.string().min(1).max(2000).optional(),
    companyTerms: z.string().min(1).max(2000).optional(),
  })
  .refine((data) => Boolean(data.renterOrganizationId) !== Boolean(data.clientSnapshot), {
    message: "Provide exactly one of renterOrganizationId or clientSnapshot",
    path: ["renterOrganizationId"],
  })
  .refine((data) => !isPastIsoDate(data.startDate), {
    message: "Start date cannot be in the past",
    path: ["startDate"],
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "End date cannot be before the start date",
    path: ["endDate"],
  })
  .refine((data) => !isPastIsoDate(data.validityDate), {
    message: "Validity date cannot be in the past",
    path: ["validityDate"],
  })
  .refine((data) => data.validityDate <= data.startDate, {
    // Same reasoning as Requirement's validityDate — the quotation shouldn't
    // still be acceptable after the rental it proposes has already started.
    message: "Validity date cannot be after the start date",
    path: ["validityDate"],
  });
export type CreateCommercialQuotationRequest = z.infer<
  typeof createCommercialQuotationRequestSchema
>;

// Terms editable only while draft/sent/negotiating — same shape as
// updateRentalTermsRequestSchema, minus party/machine/dates (those change
// the negotiation itself, handled by QuotationOffer, not a plain edit).
export const updateCommercialQuotationTermsRequestSchema = z.object({
  mobilizationCharge: z.number().nonnegative().optional(),
  demobilizationCharge: z.number().nonnegative().optional(),
  overtimeRate: z.number().nonnegative().optional(),
  paymentTerms: z.string().min(1).max(1000).optional(),
  shiftStructure: z.string().min(1).max(500).optional(),
  sundayCondition: z.string().min(1).max(500).optional(),
  fuelNorms: z.string().min(1).max(500).optional(),
  fuelScope: responsiblePartySchema.optional(),
  dehireTerms: z.string().min(1).max(1000).optional(),
  operatorScope: operatorScopeSchema.optional(),
  accommodationScope: responsiblePartySchema.optional(),
  workingHours: z.number().positive().optional(),
  workingDaysPerWeek: z.number().int().positive().max(7).optional(),
  minimumRentalPeriodValue: z.number().int().positive().optional(),
  minimumRentalPeriodUnit: rateUnitSchema.optional(),
  gstTerms: z.string().min(1).max(500).optional(),
  noticePeriodDays: z.number().int().nonnegative().optional(),
  commercialNotes: z.string().min(1).max(2000).optional(),
  companyTerms: z.string().min(1).max(2000).optional(),
});
export type UpdateCommercialQuotationTermsRequest = z.infer<
  typeof updateCommercialQuotationTermsRequestSchema
>;

// --- Scope/Responsibility items: category/equipment-specific commercial
// responsibilities that don't warrant a dedicated column (e.g. wire rope
// scope for foundation rigs, ground preparation, support crane) — a
// structured collection instead of an ever-growing set of *Scope columns.
// See this phase's brief §9.

export const quotationScopeItemSchema = z.object({
  id: z.string().uuid(),
  quotationId: z.string().uuid(),
  item: z.string().min(1).max(200),
  responsibleParty: responsiblePartySchema,
  notes: z.string().min(1).max(500).nullable(),
  createdAt: z.string().datetime(),
});
export type QuotationScopeItem = z.infer<typeof quotationScopeItemSchema>;

export const createQuotationScopeItemRequestSchema = z.object({
  item: z.string().min(1).max(200),
  responsibleParty: responsiblePartySchema,
  notes: z.string().min(1).max(500).optional(),
});
export type CreateQuotationScopeItemRequest = z.infer<
  typeof createQuotationScopeItemRequestSchema
>;

export const updateCommercialQuotationStatusRequestSchema = z.object({
  status: z.enum(["sent", "rejected", "withdrawn"]),
});
export type UpdateCommercialQuotationStatusRequest = z.infer<
  typeof updateCommercialQuotationStatusRequestSchema
>;

// --- Negotiation: append-only offer/counter-offer trail on a quotation ---

export const quotationOfferStatusSchema = z.enum(["pending", "accepted", "rejected", "superseded"]);
export type QuotationOfferStatus = z.infer<typeof quotationOfferStatusSchema>;

export const quotationOfferSchema = z.object({
  id: z.string().uuid(),
  quotationId: z.string().uuid(),
  offeredByOrganizationId: z.string().uuid(),
  rate: z.number().positive(),
  rateUnit: rateUnitSchema,
  startDate: z.string().date(),
  endDate: z.string().date().nullable(),
  notes: z.string().min(1).max(1000).nullable(),
  status: quotationOfferStatusSchema,
  createdAt: z.string().datetime(),
});
export type QuotationOffer = z.infer<typeof quotationOfferSchema>;

export const createQuotationOfferRequestSchema = z
  .object({
    rate: z.number().positive(),
    rateUnit: rateUnitSchema,
    startDate: z.string().date(),
    endDate: z.string().date().optional(),
    notes: z.string().min(1).max(1000).optional(),
  })
  // No "not in the past" check on startDate here — unlike the initial
  // CreateQuotationDialog, the counter-offer UI carries the quotation's
  // existing startDate forward unchanged (no date picker of its own); a
  // negotiation that runs long enough for that date to lapse must still be
  // able to counter-offer. Ordering is still worth enforcing either way.
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "End date cannot be before the start date",
    path: ["endDate"],
  });
export type CreateQuotationOfferRequest = z.infer<typeof createQuotationOfferRequestSchema>;
