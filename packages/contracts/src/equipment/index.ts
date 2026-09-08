import { z } from "zod";

export const machineStatusSchema = z.enum(["active", "under_maintenance", "retired"]);
export type MachineStatus = z.infer<typeof machineStatusSchema>;

export const createMachineRequestSchema = z.object({
  productId: z.string().uuid(),
  assetCode: z.string().min(1).max(50),
  chassisNumber: z.string().min(1).max(50).optional(),
  registrationNumber: z.string().max(50),
  yearOfManufacture: z.number().int().min(1980).max(new Date().getFullYear()).optional(),
});

export const machineSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  assetCode: z.string().min(1).max(200),
  chassisNumber: z.string().min(1).max(200).nullable(),
  productId: z.string().uuid(),
  registrationNumber: z.string().min(1).max(200),
  yearOfManufacture: z.number().int().min(1900).max(new Date().getFullYear()).nullable(),
  status: machineStatusSchema,
  createdAt: z.string().datetime(),
});

export const updateMachineStatusRequestSchema = z.object({
  status: machineStatusSchema,
});

export type Machine = z.infer<typeof machineSchema>;
