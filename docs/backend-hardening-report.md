# Backend Hardening Report

Living document, updated as each frontend-revamp phase (see `feat/frontend-revamp`)
surfaces backend behavior that appears too permissive while wiring up real
screens against real data. These are observations only — nothing here is
fixed on the frontend branch; it is input for a later backend-hardening pass.

Format per entry: current behavior, expected business rule, why it matters,
affected domain, recommended enforcement, validation location.

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

## Template for new entries

```
### Current behavior


### Expected business rule


### Why it matters


### Affected domain


### Recommended backend enforcement


### Validation location

```
