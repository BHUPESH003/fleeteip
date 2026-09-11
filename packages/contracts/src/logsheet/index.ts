import { z } from "zod";

export const logsheetSchema = z.object({
  id: z.string().uuid(),
  rentalId: z.string().uuid(),
  machineId: z.string().uuid(),
  logDate: z.string().date(),
  shift: z.string().min(1).max(200).nullable(),
  operatingHours: z.number().nonnegative().nullable(),
  idleHours: z.number().nonnegative().nullable(),
  overtimeHours: z.number().nonnegative().nullable(),
  operatorName: z.string().min(1).max(200).nullable(),
  fuelConsumed: z.number().nonnegative().nullable(),
  fuelUnit: z.string().min(1).max(20).nullable(),
  remarks: z.string().min(1).max(2000).nullable(),
  customerConfirmed: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Logsheet = z.infer<typeof logsheetSchema>;

// Upsert-shaped, like QuotationResponse — one logsheet per (rental, date),
// resubmitting the same date corrects it rather than duplicating.
export const submitLogsheetRequestSchema = z.object({
  logDate: z.string().date(),
  shift: z.string().min(1).max(200).optional(),
  operatingHours: z.number().nonnegative().optional(),
  idleHours: z.number().nonnegative().optional(),
  overtimeHours: z.number().nonnegative().optional(),
  operatorName: z.string().min(1).max(200).optional(),
  fuelConsumed: z.number().nonnegative().optional(),
  fuelUnit: z.string().min(1).max(20).optional(),
  remarks: z.string().min(1).max(2000).optional(),
  customerConfirmed: z.boolean().optional(),
});
export type SubmitLogsheetRequest = z.infer<typeof submitLogsheetRequestSchema>;

// No totalRentalDays here (unlike RentalUtilization) — that would need
// summing every Rental's own date span for this machine, a cross-rental
// aggregation not worth a new repository method for MVP scope (§17: "do
// not build an enterprise analytics platform"). loggedDayCount is the
// honest, self-contained metric: how many distinct days have a logsheet.
export const machineUtilizationSchema = z.object({
  machineId: z.string().uuid(),
  totalOperatingHours: z.number().nonnegative(),
  totalIdleHours: z.number().nonnegative(),
  totalOvertimeHours: z.number().nonnegative(),
  loggedDayCount: z.number().int().nonnegative(),
});
export type MachineUtilization = z.infer<typeof machineUtilizationSchema>;

export const rentalUtilizationSchema = z.object({
  rentalId: z.string().uuid(),
  totalRentalDays: z.number().int().nonnegative(),
  totalOperatingHours: z.number().nonnegative(),
  totalIdleHours: z.number().nonnegative(),
  totalOvertimeHours: z.number().nonnegative(),
  loggedDayCount: z.number().int().nonnegative(),
});
export type RentalUtilization = z.infer<typeof rentalUtilizationSchema>;
