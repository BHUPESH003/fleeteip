import { z } from "zod";

// A Project is the Renter's own grouping of everything tied to one
// site/engagement (Requirements, Quotations, Rentals, Work Orders,
// Transport, Logsheets, Billing) — replaces the free-text
// projectName/projectLocation strings previously repeated on every
// Requirement/Rental. See docs/rental-domain-design.md §12 for why a
// Project entity was deliberately NOT built at MVP launch, and the client
// decision (this phase) that reversed that call.
export const projectStatusSchema = z.enum(["active", "completed", "cancelled"]);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const projectSchema = z.object({
  id: z.string().uuid(),
  renterOrganizationId: z.string().uuid(),
  projectCode: z.string().min(1).max(30),
  projectType: z.string().min(1).max(100),
  projectName: z.string().min(1).max(200),
  siteLocation: z.string().min(1).max(200),
  state: z.string().min(1).max(100).nullable(),
  district: z.string().min(1).max(100).nullable(),
  startDate: z.string().date(),
  endDate: z.string().date().nullable(),
  status: projectStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Project = z.infer<typeof projectSchema>;

export const createProjectRequestSchema = z.object({
  projectType: z.string().min(1).max(100),
  projectName: z.string().min(1).max(200),
  siteLocation: z.string().min(1).max(200),
  state: z.string().min(1).max(100).optional(),
  district: z.string().min(1).max(100).optional(),
  startDate: z.string().date(),
  endDate: z.string().date().optional(),
});
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

// Deliberately excludes status (updateProjectStatusRequestSchema's job) and
// projectCode/renterOrganizationId (identity, immutable after creation —
// same reasoning as Machine.productId, Requirement.productSubcategoryId).
export const updateProjectRequestSchema = z
  .object({
    projectType: z.string().min(1).max(100).optional(),
    projectName: z.string().min(1).max(200).optional(),
    siteLocation: z.string().min(1).max(200).optional(),
    state: z.string().min(1).max(100).optional(),
    district: z.string().min(1).max(100).optional(),
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;

// Renter-only transition: active -> completed | cancelled. Both terminal.
export const updateProjectStatusRequestSchema = z.object({
  status: z.enum(["completed", "cancelled"]),
});
export type UpdateProjectStatusRequest = z.infer<typeof updateProjectStatusRequestSchema>;
