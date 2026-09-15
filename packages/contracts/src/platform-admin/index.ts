import { z } from "zod";

// FleetIP's own staff (Platform Admin) — a wholly separate principal from
// tenant User, see apps/api/src/modules/staff. Never carries password_hash.
export const staffUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  createdAt: z.string().datetime(),
});
export type StaffUser = z.infer<typeof staffUserSchema>;

export const staffLoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type StaffLoginRequest = z.infer<typeof staffLoginRequestSchema>;

// Platform Admin's own view of a tenant organization/user — carries
// `status` (suspend/reactivate), which the tenant-facing Organization/User
// contract types never expose.
export const platformOrganizationSchema = z.object({
  id: z.string().uuid(),
  organizationTypeCode: z.string(),
  name: z.string(),
  code: z.string(),
  status: z.enum(["active", "suspended"]),
  createdAt: z.string().datetime(),
});
export type PlatformOrganization = z.infer<typeof platformOrganizationSchema>;

export const platformUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  status: z.enum(["active", "suspended"]),
  createdAt: z.string().datetime(),
});
export type PlatformUser = z.infer<typeof platformUserSchema>;

export const updateStatusRequestSchema = z.object({
  status: z.enum(["active", "suspended"]),
});
export type UpdateStatusRequest = z.infer<typeof updateStatusRequestSchema>;

export const platformDashboardCountsSchema = z.object({
  organizations: z.number().int().nonnegative(),
  users: z.number().int().nonnegative(),
  openRequirements: z.number().int().nonnegative(),
  liveAuctions: z.number().int().nonnegative(),
});
export type PlatformDashboardCounts = z.infer<typeof platformDashboardCountsSchema>;
