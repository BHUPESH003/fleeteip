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
permissiveness. Phases 11–16 (see below) added two more, and the
`feat/backend-mvp-gaps` pass (closing the frontend-backend gaps in the
other document) added two further observations of its own — see "Backend
MVP Gaps pass" below. This document remains open for any future phase or
backend-hardening pass to add to. **This is still not a completed audit**
— the comprehensive business-rule audit is a separate, later phase (see
the backend-mvp-gaps task brief, section 4).

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
_existence_ of that combination for a non-auction-sourced quotation with a
real `renterOrganizationId` shouldn't be reachable through the real
`awardQuotation` service method, which requires `renterAcceptedAt` to be
set first in exactly that case.

**Update (2026-09-12):** the rule below now applies uniformly — a
`sourceAuctionId` no longer exempts a quotation from requiring
`renterAcceptedAt` either. An earlier version of `awardQuotation` treated
a Path C (auction-sourced) quotation as exempt, reasoning that the
Renter's earlier auction participant-selection was already consent to
whatever commercial terms followed. That was itself a live "award to
self" bug: selecting a participant only decides who gets to quote, not an
agreement to the rate/terms that participant later sets — the Rental
Company could send Path C terms and award them unilaterally, and the
Renter never saw an Accept/counter-offer option in the UI at all
(`needsRenterAcceptance` short-circuited on `sourceAuctionId`). Reported
live by the user; fixed by removing the `sourceAuctionId` exemption from
`awardQuotation`'s guard and from the frontend's
`needsRenterAcceptance`/`acceptanceLabel`/acceptance-badge/KPI-count
logic, so Path C is now held to exactly the same rule as Path A/B.

### Expected business rule

