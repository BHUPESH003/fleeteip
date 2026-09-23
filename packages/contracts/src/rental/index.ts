import { z } from "zod";
import { isFutureIsoDate, isPastIsoDate } from "../shared/dates.js";

// FleetIP recommendation, not extracted from legacy — the source schema has
// no reliable status vocabulary (every status-like legacy column is a bare
// varchar, no enum, no observed values). See docs/rental-domain-design.md §4.
export const rentalStatusSchema = z.enum([
  "confirmed",
  "active",
  "off_rent",
  "completed",
  "cancelled",
]);
export type RentalStatus = z.infer<typeof rentalStatusSchema>;

// Decided, not inferred from legacy: shift/month are grounded in real legacy
// fields (fleet1.hour_shift, linked_equipment.monthly_rental); day/week are
// a deliberate completion of the spectrum. `hour` is deliberately excluded —
// see docs/rental-domain-design.md §11 for the full reasoning.
export const rateUnitSchema = z.enum(["shift", "day", "week", "month"]);
export type RateUnit = z.infer<typeof rateUnitSchema>;

export const operatorScopeSchema = z.enum(["with_operator", "without_operator"]);
export type OperatorScope = z.infer<typeof operatorScopeSchema>;

export const actualDatesVerificationStatusSchema = z.enum(["pending", "verified", "disputed"]);
export type ActualDatesVerificationStatus = z.infer<typeof actualDatesVerificationStatusSchema>;

// Minimal, immutable-once-set snapshot of an external (non-FleetIP) customer
// — deliberately not the full rentalclients shape (no GST/payment-terms/KAM,
// see docs/rental-domain-design.md §7). Never becomes a live-editable profile.
export const clientSnapshotSchema = z.object({
  name: z.string().min(1).max(200),
  contactPerson: z.string().min(1).max(200).optional(),
  phone: z.string().min(1).max(50).optional(),
  email: z.string().email().optional(),
});
export type ClientSnapshot = z.infer<typeof clientSnapshotSchema>;

export const rentalSchema = z.object({
  id: z.string().uuid(),
  rentalCompanyOrganizationId: z.string().uuid(),
  renterOrganizationId: z.string().uuid().nullable(),
  clientSnapshot: clientSnapshotSchema.nullable(),
  machineId: z.string().uuid(),
  status: rentalStatusSchema,
  projectName: z.string().min(1).max(200).nullable(),
  projectLocation: z.string().min(1).max(200).nullable(),
  // Calendar dates, no time component — deliberately `.date()`, not
  // `.datetime()` like createdAt/updatedAt below. Inclusive on both ends;
  // endDate: null means open-ended. See docs/rental-domain-design.md §6/§9.
  startDate: z.string().date(),
  endDate: z.string().date().nullable(),
  rate: z.number().positive(),
  rateUnit: rateUnitSchema,
  mobilizationCharge: z.number().nonnegative().nullable(),
  demobilizationCharge: z.number().nonnegative().nullable(),
  paymentTerms: z.string().min(1).max(1000).nullable(),
  shiftStructure: z.string().min(1).max(500).nullable(),
  overtimeRate: z.number().nonnegative().nullable(),
  sundayCondition: z.string().min(1).max(500).nullable(),
  fuelNorms: z.string().min(1).max(500).nullable(),
  operatorScope: operatorScopeSchema.nullable(),
  noticePeriodDays: z.number().int().nonnegative().nullable(),
  dehireTerms: z.string().min(1).max(1000).nullable(),
  // Buffer tracking: what actually happened vs. the planned startDate/
  // endDate above. Recorded by the Rental Company on the matching status
  // transition (active -> actualStartDate, off_rent -> actualEndDate);
  // verified or disputed by the Renter — modeled after QuotationOffer's
  // pending/accepted/rejected shape, not another silent self-attested
  // boolean like Logsheet's customerConfirmed.
  actualStartDate: z.string().date().nullable(),
  actualEndDate: z.string().date().nullable(),
  actualDatesVerificationStatus: actualDatesVerificationStatusSchema.nullable(),
  actualDatesDisputeReason: z.string().min(1).max(500).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  // Resolved server-side, only for a Renter viewing their own rentals (they
  // hold no equipment.manage/organization.manage permission on the Rental
  // Company's org to look these up themselves) — null on every other call.
  machineAssetCode: z.string().nullable(),
  rentalCompanyOrganizationName: z.string().nullable(),
});
export type Rental = z.infer<typeof rentalSchema>;

