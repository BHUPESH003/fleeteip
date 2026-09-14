import { z } from "zod";
import { rateUnitSchema } from "../rental/index.js";

export const requirementStatusSchema = z.enum(["open", "closed", "cancelled"]);
export type RequirementStatus = z.infer<typeof requirementStatusSchema>;

// Client-validated normal-rental-requirement inputs (this phase's brief):
// single/double shift, or "flexi" (flexible — whatever shift pattern the
// job needs). Kept separate from `shiftRequirement`'s free text, which
// stays for shift-timing notes the enum doesn't capture (e.g. exact start
// time, night-shift preference).
export const shiftPatternSchema = z.enum(["single", "double", "flexi"]);
export type ShiftPattern = z.infer<typeof shiftPatternSchema>;

export const crewRequirementSchema = z.enum(["one_crew_set", "two_crew_sets"]);
export type CrewRequirement = z.infer<typeof crewRequirementSchema>;

export const requirementSchema = z.object({
  id: z.string().uuid(),
  renterOrganizationId: z.string().uuid(),
  projectId: z.string().uuid(),
  productSubcategoryId: z.string().uuid(),
  capacity: z.number().positive().nullable(),
  capacityUnit: z.string().min(1).max(20).nullable(),
  // Only applicable to boom equipment (cranes, boom placers, ...) — never
  // required for equipment categories it doesn't apply to.
  boomLength: z.number().positive().nullable(),
  quantity: z.number().int().positive(),
  projectName: z.string().min(1).max(200).nullable(),
  projectLocation: z.string().min(1).max(200).nullable(),
  requestedStartDate: z.string().date(),
  // Reuses Rental's rate-unit vocabulary so "3 months needed" and "billed
  // monthly" speak the same unit — see docs/marketplace-core-loop-design.md §4.
  expectedDurationValue: z.number().int().positive().nullable(),
  expectedDurationUnit: rateUnitSchema.nullable(),
  shiftPattern: shiftPatternSchema.nullable(),
  crewRequirement: crewRequirementSchema.nullable(),
  shiftRequirement: z.string().min(1).max(500).nullable(),
  validityDate: z.string().date(),
  status: requirementStatusSchema,
  notes: z.string().min(1).max(2000).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Requirement = z.infer<typeof requirementSchema>;

export const createRequirementRequestSchema = z.object({
  projectId: z.string().uuid(),
  productSubcategoryId: z.string().uuid(),
  capacity: z.number().positive().optional(),
  capacityUnit: z.string().min(1).max(20).optional(),
  boomLength: z.number().positive().optional(),
  // Optional, not `.default(1)` — a Zod default makes the schema's output
  // type diverge from its input type, which breaks parseWithSchema<T>'s
  // generic inference (T gets inferred from the input side). The service
  // applies the default instead.
  quantity: z.number().int().positive().optional(),
  projectName: z.string().min(1).max(200).optional(),
  projectLocation: z.string().min(1).max(200).optional(),
  requestedStartDate: z.string().date(),
  expectedDurationValue: z.number().int().positive().optional(),
  expectedDurationUnit: rateUnitSchema.optional(),
  shiftPattern: shiftPatternSchema.optional(),
  crewRequirement: crewRequirementSchema.optional(),
  shiftRequirement: z.string().min(1).max(500).optional(),
  validityDate: z.string().date(),
  notes: z.string().min(1).max(2000).optional(),
});
export type CreateRequirementRequest = z.infer<typeof createRequirementRequestSchema>;

// Renter-only transition: open -> closed | cancelled. Closing is a status
// write, never a delete — see docs/marketplace-core-loop-design.md §4.
export const updateRequirementStatusRequestSchema = z.object({
  status: z.enum(["closed", "cancelled"]),
});
export type UpdateRequirementStatusRequest = z.infer<typeof updateRequirementStatusRequestSchema>;

// Corrects a posted Requirement's own fields while the market hasn't yet
// acted on it — deliberately excludes productSubcategoryId (the equipment
// type being requested is the Requirement's core identity, same reasoning
// as Machine's productId staying fixed after registration), projectId
// (moving a live Requirement to a different Project is not a "correction",
// see docs), and status (that's updateRequirementStatusRequestSchema's
// job). The service further restricts this to status === "open" — see
// RequirementService.updateRequirement.
export const updateRequirementRequestSchema = z
  .object({
    capacity: z.number().positive().optional(),
    capacityUnit: z.string().min(1).max(20).optional(),
    boomLength: z.number().positive().optional(),
    quantity: z.number().int().positive().optional(),
    projectName: z.string().min(1).max(200).optional(),
    projectLocation: z.string().min(1).max(200).optional(),
    requestedStartDate: z.string().date().optional(),
    expectedDurationValue: z.number().int().positive().optional(),
    expectedDurationUnit: rateUnitSchema.optional(),
    shiftPattern: shiftPatternSchema.optional(),
    crewRequirement: crewRequirementSchema.optional(),
    shiftRequirement: z.string().min(1).max(500).optional(),
    validityDate: z.string().date().optional(),
    notes: z.string().min(1).max(2000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });
export type UpdateRequirementRequest = z.infer<typeof updateRequirementRequestSchema>;