An `awarded` `CommercialQuotation` with a real `renterOrganizationId`
should always have `renterAcceptedAt` set, regardless of `sourceAuctionId`
— enforced today only inside `CommercialQuotationService.awardQuotation`.

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
renter_organization_id IS NULL OR status <> 'awarded'` — note
`source_auction_id` no longer belongs in this clause, see the 2026-09-12
update above) or an equivalent trigger, so the invariant holds regardless
of which code path writes the row — not just the one service method.

### Validation location

Database constraint/trigger on `commercial_quotations`, in addition to the
existing service-layer check (defense in depth, not a replacement).

---

Phases 6–9 didn't exercise a path that would reveal further backend
permissiveness. Phases 11–16 (Catalogue, standalone Transport/Logsheets/
Maintenance, Rentals/Billing polish, tenant Organization admin, Platform
Admin shell, Edit flows) surfaced two more, both found while reading the
real service code to build the Maintenance panel's honest "availability
impact" derivation and the Rental detail "what happens next" hints (not
found via a live user-flow bug):

## Phase 12 — Maintenance

### Current behavior
`MaintenanceService.createMaintenance`
(`apps/api/src/modules/maintenance/application/maintenance-service.ts`)
only calls `rentalRepository.isAvailable(...)` before inserting a new
maintenance record for a machine — it never checks the
`maintenance_records` table itself for an existing `scheduled`/
`in_progress` record on the same machine with an overlapping date range.

### Expected business rule
Two maintenance windows for the same machine shouldn't be allowed to
overlap — the same way `RentalRepository.isAvailable` already prevents two
rentals from overlapping, and the same way maintenance-vs-rental overlap
is already checked in both directions (`hasOverlappingMaintenance` is
called both when creating a maintenance record and when activating a
rental).

### Why it matters
Nothing stops an operator from scheduling two, three, or more overlapping
"scheduled" maintenance windows for the same machine (e.g. two different
technicians both scheduling unrelated service on overlapping dates) — each
creates its own record, `blocksAvailability` in the frontend (Phase 12)
correctly shows both as blocking, but the underlying data has no integrity
guarantee that maintenance windows for one machine are non-overlapping.

### Affected domain
`maintenance_records` (maintenance module).

### Recommended backend enforcement
Add a `maintenanceRepository.hasOverlappingMaintenance(machineId,
startDate, endDate, excludeId?)`-style check inside `createMaintenance`,
mirroring the existing rental-vs-maintenance check — reject (or at least
warn) when the new record's window overlaps an existing `scheduled`/
`in_progress` record for the same machine.

### Validation location
Service layer (`MaintenanceService.createMaintenance`), same layer as the
existing rental-availability check it already performs.

---

## Phase 13 — Rentals / Transport lifecycle

### Current behavior
`RentalService.updateRentalStatus`
(`apps/api/src/modules/marketplace/rental/application/rental-service.ts`)
transitioning a rental to `active` checks that the machine isn't retired
and that there's no overlapping maintenance — but never checks the
`transport_records` table for a `mobilization` leg, let alone whether one
exists and is `delivered`.

### Expected business rule
A rental probably shouldn't be markable `active` ("equipment is on site
and running") before its mobilization transport leg is actually
`delivered` — otherwise "active" can mean "the paperwork says active" with
no equipment yet on site, which undermines exactly what the Rental
detail's new "what happens next" guidance (Phase 13, frontend-only) is
trying to communicate: mobilize, *then* mark active.

### Why it matters
The rental lifecycle (`confirmed → active → off_rent → completed`) and
the transport lifecycle (`planned → dispatched → delivered` per leg) are
two entirely independent state machines today with no server-side link in
either direction — a Rental Company can mark a rental `active` having
never even created a transport record, and equally can mark demobilization
`delivered` on an already-`completed` rental. The frontend only offers UI
sequencing hints; nothing stops the two from drifting out of sync via the
API directly.

### Affected domain
`rentals` + `transport_records` (rental and transport modules).

### Recommended backend enforcement
Either a service-layer check in `updateRentalStatus` (transitioning to
`active` requires a `mobilization` transport record in status
`delivered`) or, if mobilization is meant to be optional for some rentals,
an explicit "no transport required" flag instead of silence — silence
reads as an oversight, not a decision.

### Validation location
Service layer (`RentalService.updateRentalStatus`), alongside the existing
retired-machine and maintenance-overlap checks it already performs there.

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

## Commercial quotation negotiation is one-directional per round

Found while fixing the Path C award-without-acceptance bug above (not
itself a security/isolation hole). **Resolved (2026-09-12):** the user
asked for this fixed directly rather than left deferred — see below.

### Current behavior (as originally found)

`CommercialQuotationService.makeOffer` lets either party create a new
counter-offer whenever the quotation is `sent`/`negotiating`, and
`acceptOffer` lets either party accept the other's pending offer — the
backend supports a real back-and-forth. The frontend
(`apps/web/app/(app)/quotations/[id]/page.tsx`) only ever renders a
"Send counter offer" form inside the Renter's own `canAccept` panel; the
Rental Company's action panel (`isOwner` branch) has no equivalent trigger
— it can Send/Withdraw/Award, or "Accept this offer" on a pending Renter
counter from the Offer trail card, but has no way to counter that counter
with a different number of its own. A round-trip negotiation is possible
(Renter counters → Rental Company accepts or the Renter's terms stand),
but the Rental Company can't push back with its own number without going
around the UI.

### Expected business rule

Both parties in an active negotiation should be able to counter, not just
accept/reject — the backend already allows it.

### Why it matters

Not a correctness or isolation bug — the state machine and permissions
are sound — but it's a real UX/business gap: a Rental Company that
disagrees with a Renter's counter-offer has no in-app way to propose a
different number, only to accept the Renter's number as-is or leave the
quotation stalled.

### Affected domain

Frontend only (`apps/web/app/(app)/quotations/[id]/page.tsx`) — no
backend change needed, the `makeOffer` endpoint already accepts a caller
on either side of the quotation.

### Recommended backend enforcement

None needed — the fix was purely additive UI, no backend/contract change.
The Rental Company's `isOwner` action panel now has its own "Send counter
offer" trigger (same `handleOffer`/`makeOffer` call the Renter's panel
already used, just wired to a second render site), available whenever
`canNegotiate` is true, alongside Send/Withdraw/Award. It coexists with
Award rather than replacing it — a Rental Company that already has the
Renter's acceptance can still choose to award immediately, or propose a
further counter first.

### Validation location

n/a (frontend UI gap, not a business-rule/validation gap).

---

## acceptQuotation ignored a still-pending counter-offer (resolved)

Found and fixed live from a user-supplied screenshot: the Renter's
"Your decision" panel said "Crest Y countered at 11750/shift", but the
Offer trail directly below it showed the actual pending counter-offer at
11650/shift (11700 from the Renter, superseded) — the two numbers didn't
match at all.

### Current behavior (as originally found)

`CommercialQuotationService.acceptQuotation` only ever called
`quotationRepository.setRenterAccepted` — it never looked at
`quotation_offers` at all. `commercial_quotations.rate` is only updated by
`applyAcceptedOffer`/`updateTerms`, so while a counter-offer sits
`pending` (created but not yet accepted via `acceptOffer`), `rate` is
whatever it was before that offer existed — stale. The frontend's "Your
decision" copy and "Accept these terms" button both read `quotation.rate`
directly, so a Renter clicking Accept while the Rental Company's
counter-offer was still pending would record acceptance against the wrong
(older/stale) rate — and `awardQuotation` creates the Rental from
`commercial_quotations.rate`, so the Rental itself would have been created
at that wrong number.

### Expected business rule

Accepting a quotation should always apply whatever is genuinely the
latest, still-open counter-offer from the *other* party first, so
acceptance (and the Rental it produces) reflects the real negotiated
number — never a stale one.

### Why it matters

Financial correctness: the Rental's rate is derived directly from
`commercial_quotations.rate` at award time. A mismatch here isn't
cosmetic — it means the wrong price could be silently attached to a real
Rental, in either party's favor depending on which way the stale rate
happened to differ from the pending offer.

### Affected domain

`commercial_quotations` + `quotation_offers` (marketplace/
commercial-quotation module).

### Recommended backend enforcement — implemented

`acceptQuotation` now looks up `quotation_offers` for a `pending` row; if
one exists and was made by the *other* party (not the Renter's own
still-unanswered counter), it applies that offer first
(`updateStatus(offerId, "accepted")` +
`quotationRepository.applyAcceptedOffer`) before recording
`renter_accepted_at`. This holds regardless of which client calls
`acceptQuotation` — the frontend no longer needs to sequence
`acceptOffer` + `acceptQuotation` itself. Frontend also fixed
independently (belt-and-suspenders): the "Your decision" panel now reads
the actual pending offer's rate when one exists from the counterparty,
and shows a "waiting for a response" state instead of an Accept button
when the only pending offer is the Renter's own. Test:
`apps/api/test/commercial-quotation-service.test.ts` — "acceptQuotation
applies a still-pending counter-offer from the Rental Company before
recording acceptance".

### Validation location

Service layer (`CommercialQuotationService.acceptQuotation`) — the real
fix; the frontend display fix is defense in depth, not the enforcement
point.

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
