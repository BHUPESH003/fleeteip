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

export const permissionCodeSchema = z.enum([
  "organization.manage",
  "membership.manage",
  "equipment.manage",
  "rental.manage",
  "rfq.manage",
  "rfq.respond",
  "quotation.manage",
  "quotation.respond",
  "auction.manage",
  "auction.participate",
]);
export const PERMISSION_ORGANIZATION_TYPES: Record<PermissionCode, OrganizationTypeCode[]> = {
  "organization.manage": ["rental_company", "renter"],
  "membership.manage": ["rental_company", "renter"],
  "equipment.manage": ["rental_company"],
  "rental.manage": ["rental_company"],
  // Renter posts/closes a Requirement; Rental Company browses/responds to it.
  "rfq.manage": ["renter"],
  "rfq.respond": ["rental_company"],
  // Rental Company drafts/sends/withdraws/awards a Quotation; Renter accepts/
  // negotiates/rejects it. See docs/marketplace-core-loop-design.md §6.
  "quotation.manage": ["rental_company"],
  "quotation.respond": ["renter"],
  // Renter runs the auction (create/approve participants/close); Rental
  // Company joins and bids.
  "auction.manage": ["renter"],
  "auction.participate": ["rental_company"],
};

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
  permissions: z.array(permissionCodeSchema),
});
export type MembershipWithOrganization = z.infer<typeof membershipWithOrganizationSchema>;