// rentalCompanyOrganizationId is never in the request body — it comes from
// the route's :organizationId path param, same discipline as
// createMachineRequestSchema never taking organizationId.
export const createRentalRequestSchema = z
  .object({
    machineId: z.string().uuid(),
    renterOrganizationId: z.string().uuid().optional(),
    clientSnapshot: clientSnapshotSchema.optional(),
    projectName: z.string().min(1).max(200).optional(),
    projectLocation: z.string().min(1).max(200).optional(),
    startDate: z.string().date(),
    endDate: z.string().date().optional(),
    rate: z.number().positive(),
    rateUnit: rateUnitSchema,
    mobilizationCharge: z.number().nonnegative().optional(),
    demobilizationCharge: z.number().nonnegative().optional(),
    paymentTerms: z.string().min(1).max(1000).optional(),
    shiftStructure: z.string().min(1).max(500).optional(),
    overtimeRate: z.number().nonnegative().optional(),
    sundayCondition: z.string().min(1).max(500).optional(),
    fuelNorms: z.string().min(1).max(500).optional(),
    operatorScope: operatorScopeSchema.optional(),
    noticePeriodDays: z.number().int().nonnegative().optional(),
    dehireTerms: z.string().min(1).max(1000).optional(),
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
  });
export type CreateRentalRequest = z.infer<typeof createRentalRequestSchema>;

// Only the fields §11 locks as editable while status = confirmed. Machine
// assignment, party, and dates are deliberately excluded — changing those
// would require re-running the availability check (§9/§10), a different
// operation than correcting a term before execution starts.
export const updateRentalTermsRequestSchema = z.object({
  projectName: z.string().min(1).max(200).optional(),
  projectLocation: z.string().min(1).max(200).optional(),
  rate: z.number().positive().optional(),
  rateUnit: rateUnitSchema.optional(),
  mobilizationCharge: z.number().nonnegative().optional(),
  demobilizationCharge: z.number().nonnegative().optional(),
  paymentTerms: z.string().min(1).max(1000).optional(),
  shiftStructure: z.string().min(1).max(500).optional(),
  overtimeRate: z.number().nonnegative().optional(),
  sundayCondition: z.string().min(1).max(500).optional(),
  fuelNorms: z.string().min(1).max(500).optional(),
  operatorScope: operatorScopeSchema.optional(),
  noticePeriodDays: z.number().int().nonnegative().optional(),
  dehireTerms: z.string().min(1).max(1000).optional(),
});
export type UpdateRentalTermsRequest = z.infer<typeof updateRentalTermsRequestSchema>;

export const updateRentalStatusRequestSchema = z
  .object({
    status: rentalStatusSchema,
    // Only meaningful alongside status "active" (-> actualStartDate) or
    // "off_rent" (-> actualEndDate); ignored for any other transition.
    // Optional and overridable — defaults to today when omitted, same
    // auto-capture-on-transition precedent as Transport's own actualDate.
    actualDate: z.string().date().optional(),
  })
  .refine((data) => !data.actualDate || !isFutureIsoDate(data.actualDate), {
    message: "Actual date cannot be in the future",
    path: ["actualDate"],
  });
export type UpdateRentalStatusRequest = z.infer<typeof updateRentalStatusRequestSchema>;

export const disputeActualDatesRequestSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type DisputeActualDatesRequest = z.infer<typeof disputeActualDatesRequestSchema>;

export const checkMachineAvailabilityQuerySchema = z.object({
  machineId: z.string().uuid(),
  startDate: z.string().date(),
  endDate: z.string().date().optional(),
});
export type CheckMachineAvailabilityQuery = z.infer<typeof checkMachineAvailabilityQuerySchema>;
