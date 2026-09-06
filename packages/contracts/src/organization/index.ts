import { z } from "zod";

/**
 * MVP scope is locked to these two organization types. New types (Transport,
 * OEM, ...) are added here later — the schema/table design does not require
 * a rewrite, but they are explicitly out of scope until their own phase.
 */
export const organizationTypeCodeSchema = z.enum(["rental_company", "renter"]);
export type OrganizationTypeCode = z.infer<typeof organizationTypeCodeSchema>;

export const organizationSchema = z.object({
  id: z.string().uuid(),
  organizationTypeCode: organizationTypeCodeSchema,
  name: z.string().min(1).max(200),
  code: z
    .string()
    .min(2)
    .max(10)
    .regex(/^[A-Z0-9]+$/, "code must be uppercase letters/numbers only"),
  createdAt: z.string().datetime(),
});
export type Organization = z.infer<typeof organizationSchema>;

// ponytail: two fixed roles (owner/member) shared across org types, not
// per-organization custom roles. Add custom roles when a real need for
// finer-grained responsibilities appears.
export const roleNameSchema = z.enum(["owner", "member"]);
export type RoleName = z.infer<typeof roleNameSchema>;

export const permissionCodeSchema = z.enum(["organization.manage", "membership.manage"]);
export type PermissionCode = z.infer<typeof permissionCodeSchema>;

export const membershipStatusSchema = z.enum(["active", "invited", "suspended"]);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

export const membershipSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  roleName: roleNameSchema,
  status: membershipStatusSchema,
  createdAt: z.string().datetime(),
});
export type Membership = z.infer<typeof membershipSchema>;

export const membershipWithOrganizationSchema = membershipSchema.extend({
  organization: organizationSchema,
});
export type MembershipWithOrganization = z.infer<typeof membershipWithOrganizationSchema>;
