# Backend Hardening Report

Living document, updated as each frontend-revamp phase (see `feat/frontend-revamp`)
surfaces backend behavior that appears too permissive while wiring up real
screens against real data. These are observations only — nothing here is
fixed on the frontend branch; it is input for a later backend-hardening pass.

Format per entry: current behavior, expected business rule, why it matters,
affected domain, recommended enforcement, validation location.

**Status**: Phases 1–10 of `feat/frontend-revamp` are complete (see
`docs/frontend-revamp-summary.md`). Only Phase 5 surfaced a new entry;
Phases 6–9 didn't exercise a path that would reveal further backend
permissiveness. The `feat/backend-mvp-gaps` pass (closing the
frontend-backend gaps below) added two further observations — see
"Backend MVP Gaps pass" below. This document remains open for any future
phase or backend-hardening pass to add to. **This is still not a completed
audit** — the comprehensive business-rule audit is a separate, later phase
(see the backend-mvp-gaps task brief, section 4).

---

Phases 1–4 (design system/shell, dashboards, machines, marketplace/
requirements) didn't exercise a path that would surface new business-rule
permissiveness. Phase 5 (quotations) did, via real seed data rather than a
live user flow bug:

## Phase 5 — Quotations

### Current behavior
Querying `commercial_quotations` directly: multiple rows have
`status = 'awarded'`, `source_auction_id IS NULL`, and
`renter_accepted_at IS NULL` (e.g. reference number `Q-2026-1` recurs
across 4 different seeded rental companies' quotations, 3 of which are in
exactly this state). The frontend (this phase's detail page) correctly
renders these as "Awarded" + "Not yet accepted" side by side — which is
itself the intended UI per the Phase-1-recorded decision — but the
*existence* of that combination for a non-auction-sourced quotation with a
real `renterOrganizationId` shouldn't be reachable through the real
`awardQuotation` service method, which requires `renterAcceptedAt` to be
set first in exactly that case.

### Expected business rule
An `awarded` `CommercialQuotation` with a real `renterOrganizationId` and
no `sourceAuctionId` should always have `renterAcceptedAt` set — enforced
today only inside `CommercialQuotationService.awardQuotation`.

### Why it matters
The invariant has no backing at the database level (no `CHECK` constraint
or trigger), so it only holds as long as every code path that can set
`status = 'awarded'` goes through that one service method. The seed script
(`apps/api/scripts/seed-demo-data.ts` or similar direct inserts) clearly
doesn't — which means any future bulk-import, admin tool, or migration
that writes `commercial_quotations` directly can silently reintroduce the
exact "award to self" shape this rule exists to prevent.

### Affected domain
`commercial_quotations` (marketplace/commercial-quotation module).

### Recommended backend enforcement
A `CHECK` constraint (e.g. `renter_accepted_at IS NOT NULL OR
renter_organization_id IS NULL OR source_auction_id IS NOT NULL OR status
<> 'awarded'`) or an equivalent trigger, so the invariant holds regardless
of which code path writes the row — not just the one service method.

### Validation location
Database constraint/trigger on `commercial_quotations`, in addition to the
existing service-layer check (defense in depth, not a replacement).

---

## Backend MVP Gaps pass (`feat/backend-mvp-gaps`)

Two new observations surfaced while closing the frontend-backend gaps listed
in `docs/frontend-backend-gap-report.md` — recorded here per that task's own
instruction to log, not fix, anything not strictly required for the
capability being implemented. Neither blocked the work; both are input for
the later full audit.

### Current behavior

`catalogue.manage` (new permission, migration
`0020_seed_catalogue_manage_permission.ts`) is granted to the `owner` role
scoped to `organization_type = rental_company` — the same per-organization
permission shape used everywhere else in this codebase. But the Product
Catalogue (`product_categories`/`product_subcategories`/`products`) is
platform-level, shared data, not organization-owned (it has no
`organization_id` column at all). The `:organizationId` in
`POST/PATCH /organizations/:organizationId/product-categories` etc. is used
only to resolve which membership grants the permission — the created/edited
row is visible to and shared by every Rental Company.

### Expected business rule

Editing the platform-wide Product Catalogue should require a platform-level
administrator role, distinct from being an `owner` of any one Rental
Company's own organization.

### Why it matters

Any Rental Company's `owner` can currently rename a product category,
change a product's specifications, or add new categories/subcategories that
every other Rental Company on the platform also sees and registers Machines
against. There is no isolation between "manage my organization's fleet" and
"manage the platform's shared reference data."

### Affected domain

Catalogue module (`apps/api/src/modules/catalogue`).

### Recommended backend enforcement

A real platform-admin authorization tier, independent of tenant
organization membership — see
`docs/platform-admin-architecture-requirements.md` for what that requires
(a staff-user concept, a new session shape, a cross-tenant-safe query
layer). `catalogue.manage`'s current per-Rental-Company scoping should be
replaced once that tier exists, not extended further.

### Validation location

Authorization layer (`PermissionService`) once a platform-admin principal
exists; no database-level change needed (the catalogue tables' lack of
`organization_id` is correct — they are genuinely shared).

---

### Current behavior

`RequirementService.updateRequirement` (new in this pass) allows a Renter to
edit a Requirement's capacity/quantity/dates/etc. any time `status ===
"open"` — which includes after one or more Rental Companies have already
submitted a `QuotationResponse` against the original terms
(`quotation_response_service.ts`), and after a Renter has started an
`Auction` against the Requirement (`AuctionService.createAuction` only
requires `status === "open"` and never changes it). Neither path is blocked
by the new edit endpoint, and neither existing responder/participant is
notified that the terms they responded to have since changed.

### Expected business rule

Editing a Requirement's commercial terms after the market has already acted
on it (a submitted QuotationResponse, a created Auction) should either be
blocked, or should trigger an explicit re-notification/invalidation of the
stale responses — the same principle already enforced for
CommercialQuotation terms (`updateTerms` clears `renter_accepted_at`, see
migration `0018`) and for Rental terms (`updateRentalTerms` is `confirmed`-
status-only).

### Why it matters

A Rental Company could be quoting/bidding against terms the Renter has
since silently changed, with no signal that its already-submitted response
is now stale. This is a data-integrity/fairness gap in the marketplace flow,
not an authorization hole — every check that exists (ownership, `open`-only)
is correctly enforced; the gap is that "open" doesn't yet distinguish
"nobody has acted on this yet" from "the market has already responded."

### Affected domain

Requirements/RFQ module
(`apps/api/src/modules/marketplace/rfq`), interacting with
quotation-response and auction modules.

### Recommended backend enforcement

Either (a) restrict `updateRequirement` to Requirements with zero
`QuotationResponse` rows and no `Auction` yet, mirroring the "no one has
acted yet" gate already used elsewhere, or (b) keep the current scope but
add a notification (existing `NotificationService`) to every Rental Company
that has responded/joined, whenever the Renter edits the Requirement.
Product decision needed on which; not made in this pass.

### Validation location

Service layer (`RequirementService.updateRequirement`), checking existing
`QuotationResponseRepository`/`AuctionRepository` rows before allowing the
edit.

---

## Template for new entries

```
### Current behavior


### Expected business rule


### Why it matters


### Affected domain


### Recommended backend enforcement


### Validation location

```
