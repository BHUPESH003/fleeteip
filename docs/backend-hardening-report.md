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
permissiveness. Phases 11–16 (see below) added two more. This document
remains open for any future phase or backend-hardening pass to add to.

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

## Template for new entries

```
### Current behavior


### Expected business rule


### Why it matters


### Affected domain


### Recommended backend enforcement


### Validation location

```
