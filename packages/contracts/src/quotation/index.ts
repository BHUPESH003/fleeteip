import { z } from "zod";
import { clientSnapshotSchema, operatorScopeSchema, rateUnitSchema } from "../rental/index.js";

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
  dehireTerms: z.string().min(1).max(1000).nullable(),
  operatorScope: operatorScopeSchema.nullable(),
  noticePeriodDays: z.number().int().nonnegative().nullable(),
  validityDate: z.string().date(),
  commercialNotes: z.string().min(1).max(2000).nullable(),
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
    dehireTerms: z.string().min(1).max(1000).optional(),
    operatorScope: operatorScopeSchema.optional(),
    noticePeriodDays: z.number().int().nonnegative().optional(),
    validityDate: z.string().date(),
    commercialNotes: z.string().min(1).max(2000).optional(),
  })
  .refine((data) => Boolean(data.renterOrganizationId) !== Boolean(data.clientSnapshot), {
    message: "Provide exactly one of renterOrganizationId or clientSnapshot",
    path: ["renterOrganizationId"],
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
  dehireTerms: z.string().min(1).max(1000).optional(),
  operatorScope: operatorScopeSchema.optional(),
  noticePeriodDays: z.number().int().nonnegative().optional(),
  commercialNotes: z.string().min(1).max(2000).optional(),
});
export type UpdateCommercialQuotationTermsRequest = z.infer<
  typeof updateCommercialQuotationTermsRequestSchema
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

export const createQuotationOfferRequestSchema = z.object({
  rate: z.number().positive(),
  rateUnit: rateUnitSchema,
  startDate: z.string().date(),
  endDate: z.string().date().optional(),
  notes: z.string().min(1).max(1000).optional(),
});
export type CreateQuotationOfferRequest = z.infer<typeof createQuotationOfferRequestSchema>;
