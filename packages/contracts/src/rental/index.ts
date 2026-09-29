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
/** RentalStatus.x names each value once; `RentalStatus` is also the type. */
export const RentalStatus = rentalStatusSchema.enum;

// Decided, not inferred from legacy: shift/month are grounded in real legacy
// fields (fleet1.hour_shift, linked_equipment.monthly_rental); day/week are
// a deliberate completion of the spectrum. `hour` is deliberately excluded —
// see docs/rental-domain-design.md §11 for the full reasoning.
export const rateUnitSchema = z.enum(["shift", "day", "week", "month"]);
export type RateUnit = z.infer<typeof rateUnitSchema>;
/** RateUnit.x names each value once; `RateUnit` is also the type. */
export const RateUnit = rateUnitSchema.enum;

export const operatorScopeSchema = z.enum(["with_operator", "without_operator"]);
export type OperatorScope = z.infer<typeof operatorScopeSchema>;
/** OperatorScope.x names each value once; `OperatorScope` is also the type. */
export const OperatorScope = operatorScopeSchema.enum;

export const actualDatesVerificationStatusSchema = z.enum(["pending", "verified", "disputed"]);
export type ActualDatesVerificationStatus = z.infer<typeof actualDatesVerificationStatusSchema>;
/** ActualDatesVerificationStatus.x names each value once; `ActualDatesVerificationStatus` is also the type. */
export const ActualDatesVerificationStatus = actualDatesVerificationStatusSchema.enum;

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

