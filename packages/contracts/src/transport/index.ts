import { z } from "zod";
import { isFutureIsoDate, isoDate } from "../shared/dates.js";

export const transportLegSchema = z.enum(["mobilization", "demobilization"]);
export type TransportLeg = z.infer<typeof transportLegSchema>;
/** TransportLeg.x names each value once; `TransportLeg` is also the type. */
export const TransportLeg = transportLegSchema.enum;

export const transportStatusSchema = z.enum(["planned", "dispatched", "delivered", "cancelled"]);
export type TransportStatus = z.infer<typeof transportStatusSchema>;
/** TransportStatus.x names each value once; `TransportStatus` is also the type. */
export const TransportStatus = transportStatusSchema.enum;

export const transportRecordSchema = z.object({
  id: z.string().uuid(),
  rentalId: z.string().uuid(),
  leg: transportLegSchema,
  pickupLocation: z.string().min(1).max(300).nullable(),
  destination: z.string().min(1).max(300).nullable(),
  plannedDate: isoDate().nullable(),
  actualDate: isoDate().nullable(),
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
  plannedDate: isoDate().optional(),
  transportDetails: z.string().min(1).max(1000).optional(),
  charges: z.number().nonnegative().optional(),
  notes: z.string().min(1).max(2000).optional(),
});
export type CreateTransportRequest = z.infer<typeof createTransportRequestSchema>;

// Omitted = unchanged; null = remove the value. actualDate and status
// record what happened, so they can be corrected but not removed.
export const updateTransportRequestSchema = z
  .object({
    pickupLocation: z.string().min(1).max(300).nullable().optional(),
    destination: z.string().min(1).max(300).nullable().optional(),
    plannedDate: isoDate().nullable().optional(),
    actualDate: isoDate().optional(),
    status: transportStatusSchema.optional(),
    transportDetails: z.string().min(1).max(1000).nullable().optional(),
    charges: z.number().nonnegative().nullable().optional(),
    notes: z.string().min(1).max(2000).nullable().optional(),
  })
  // No ordering rule against plannedDate — dispatch can legitimately happen
  // earlier or later than planned. actualDate records something that has
  // already happened, though, so it can't be dated into the future.
  .refine((data) => data.actualDate === undefined || !isFutureIsoDate(data.actualDate), {
    message: "Actual date cannot be in the future",
    path: ["actualDate"],
  });
export type UpdateTransportRequest = z.infer<typeof updateTransportRequestSchema>;
