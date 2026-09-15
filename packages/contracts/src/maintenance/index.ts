import { z } from "zod";

export const maintenanceTypeSchema = z.enum(["scheduled", "breakdown", "inspection", "other"]);
export type MaintenanceType = z.infer<typeof maintenanceTypeSchema>;

export const maintenanceStatusSchema = z.enum([
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
]);
export type MaintenanceStatus = z.infer<typeof maintenanceStatusSchema>;

export const maintenanceRecordSchema = z.object({
  id: z.string().uuid(),
  machineId: z.string().uuid(),
  maintenanceType: maintenanceTypeSchema,
  startDate: z.string().date(),
  endDate: z.string().date().nullable(),
  status: maintenanceStatusSchema,
  notes: z.string().min(1).max(2000).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type MaintenanceRecord = z.infer<typeof maintenanceRecordSchema>;

export const createMaintenanceRequestSchema = z
  .object({
    machineId: z.string().uuid(),
    maintenanceType: maintenanceTypeSchema,
    startDate: z.string().date(),
    endDate: z.string().date().optional(),
    notes: z.string().min(1).max(2000).optional(),
  })
  // No "not in the past" rule — logging a maintenance window that already
  // happened (or is ongoing) is the normal case, not a bug.
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "End date cannot be before the start date",
    path: ["endDate"],
  });
export type CreateMaintenanceRequest = z.infer<typeof createMaintenanceRequestSchema>;

export const updateMaintenanceStatusRequestSchema = z.object({
  status: maintenanceStatusSchema,
});
export type UpdateMaintenanceStatusRequest = z.infer<typeof updateMaintenanceStatusRequestSchema>;
