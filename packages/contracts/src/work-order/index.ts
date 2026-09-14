import { z } from "zod";
import { clientSnapshotSchema, operatorScopeSchema, rateUnitSchema } from "../rental/index.js";
import { responsiblePartySchema } from "../quotation/index.js";

// The finalized commercial order between the parties — created automatically
// the moment a CommercialQuotation is awarded (never manually re-entered),
// snapshotting every negotiated term so it stays stable even if the source
// quotation record were ever altered. See this phase's brief §10.
//
// Rental remains the operational execution entity; WorkOrder is the
// document. Deliberately not a separate "Contract" entity — for this scope,
// the Work Order IS the formal commercial order (brief §10).
export const workOrderStatusSchema = z.enum(["issued", "completed", "cancelled"]);
export type WorkOrderStatus = z.infer<typeof workOrderStatusSchema>;

export const workOrderSchema = z.object({
  id: z.string().uuid(),
  referenceNumber: z.string(),
  quotationId: z.string().uuid(),
  rentalId: z.string().uuid(),
  rentalCompanyOrganizationId: z.string().uuid(),
  renterOrganizationId: z.string().uuid().nullable(),
  clientSnapshot: clientSnapshotSchema.nullable(),
  // Null when the source quotation had no Requirement (Path B: direct, known
  // customer) — a Project only exists on the Renter side of a Requirement.
  projectId: z.string().uuid().nullable(),
  machineId: z.string().uuid(),
  startDate: z.string().date(),
  endDate: z.string().date().nullable(),
  rate: z.number().positive(),
  rateUnit: rateUnitSchema,
  mobilizationCharge: z.number().nonnegative().nullable(),
  demobilizationCharge: z.number().nonnegative().nullable(),
  overtimeRate: z.number().nonnegative().nullable(),
  paymentTerms: z.string().nullable(),
  shiftStructure: z.string().nullable(),
  sundayCondition: z.string().nullable(),
  fuelNorms: z.string().nullable(),
  fuelScope: responsiblePartySchema.nullable(),
  dehireTerms: z.string().nullable(),
  operatorScope: operatorScopeSchema.nullable(),
  accommodationScope: responsiblePartySchema.nullable(),
  workingHours: z.number().positive().nullable(),
  workingDaysPerWeek: z.number().int().positive().max(7).nullable(),
  minimumRentalPeriodValue: z.number().int().positive().nullable(),
  minimumRentalPeriodUnit: rateUnitSchema.nullable(),
  gstTerms: z.string().nullable(),
  noticePeriodDays: z.number().int().nonnegative().nullable(),
  commercialNotes: z.string().nullable(),
  companyTerms: z.string().nullable(),
  status: workOrderStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  // Resolved server-side, same pattern as CommercialQuotation's — null
  // unless the caller lacks equipment.manage on the Rental Company's org.
  machineAssetCode: z.string().nullable(),
  productName: z.string().nullable(),
  projectCode: z.string().nullable(),
});
export type WorkOrder = z.infer<typeof workOrderSchema>;

export const workOrderScopeItemSchema = z.object({
  id: z.string().uuid(),
  workOrderId: z.string().uuid(),
  item: z.string(),
  responsibleParty: responsiblePartySchema,
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type WorkOrderScopeItem = z.infer<typeof workOrderScopeItemSchema>;

// Manual transition only (issued -> completed | cancelled) — deliberately
// not auto-cascaded from Rental's own status changes yet; add that hook
// when a real workflow shows the two need to move together.
export const updateWorkOrderStatusRequestSchema = z.object({
  status: z.enum(["completed", "cancelled"]),
});
export type UpdateWorkOrderStatusRequest = z.infer<typeof updateWorkOrderStatusRequestSchema>;
