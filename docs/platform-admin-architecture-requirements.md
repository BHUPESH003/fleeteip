# Platform Administration — Architecture Requirements

Status: **not implemented, deliberately deferred**. This is a "document, don't
build" item from the backend-mvp-gaps pass (`feat/backend-mvp-gaps`) — see
`CLAUDE.md`/the task brief's section on platform administration. Do not
implement any of this without first re-opening it as its own reviewed
architecture decision.

## Why this exists

The target frontend distinguishes two kinds of administration:

1. **Tenant organization administration** — a Rental Company or Renter's own
   `owner` managing their own organization (profile, members, roles). This
   IS implemented — see `OrganizationService`
   (`apps/api/src/modules/organizations/application/organization-service.ts`),
   gated by the existing `organization.manage`/`membership.manage`
   permissions.
2. **FleetIP platform administration** — a FleetIP staff member managing
   *any* tenant's data, the catalogue, or the platform itself, independent
   of being a member of any tenant organization. This is **not**
   implemented, and cannot be safely bolted onto the current authorization
   model.

## Ground truth investigated during this pass

- `organizationTypeCodeSchema` (`packages/contracts/src/organization/index.ts`)
  is a locked `z.enum(["rental_company", "renter"])` with a comment stating
  this is deliberate MVP scope. There is no third organization type and no
  "staff" or "platform" type anywhere in the schema.
- Every permission check (`PermissionService.hasPermission`) requires an
  **active membership in a specific organization** plus that organization's
  type being in `PERMISSION_ORGANIZATION_TYPES[code]`. There is no code path
  anywhere that grants a permission independent of organization membership.
- `AuthenticatedSession`/`MembershipWithOrganization`
  (`packages/contracts/src/identity/index.ts`,
  `packages/contracts/src/organization/index.ts`) always attach a `Membership`
  to an `Organization` — there is no "org-less" or "super-user" session
  shape.
- The only cross-tenant query in the entire codebase is
  `OrganizationRepository.listByType` (a name-lookup for the counterparty
  picker on quotation/rental forms — e.g. "which Renters exist" — itself
  permission-gated, and it returns only `id/name/code/type`, never another
  org's private operational data).
- The new `catalogue.manage` permission added in this pass
  (migration `0020_seed_catalogue_manage_permission.ts`) is the closest
  approximation available today, and it is an explicitly documented
  imperfection: it grants edit rights over the shared, platform-level
  Product Catalogue to every Rental Company's own `owner` role, because no
  better-scoped permission tier exists. Any Rental Company admin can
  currently edit categories/subcategories/products that every other Rental
  Company also sees. See that migration's comment and the corresponding
  entry in `docs/backend-hardening-report.md`.

## What a real platform-admin tier requires

Building this properly (not attempted in this pass) needs, at minimum:

1. **A staff-user concept independent of organization membership.**
   Either:
   - a third `organization_type` (e.g. `platform`) with its own internal
     "organization" that platform staff belong to, reusing the existing
     `memberships`/`roles`/`permissions` machinery, or
   - a wholly separate `staff_users` table + a `is_platform_admin` flag on
     the session, bypassing the organization/membership model entirely.

   The first option reuses more existing infrastructure (permissions,
   roles) but risks conflating "a rental_company that happens to be
   FleetIP's own ops team" with real tenant data; the second is cleaner
   conceptually but needs its own login/session code path.

2. **A new session/auth shape.** `AuthenticatedSession` currently always
   carries `memberships: MembershipWithOrganization[]`. A platform admin
   session needs to represent "acting with platform authority," not "acting
   as a member of organization X." `getAuthenticatedSession`
   (`apps/api/src/modules/identity/application/auth-service.ts`) would need
   a second authenticated-principal shape, and `PermissionService` would
   need a new entry point that doesn't require an `organizationId` at all
   (or that accepts a sentinel meaning "any/all organizations").

3. **A cross-tenant-safe query layer.** Every repository in this codebase is
   written to filter by the caller's own `organization_id` — that's the
   tenant-isolation guarantee. A platform-admin read/write path must
   deliberately bypass that filter for specific, audited operations (e.g.
   "list all organizations," "suspend an organization," "edit any tenant's
   catalogue entry") without accidentally making that bypass reachable by a
   normal tenant permission check. This likely means new repository methods
   explicitly named/scoped for platform use (e.g.
   `OrganizationRepository.listAllForPlatformAdmin()`), never reusing a
   tenant-scoped method with a wildcard organizationId.

4. **New migrations** for whichever shape is chosen in (1), plus seed data
   for at least one real platform-admin account, following the existing
   password-hashing/session-token discipline
   (`apps/api/src/modules/identity/domain/password.ts`,
   `session-token.ts`) — never a hardcoded bypass credential.

5. **A defined answer to what platform admins can actually do.** Not
   discovered/decided during this pass: whether platform admins can read
   tenant operational data (rentals, quotations, billing) at all, or are
   limited to catalogue/reference-data administration and account
   suspension. This is a product decision, not just an engineering one.

## Explicit non-goals for this pass

- No "super admin" shortcut, hardcoded bypass, or environment-variable
  master password. Section 15 of the task brief prohibits this outright,
  and nothing in this pass introduces one.
- No cross-tenant query was added anywhere except the pre-existing
  `listByType` counterparty lookup described above.
- `catalogue.manage`'s current per-Rental-Company scoping is a **stopgap**,
  not a proposed permanent design — see the hardening report entry.

## Recommendation

Treat this as its own scoped project once product requirements for platform
administration are actually defined (which tenant data, if any, platform
staff may view/edit; whether this is a separate FleetIP-internal app or a
mode within the same app). Do not implement piecemeal permission bypasses in
the meantime.
