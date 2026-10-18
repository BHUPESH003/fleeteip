import { z } from "zod";

export const machineStatusSchema = z.enum(["active", "under_maintenance", "retired"]);
export type MachineStatus = z.infer<typeof machineStatusSchema>;
/** MachineStatus.x names each value once; `MachineStatus` is also the type. */
export const MachineStatus = machineStatusSchema.enum;

export const createMachineRequestSchema = z.object({
  productId: z.string().uuid(),
  // Optional: the server auto-assigns a per-organization asset code when one
  // isn't supplied (see EquipmentService.createMachine). A caller may still
  // override it with its own fleet code.
  assetCode: z.string().min(1).max(50).optional(),
  chassisNumber: z.string().min(1).max(50).optional(),
  // Optional: not every machine has a road registration number — crawler/
  // tracked equipment (crawler cranes, tracked excavators, dozers, etc.) has
  // none at all, so this is "not applicable" rather than required.
  registrationNumber: z.string().min(1).max(50).optional(),
  yearOfManufacture: z.number().int().min(1980).max(new Date().getFullYear()).optional(),
});

export const machineSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  assetCode: z.string().min(1).max(200),
  chassisNumber: z.string().min(1).max(200).nullable(),
  productId: z.string().uuid(),
  // Nullable: a machine with no road registration (crawler/tracked equipment)
  // simply has no number to show.
  registrationNumber: z.string().min(1).max(200).nullable(),
  yearOfManufacture: z.number().int().min(1900).max(new Date().getFullYear()).nullable(),
  status: machineStatusSchema,
  createdAt: z.string().datetime(),
});

export const updateMachineStatusRequestSchema = z.object({
  status: machineStatusSchema,
});

// Corrects data-entry mistakes after registration — deliberately excludes
// organizationId (ownership never changes hands through this endpoint) and
// productId (the equipment hierarchy is a create-time decision; the business
// model has no "reclassify an existing machine" concept yet). At least one
// field must be provided, same discipline as updateRentalTermsRequestSchema.
export const updateMachineRequestSchema = z
  .object({
    assetCode: z.string().min(1).max(50).optional(),
    chassisNumber: z.string().min(1).max(50).optional(),
    // An empty string clears the registration number (sets it to NULL) —
    // used when a machine turns out to have no road registration. A
    // non-empty value, if present, must be 1..50 chars.
    registrationNumber: z.union([z.literal(""), z.string().min(1).max(50)]).optional(),
    yearOfManufacture: z.number().int().min(1980).max(new Date().getFullYear()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });
export type UpdateMachineRequest = z.infer<typeof updateMachineRequestSchema>;

export type Machine = z.infer<typeof machineSchema>;
