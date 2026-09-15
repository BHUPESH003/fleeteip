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

// Role names are no longer a fixed global enum — every organization gets
// its own "member" role (and can create further custom roles) with
// whatever permission set its owner assigns. "owner" is the one built-in
// role every organization has from creation, always full access,
// immutable — see roleSchema's isBuiltin flag.
export const roleNameSchema = z.string().trim().min(1).max(60);
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
  "maintenance.manage",
  "transport.manage",
  "logsheet.manage",
  "billing.manage",
  "billing.respond",
  "rental.respond",
  "transport.respond",
  "logsheet.respond",
  "catalogue.manage",
  "project.manage",
]);
export const PERMISSION_ORGANIZATION_TYPES: Record<PermissionCode, OrganizationTypeCode[]> = {
  "organization.manage": ["rental_company", "renter"],
  "membership.manage": ["rental_company", "renter"],
  "equipment.manage": ["rental_company"],
  "rental.manage": ["rental_company"],
  // Read-only view of a Renter's own rentals — same split as
  // quotation.manage/.respond and billing.manage/.respond.
  "rental.respond": ["renter"],
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
  // Maintenance/Transport/Logsheets are the Rental Company's own
  // operational records; Billing splits create/manage (Rental Company)
  // from read-only view (Renter), same shape as quotation.manage/.respond.
  // Maintenance has no Renter-facing side — it's scheduling/servicing the
  // Rental Company's own fleet, not something tied to a specific rental a
  // Renter is party to.
  "maintenance.manage": ["rental_company"],
  "transport.manage": ["rental_company"],
  "transport.respond": ["renter"],
  "logsheet.manage": ["rental_company"],
  "logsheet.respond": ["renter"],
  "billing.manage": ["rental_company"],
  "billing.respond": ["renter"],
  // The Product Catalogue is platform-level, not organization-owned — see
  // docs/platform-admin-architecture-requirements.md for why this permission
  // is scoped to rental_company (not a real platform-admin tier) as a known,
  // documented limitation of the current two-org-type authorization model.
  "catalogue.manage": ["rental_company"],
  // A Project belongs to the Renter organization — see docs/rental-domain-design.md
  // and packages/contracts/src/project/index.ts. A Rental Company never manages
  // a Project directly; it only ever sees Project context threaded through
  // Requirement/Quotation/Rental (denormalized read fields), same pattern as
  // machineAssetCode on a Renter-facing Rental.
  "project.manage": ["renter"],
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

// --- Organization administration: a tenant admin's own org/members/roles ---
// Scoped deliberately conservatively — see docs/frontend-backend-gap-report.md
// for what a tenant org-admin screen actually needs. Never exposes
// password_hash/session tokens or any other authentication internal.

export const organizationMemberSchema = z.object({
  id: z.string().uuid(), // membership id
  userId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  roleId: z.string().uuid(),
  roleName: roleNameSchema,
  status: membershipStatusSchema,
  createdAt: z.string().datetime(),
});
export type OrganizationMember = z.infer<typeof organizationMemberSchema>;

// --- Invites: a link-based route into an organization, replacing the old
// email-lookup "invite" (which created a membership nothing ever
// activated). No email is required to create one — the owner shares the
// link however they like; email delivery is a future addition on top of
// the same token, not a different mechanism. ---

export const inviteStatusSchema = z.enum(["pending", "accepted", "revoked"]);
export type InviteStatus = z.infer<typeof inviteStatusSchema>;

export const createInviteRequestSchema = z.object({
  roleId: z.string().uuid(),
});
export type CreateInviteRequest = z.infer<typeof createInviteRequestSchema>;

export const organizationInviteSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  roleName: roleNameSchema,
  status: inviteStatusSchema,
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type OrganizationInvite = z.infer<typeof organizationInviteSchema>;

// The raw token is returned exactly once, at creation — never stored in
// plaintext, never retrievable again (same discipline as a session token).
export const createInviteResponseSchema = z.object({
  invite: organizationInviteSchema,
  token: z.string(),
  link: z.string(),
});
export type CreateInviteResponse = z.infer<typeof createInviteResponseSchema>;

// Shown to a visitor who may not be signed in yet — deliberately minimal,
// never leaks anything about the organization beyond its name/type.
export const invitePreviewSchema = z.object({
  organizationName: z.string(),
  organizationTypeCode: organizationTypeCodeSchema,
  roleName: roleNameSchema,
  status: inviteStatusSchema,
  expired: z.boolean(),
});
export type InvitePreview = z.infer<typeof invitePreviewSchema>;

// Only required when the visitor has no existing session — accepting while
// already logged in needs no body at all (the server uses the caller's own
// session, never a client-supplied identity).
export const acceptInviteRequestSchema = z
  .object({
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
    displayName: z.string().min(1).optional(),
  })
  .refine(
    (data) =>
      (!data.email && !data.password && !data.displayName) ||
      (data.email && data.password && data.displayName),
    { message: "Provide email, password, and displayName together, or none of them" },
  );
export type AcceptInviteRequest = z.infer<typeof acceptInviteRequestSchema>;

export const roleWithPermissionsSchema = z.object({
  id: z.string().uuid(),
  roleName: roleNameSchema,
  // Built-in roles ("owner") are always full-access and can't be created,
  // edited, or deleted through the API — only an organization's own roles
  // (its "member" and any further custom roles) can be.
  isBuiltin: z.boolean(),
  permissions: z.array(permissionCodeSchema),
});
export type RoleWithPermissions = z.infer<typeof roleWithPermissionsSchema>;

// --- Custom roles: create/edit/delete an organization's own roles, and
// move a member between roles. "owner" is never a valid target here — see
// roleWithPermissionsSchema.isBuiltin. ---

export const createRoleRequestSchema = z.object({
  name: roleNameSchema,
  permissions: z.array(permissionCodeSchema),
});
export type CreateRoleRequest = z.infer<typeof createRoleRequestSchema>;

// Always a full replace of both fields — the caller sends the complete
// desired state, never a partial patch.
export const updateRoleRequestSchema = createRoleRequestSchema;
export type UpdateRoleRequest = z.infer<typeof updateRoleRequestSchema>;

export const updateMemberRoleRequestSchema = z.object({
  roleId: z.string().uuid(),
});
export type UpdateMemberRoleRequest = z.infer<typeof updateMemberRoleRequestSchema>;
