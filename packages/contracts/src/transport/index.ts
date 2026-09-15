import { z } from "zod";
import { isFutureIsoDate } from "../shared/dates.js";

export const transportLegSchema = z.enum(["mobilization", "demobilization"]);
export type TransportLeg = z.infer<typeof transportLegSchema>;

export const transportStatusSchema = z.enum(["planned", "dispatched", "delivered", "cancelled"]);
export type TransportStatus = z.infer<typeof transportStatusSchema>;

export const transportRecordSchema = z.object({
  id: z.string().uuid(),
  rentalId: z.string().uuid(),
  leg: transportLegSchema,
  pickupLocation: z.string().min(1).max(300).nullable(),
  destination: z.string().min(1).max(300).nullable(),
  plannedDate: z.string().date().nullable(),
  actualDate: z.string().date().nullable(),
  status: transportStatusSchema,
  transportDetails: z.string().min(1).max(1000).nullable(),
  charges: z.number().nonnegative().nullable(),
  notes: z.string().min(1).max(2000).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TransportRecord = z.infer<typeof transportRecordSchema>;

export const createTransportRequestSchema = z.object({
  leg: transportLegSchema,
  pickupLocation: z.string().min(1).max(300).optional(),
  destination: z.string().min(1).max(300).optional(),
  plannedDate: z.string().date().optional(),
  transportDetails: z.string().min(1).max(1000).optional(),
  charges: z.number().nonnegative().optional(),
  notes: z.string().min(1).max(2000).optional(),
});
export type CreateTransportRequest = z.infer<typeof createTransportRequestSchema>;

export const updateTransportRequestSchema = z
  .object({
    pickupLocation: z.string().min(1).max(300).optional(),
    destination: z.string().min(1).max(300).optional(),
    plannedDate: z.string().date().optional(),
    actualDate: z.string().date().optional(),
    status: transportStatusSchema.optional(),
    transportDetails: z.string().min(1).max(1000).optional(),
    charges: z.number().nonnegative().optional(),
    notes: z.string().min(1).max(2000).optional(),
  })
  // No ordering rule against plannedDate — dispatch can legitimately happen
  // earlier or later than planned. actualDate records something that has
  // already happened, though, so it can't be dated into the future.
  .refine((data) => data.actualDate === undefined || !isFutureIsoDate(data.actualDate), {
    message: "Actual date cannot be in the future",
    path: ["actualDate"],
  });
export type UpdateTransportRequest = z.infer<typeof updateTransportRequestSchema>;
