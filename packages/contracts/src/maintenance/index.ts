import { z } from "zod";
import { machineStatusSchema } from "../equipment/index.js";
import { isFutureIsoDate } from "../shared/dates.js";

export const maintenanceTypeSchema = z.enum(["scheduled", "breakdown", "inspection", "other"]);
export type MaintenanceType = z.infer<typeof maintenanceTypeSchema>;
/** MaintenanceType.x names each value once; `MaintenanceType` is also the type. */
export const MaintenanceType = maintenanceTypeSchema.enum;

export const maintenanceStatusSchema = z.enum([
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
]);
export type MaintenanceStatus = z.infer<typeof maintenanceStatusSchema>;
/** MaintenanceStatus.x names each value once; `MaintenanceStatus` is also the type. */
export const MaintenanceStatus = maintenanceStatusSchema.enum;

export const maintenanceRecordSchema = z.object({
  id: z.string().uuid(),
  machineId: z.string().uuid(),
  maintenanceType: maintenanceTypeSchema,
  startDate: z.string().date(),
  endDate: z.string().date().nullable(),
  status: maintenanceStatusSchema,
  notes: z.string().min(1).max(2000).nullable(),
  /** The rental this job was logged against (e.g. a breakdown on site), if any. */
  rentalId: z.string().uuid().nullable(),
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
    /** Link the job to a rental of the same machine; that rental's dates don't block it. */
    rentalId: z.string().uuid().optional(),
  })
  // No "not in the past" rule — logging a maintenance window that already
  // happened (or is ongoing) is the normal case, not a bug.
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "End date cannot be before the start date",
    path: ["endDate"],
  });
export type CreateMaintenanceRequest = z.infer<typeof createMaintenanceRequestSchema>;

// POST .../maintenance-records/send-to-workshop takes createMaintenanceRequestSchema:
// the job is created In progress and the machine set Under maintenance, in one transaction.

/** POST .../maintenance-records/log-completed — a job that already happened, created Completed. */
export const logCompletedMaintenanceRequestSchema = createMaintenanceRequestSchema
  .refine((data) => Boolean(data.endDate), {
    message: "A completed job needs the day it finished",
    path: ["endDate"],
  })
  .refine((data) => !data.endDate || !isFutureIsoDate(data.endDate), {
    message: "A completed job can't finish in the future",
    path: ["endDate"],
  });

export const updateMaintenanceStatusRequestSchema = z.object({
  status: maintenanceStatusSchema,
  /** Also move the machine to this status in the same transaction (needs equipment.manage). */
  machineStatus: machineStatusSchema.optional(),
});
export type UpdateMaintenanceStatusRequest = z.infer<typeof updateMaintenanceStatusRequestSchema>;