// A change to the planned dates the Rental Company proposed and the Renter
// hasn't answered yet (one at a time). endDate null = open-ended.
export const rentalDateChangeSchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date().nullable(),
  reason: z.string().min(1).max(500).nullable(),
  proposedAt: z.string().datetime(),
});
export type RentalDateChange = z.infer<typeof rentalDateChangeSchema>;

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
  pendingDateChange: rentalDateChangeSchema.nullable(),
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
// assignment, party, and dates are deliberately excluded — dates change
// through proposeRentalDateChangeRequestSchema (re-runs the availability
// check, needs the Renter's approval). Omitted = unchanged; null = remove
// the value (rate/rateUnit are required on a rental, so never null).
export const updateRentalTermsRequestSchema = z.object({
  projectName: z.string().min(1).max(200).nullable().optional(),
  projectLocation: z.string().min(1).max(200).nullable().optional(),
  rate: z.number().positive().optional(),
  rateUnit: rateUnitSchema.optional(),
  mobilizationCharge: z.number().nonnegative().nullable().optional(),
  demobilizationCharge: z.number().nonnegative().nullable().optional(),
  paymentTerms: z.string().min(1).max(1000).nullable().optional(),
  shiftStructure: z.string().min(1).max(500).nullable().optional(),
  overtimeRate: z.number().nonnegative().nullable().optional(),
  sundayCondition: z.string().min(1).max(500).nullable().optional(),
  fuelNorms: z.string().min(1).max(500).nullable().optional(),
  operatorScope: operatorScopeSchema.nullable().optional(),
  noticePeriodDays: z.number().int().nonnegative().nullable().optional(),
  dehireTerms: z.string().min(1).max(1000).nullable().optional(),
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

// Rental Company proposes new planned dates. While confirmed: startDate
// and endDate. While active: endDate only (extension or early end) — the
// service enforces which applies. endDate null = open-ended. Applies
// directly when the customer isn't a FleetIP organization.
export const proposeRentalDateChangeRequestSchema = z
  .object({
    startDate: z.string().date().optional(),
    endDate: z.string().date().nullable(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .refine((data) => !data.startDate || !isPastIsoDate(data.startDate), {
    message: "Start date cannot be in the past",
    path: ["startDate"],
  })
  .refine((data) => !data.startDate || !data.endDate || data.endDate >= data.startDate, {
    message: "End date cannot be before the start date",
    path: ["endDate"],
  });
export type ProposeRentalDateChangeRequest = z.infer<typeof proposeRentalDateChangeRequestSchema>;

export const respondToRentalDateChangeRequestSchema = z.object({
  decision: z.enum(["accepted", "rejected"]),
});
export type RespondToRentalDateChangeRequest = z.infer<typeof respondToRentalDateChangeRequestSchema>;

// Rental Company's answer to a dispute: corrected actual dates, which go
// back to "pending" for the Renter to verify or dispute again.
export const correctActualDatesRequestSchema = z
  .object({
    actualStartDate: z.string().date(),
    actualEndDate: z.string().date().optional(),
  })
  .refine((data) => !isFutureIsoDate(data.actualStartDate), {
    message: "Actual start date cannot be in the future",
    path: ["actualStartDate"],
  })
  .refine((data) => !data.actualEndDate || !isFutureIsoDate(data.actualEndDate), {
    message: "Actual end date cannot be in the future",
    path: ["actualEndDate"],
  })
  .refine((data) => !data.actualEndDate || data.actualEndDate >= data.actualStartDate, {
    message: "Actual end date cannot be before the actual start date",
    path: ["actualEndDate"],
  });
export type CorrectActualDatesRequest = z.infer<typeof correctActualDatesRequestSchema>;

export const rentalEventTypeSchema = z.enum([
  "created",
  "status_changed",
  "terms_edited",
  "actual_dates_verified",
  "actual_dates_disputed",
  "actual_dates_corrected",
  "date_change_proposed",
  "date_change_accepted",
  "date_change_rejected",
  "date_change_withdrawn",
  "dates_changed",
]);
export type RentalEventType = z.infer<typeof rentalEventTypeSchema>;
/** RentalEventType.x names each value once; `RentalEventType` is also the type. */
export const RentalEventType = rentalEventTypeSchema.enum;

// One line of a rental's activity log. Attributed to the acting
// organization only — never a user, so neither party sees the other's staff.
export const rentalEventSchema = z.object({
  id: z.string().uuid(),
  rentalId: z.string().uuid(),
  type: rentalEventTypeSchema,
  // Per type: status_changed {from, to, actualDate?}; terms_edited {fields};
  // date_change_* / dates_changed {startDate, endDate, reason?};
  // actual_dates_disputed {reason}; actual_dates_corrected {actualStartDate, actualEndDate}.
  detail: z.record(z.unknown()).nullable(),
  organizationId: z.string().uuid(),
  organizationName: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type RentalEvent = z.infer<typeof rentalEventSchema>;

export const checkMachineAvailabilityQuerySchema = z.object({
  machineId: z.string().uuid(),
  startDate: z.string().date(),
  endDate: z.string().date().optional(),
});
export type CheckMachineAvailabilityQuery = z.infer<typeof checkMachineAvailabilityQuerySchema>;

// What makes a machine unavailable over a window: a committing rental
// (confirmed/active/off_rent) or an open workshop job (scheduled/in_progress).
// `reference` is what a person reads: "RN-1A2B3C4D", or "Workshop job 2026-10-01".
// Also sent as `error.conflict` on a 409 caused by one of these.
export const availabilityConflictKindSchema = z.enum(["rental", "maintenance"]);
export type AvailabilityConflictKind = z.infer<typeof availabilityConflictKindSchema>;
export const AvailabilityConflictKind = availabilityConflictKindSchema.enum;

export const availabilityConflictSchema = z.object({
  kind: availabilityConflictKindSchema,
  id: z.string().uuid(),
  reference: z.string(),
  startDate: z.string().date(),
  endDate: z.string().date().nullable(),
});
export type AvailabilityConflict = z.infer<typeof availabilityConflictSchema>;

/** GET /rentals/availability response. `available` is kept for older callers; it is `conflicts.length === 0`. */
export const machineAvailabilitySchema = z.object({
  available: z.boolean(),
  conflicts: z.array(availabilityConflictSchema),
});
export type MachineAvailability = z.infer<typeof machineAvailabilitySchema>;

/** POST /organizations/:organizationId/machines/availability — one answer per machine, one query set. */
export const checkMachinesAvailabilityRequestSchema = z
  .object({
    machineIds: z.array(z.string().uuid()).min(1).max(1000),
    startDate: z.string().date(),
    endDate: z.string().date().optional(),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "End date cannot be before the start date",
    path: ["endDate"],
  });
export type CheckMachinesAvailabilityRequest = z.infer<typeof checkMachinesAvailabilityRequestSchema>;

export const machinesAvailabilityResponseSchema = z.object({
  results: z.array(machineAvailabilitySchema.extend({ machineId: z.string().uuid() })),
});
export type MachinesAvailabilityResponse = z.infer<typeof machinesAvailabilityResponseSchema>;
