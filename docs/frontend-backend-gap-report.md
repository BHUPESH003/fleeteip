# Frontend ↔ Backend Gap Report

Living document, updated as each frontend-revamp phase (see `feat/frontend-revamp`)
touches a screen. Every entry records a UI requirement from the approved design
that the current backend does not yet fully support, so the gap is explicit
instead of silently faked in the frontend.

Format per entry: Screen, UI requirement, Current backend support, Existing
source, Missing capability, Required backend work, Priority, Reason.

**Status**: Phases 1–10 of `feat/frontend-revamp` are complete (see
`docs/frontend-revamp-summary.md`). Phases 8–9 (Billing, Responsive/a11y
polish) didn't surface a new entry. The `feat/backend-mvp-gaps` pass then
closed most of the entries below — each resolved entry now carries a
**Resolved** block recording the endpoint/service, migration, permission,
and tests added. See that branch's own summary in this document's final
section for the full list of what shipped and what remains intentionally
deferred. This document remains open for any future phase or
backend-hardening pass to add to.

---

## Phase 1 — Design system + application shell

### Screen

Global header (all pages)

### UI requirement

A top search box that finds machines/requirements/quotations/rentals across
the organization ("Search machines, rentals, quotations…").

### Current backend support

None

### Existing source

n/a — no cross-resource search endpoint exists; each domain has its own
`list*`/`discover*` endpoint scoped to one resource type.

### Missing capability

A cross-resource search endpoint (or a set of per-resource search params on
the existing list endpoints) that the frontend can query as the user types.

### Required backend work

Add a `GET /search?q=` endpoint (or extend `apiClient.list*` calls with a
`q` param) that searches across machines (asset code/registration),
requirements (project name), quotations (ref/party), and rentals
(customer/machine), scoped to `organization_id` server-side like every other
endpoint.

### Priority

Medium

### Reason

The approved design treats global search as a primary navigation aid for daily
use ("speed of daily use"). Rendered as a disabled input with a "coming soon"
tooltip in Phase 1 rather than faked, so it is visibly not yet wired up.

### Resolved (feat/backend-mvp-gaps)

`GET /organizations/:organizationId/search?q=` — new `SearchService`
(`apps/api/src/modules/search/application/search-service.ts`), fanning out
to a new `search()`/`searchBy*()` method on each of
`MachineRepository`/`RequirementRepository`/`CommercialQuotationRepository`/
`RentalRepository` (plain PostgreSQL `ILIKE`, no new search index/table).
Each resource is gated by the exact permission its own domain already
uses (`equipment.manage`, `rfq.manage`, `quotation.manage`/`.respond`,
`rental.manage`/`.respond`) — no new permission added. New contract:
`@fleetip/contracts/search` (`SearchResult`, `searchQuerySchema`). Tests:
`apps/api/test/search-service.test.ts` (5 cases — per-org-type resource
visibility, cross-tenant isolation, unknown org).

---

### Screen

Sidebar navigation (Rental Company)

### UI requirement

Nav entries for Catalogue, Transport, Logsheets, Maintenance as their own
pages (per the approved design's Fleet/Operations groups).

### Current backend support

Partial

### Existing source

`packages/contracts` and the API already have `equipment` (catalogue),
`maintenance`, `transport`, and `logsheet` domains and permissions
(`equipment.manage`, `maintenance.manage`, `transport.manage`,
`logsheet.manage`) — maintenance/logsheets/transport currently only surface
as inline panels on Machine detail / Rental detail, not as standalone list
pages, and there is no catalogue (product category/model) admin screen.

### Missing capability

Standalone Catalogue, Transport, Logsheets and Maintenance list/detail pages
in the frontend — not a backend gap (the API/contracts already exist), but
recorded here since the nav intentionally shows these dimmed with a "Soon"
tag rather than omitting them.

### Required backend work

None identified yet — likely just aggregation/list endpoints convenient for
a standalone page (e.g. "all maintenance records across the fleet" rather
than per-machine) if today's endpoints are only scoped per-machine/per-rental.
Revisit when these pages are actually built (a later phase).

### Priority

Low

### Reason

Tracked so "Soon" nav entries don't quietly rot into "later means never."

### Resolved (feat/backend-mvp-gaps) — partial: backend aggregation only

Added the org-wide standalone-screen aggregation each domain was missing —
`GET /organizations/:organizationId/transport-records`,
`GET /organizations/:organizationId/logsheets`,
`GET /organizations/:organizationId/maintenance-records` — each one new
`listByRentalCompanyOrganization`/`listByOrganization` repository method
(a single SQL join, not a loop over the existing per-rental/per-machine
list), gated by the existing `transport.manage`/`logsheet.manage`/
`maintenance.manage` permissions. Catalogue's standalone screen needed no
new read endpoint (`listCategories`/`listSubcategories`/`listProducts`
were already org-agnostic global reads) but did gain write capability — see
the new Catalogue administration entry below. Building the actual frontend
pages for these four standalone screens remains separate, later frontend
work — this entry only tracked the backend gap, which is now closed.

---

## Phase 2 — Dashboards

### Screen

Renter dashboard

### UI requirement

An "Auctions" KPI tile (open/closed-awaiting-selection count) and a
"closed — select a participant" attention row, org-wide.

### Current backend support

None

### Existing source

`apiClient.listAuctionsForRequirement`/`getActiveAuctionForRequirement` are
per-requirement only — there is no org-scoped auction list. Computing this
honestly would mean looping `getActiveAuctionForRequirement` over every one
of the Renter's requirements (N+1), which doesn't scale and isn't a real
"existing implementation" to build on.

### Missing capability

`GET /organizations/:id/auctions` — every auction the calling org owns
(Renter, via `auction.manage`) or participates in (Rental Company, via
`auction.participate`), with enough fields to show status and a
"needs a decision" flag (e.g. `status: 'closed'` with no participant
selected yet).

### Required backend work

Add the org-scoped list endpoint/service method, mirroring the shape of
`listRentals`'s org-type branch (`rental.manage` vs `rental.respond`) but
for `auction.manage`/`auction.participate`.

### Priority

Medium

### Reason

Without it, Phase 2 omits the Auctions KPI and attention row entirely on
the Renter dashboard rather than faking a count or N+1-looping — the
approved design wants "auction closed, awaiting your selection" to be one
of the most prominent "waiting on you" items, so this is worth building.

### Resolved (feat/backend-mvp-gaps)

`GET /organizations/:organizationId/auctions` —
`AuctionService.listAuctionsForOrganization`, branching on caller org type
exactly like `RentalService.listRentals`
(`auction.manage` → every auction owned; `auction.participate` → every
auction joined). New `AuctionSummary` contract
(`requirementProjectName`/`participantCount`/`ownParticipantStatus`/
`needsAttention`). New repository methods `listByOwnerOrganization`/
`listByParticipantOrganization`, each a single joined+aggregated SQL query
(no N+1). No new permission — reuses `auction.manage`/`.participate`.
Tests: `apps/api/test/auction-service.test.ts`
(`listAuctionsForOrganization` describe block, 3 cases).

---

## Phase 3 — Machines

### Screen

Machine detail

### UI requirement

An "Edit" action on a machine (correct a mistyped registration number,
chassis number, or year of manufacture after registration).

### Current backend support

None

### Existing source

`apps/api/src/modules/equipment/presentation/routes.ts` only has `POST
.../machines` (create) and `PATCH .../machines/:id/status` (status only).

### Missing capability

`PATCH .../machines/:id` (or similar) to update assetCode/registration
number/chassis number/year of manufacture post-creation.

### Required backend work

Add an update endpoint + service method, with the same organization-scoped
authorization as `updateMachineStatus`.

### Priority

Medium

### Reason

Data entry mistakes are inevitable; today the only fix is deleting and
re-registering, which isn't possible either (no delete endpoint). Rendered
as a disabled "Edit" button with a tooltip rather than faked.

### Resolved (feat/backend-mvp-gaps)

`PATCH /organizations/:organizationId/machines/:machineId` —
`EquipmentService.updateMachine`, gated by the existing `equipment.manage`
permission. New contract `updateMachineRequestSchema`
(assetCode/chassisNumber/registrationNumber/yearOfManufacture, at least one
field required) — `organizationId`/`productId` deliberately not editable
through this endpoint. `MachineRepositoryPort.assetCodeExists` gained an
`excludeMachineId` param so a machine keeps its own asset code without
tripping its own uniqueness check. Tests: `apps/api/test/equipment-service.test.ts`
(4 new cases — update fields, duplicate asset code, self-reuse, cross-org
NotFoundError).

---

### Screen

Machines list

### UI requirement

"Saved views" — named, reusable filter presets (e.g. "Idle over 14 days",
"Boom pumps").

### Current backend support

None

### Existing source

No persistence mechanism for per-user or per-org named filter presets
exists anywhere in the API.

### Missing capability

A small `saved_views`-style store (owner, name, filter payload) plus
list/create/delete endpoints.

### Required backend work

New table + CRUD endpoints, likely generalizable across list pages
(machines, rentals, quotations) rather than machine-specific.

### Priority

Low

### Reason

A nice-to-have from the approved design, not core to managing the fleet.
Omitted this phase rather than faked with client-only (non-persisted,
per-tab) state.

---

### Screen

Machine detail — Activity tab

### UI requirement

A per-machine event/audit feed (status changes, rentals created, maintenance
scheduled, etc.).

### Current backend support

None

### Existing source

Unlike the dashboard's "Recent activity" (legitimately backed by the real
`notifications` table), there is no per-machine audit log. Notifications are
scoped to quotation/auction/requirement business events, not machine state
changes.

### Missing capability

A machine (or general entity) event log — either a dedicated audit table or
a derived view over existing timestamped records (maintenance, rentals,
status changes).

### Required backend work

New audit/event table written by the relevant services on each mutation, or
a service-side aggregation across existing tables' `createdAt`/`updatedAt`.

### Priority

Low

### Reason

The tab is kept (matches the approved design's tab set) but its content is
an honest "not available yet" note rather than fabricated events.

---

## Phase 4 — Marketplace / Requirements

### Screen

Requirement detail (Renter)

### UI requirement

An "Edit" action on a posted requirement (correct project name, dates,
quantity, etc. after posting).

### Current backend support

None

### Existing source

`packages/contracts/src/rfq/index.ts` only exposes `createRequirement` and
`updateRequirementStatus` (status transition only, `closed`/`cancelled`).

### Missing capability

`PATCH .../requirements/:id` (or similar) to update the requirement's own
fields while still `open`.

### Required backend work

Add an update endpoint + service method, renter-scoped like
`updateRequirementStatus`, presumably restricted to `status === 'open'`.

### Priority

Medium

### Reason

Same class of gap as Machines' missing edit endpoint — data entry mistakes
are inevitable and today the only recourse is closing and re-posting.
Rendered as a disabled "Edit" button with a tooltip rather than faked.

### Resolved (feat/backend-mvp-gaps)

`PATCH /organizations/:organizationId/requirements/:requirementId` —
`RequirementService.updateRequirement`, gated by the existing `rfq.manage`
permission and restricted to `status === "open"`. New contract
`updateRequirementRequestSchema` (capacity/capacityUnit/quantity/
projectName/projectLocation/requestedStartDate/expectedDurationValue/
expectedDurationUnit/shiftRequirement/validityDate/notes) —
`productSubcategoryId`/`status` deliberately excluded. New repository
method `updateFields`. Tests: `apps/api/test/requirement-service.test.ts`
(3 new cases — edit while open, reject once closed, cross-org
NotFoundError). See `docs/backend-hardening-report.md` for a related
observation: editing is not yet blocked once a QuotationResponse/Auction
already exists against the Requirement.

---

### Screen

Open market (Rental Company) / Requirement detail (Renter)

### UI requirement

"N rental companies notified" and "N companies have not responded yet —
[names]" (which specific companies were asked and haven't replied).

### Current backend support

None — not a gap so much as a documented design constraint

### Existing source

`apps/api/src/modules/marketplace/quotation-response/application/
notification-service.ts`'s own comments: Requirement creation is a
broadcast to the whole discovery marketplace, "no single well-defined
recipient" — there is no per-requirement notify-list to persist, so there
is nothing to query for "who was asked but hasn't answered."

### Missing capability

A notify-list would require either a subscription/matching feature (rental
companies opt into categories) or logging every discovery-page view as an
implicit "notified" event — both are real feature decisions, not small gaps.

### Required backend work

Out of scope for a gap fix — this is a product decision (would FleetIP
want targeted broadcast + subscriptions?), not an oversight.

### Priority

Low

### Reason

Recorded so a future session doesn't reintroduce the mock's "notified"
framing without first deciding whether targeted broadcast is in scope.

---

## Phase 5 — Quotations / Negotiation

### Screen

Quotation detail

### UI requirement

"Download PDF" and "Share" on a commercial quotation — a formal document
should be exportable/shareable outside the app.

### Current backend support

None

### Existing source

No PDF generation, document template, or share-link/token endpoint exists
anywhere in `apps/api`.

### Missing capability

A PDF rendering service (quotation → formatted commercial document) and,
for sharing, a signed/expiring link endpoint that doesn't require the
recipient to have a FleetIP login (useful for the external-client path,
which already has no user account).

### Required backend work

New endpoint(s): `GET .../quotations/:id/pdf` (or a queued
generate-and-store job) and a share-token mechanism if external sharing
is wanted.

### Priority

Medium

### Reason

A "formal commercial document" (per the product brief's own framing of
this entity) is expected to leave the app as a real document. Rendered as
disabled buttons with a tooltip rather than faked with a client-side PDF
of unclear legal/audit standing.

---

### Screen

Quotation detail (Renter)

### UI requirement

A Renter viewing their own quotation should see the machine's identity
(asset code, product) — the approved design shows it prominently in the
summary strip.

### Current backend support

Partial

### Existing source

`CommercialQuotation` only carries `machineId` (a UUID). Resolving it to
an asset code/product needs `equipment.manage`, which is Rental-Company-
only — a Renter has no permission to call `listMachines`/`listProducts`
even for a machine referenced by their own quotation.

### Missing capability

`CommercialQuotation` has no server-resolved machine snapshot fields for
the Renter side, unlike `Rental` (which already gained
`machineAssetCode`/`rentalCompanyOrganizationName`, resolved server-side,
specifically for this "renter can't look up the other org's data
themselves" shape — see the Phase 1 recorded decision on
`rental.respond`).

### Required backend work

Add `machineAssetCode` (and optionally product name/capacity) to
`CommercialQuotation`, populated server-side only when the caller is the
Renter — same pattern already established for Rental.

### Priority

Medium

### Reason

Discovered live while building this phase: a Renter's quotation detail
page currently shows "—" for machine identity rather than fabricate it by
calling an endpoint the Renter has no permission for.

### Resolved (feat/backend-mvp-gaps)

`CommercialQuotation` gained `machineAssetCode`/`productName`, resolved
server-side only when the caller is the quotation's Renter party (null for
the Rental Company) — same pattern as `Rental.machineAssetCode`/
`rentalCompanyOrganizationName`. `CommercialQuotationService` now also
depends on `ProductRepositoryPort`. No new permission — reuses
`quotation.respond`. Tests: `apps/api/test/commercial-quotation-service.test.ts`
(2 new cases — Renter sees resolved fields on both `getQuotation` and
`listQuotationsForRenter`, Rental Company sees null on the same record).

---

## Phase 7 — Rentals / Operations

### Screen

Rental detail — Transport / Logsheets & utilization tabs

### UI requirement

A Renter viewing their own rental should at least be able to see delivery
status (mobilization/demobilization) and equipment utilization (operating
hours, idle hours) for equipment they are paying for — read-only.

### Current backend support

None

### Existing source

`apps/api/src/modules/.../transport-service.ts` and the logsheet/utilization
service both gate `listByRental`/`list`/`get` on `transport.manage` /
`logsheet.manage` (Rental-Company-only, confirmed by reading the actual
`requirePermission` calls, not assumed) — this is a read-gate, not just a
write-gate, unlike every other Rental-Company/Renter split in this codebase
(`rental.manage`/`rental.respond`, `quotation.manage`/`quotation.respond`,
`billing.manage`/`billing.respond`), which all give the Renter a read-only
`.respond` permission.

### Missing capability

`transport.respond` and `logsheet.respond` (read-only) permissions, plus
service methods that branch on caller org type the same way
`RentalService.listRentals` already does for `rental.respond`.

### Required backend work

New permission codes + a migration to seed them to the renter role, and a
Renter-scoped branch in `TransportService`/`LogsheetService` (list by rental,
scoped to rentals the Renter is actually the counterparty on).

### Priority

Medium

### Reason

Discovered live while building this phase: the Transport and Logsheets &
utilization tabs are rendered disabled (with a tooltip explaining why) for a
Renter rather than silently omitted or faked with placeholder data — this is
the one place the established manage/respond pattern wasn't extended.

### Resolved (feat/backend-mvp-gaps)

New `transport.respond`/`logsheet.respond` permissions (Renter, read-only),
seeded via migration `0019_seed_transport_and_logsheet_respond_permissions.ts`
— exactly the `rental.respond`/`billing.respond` pattern.
`TransportService.listByRental`/`LogsheetService.listByRental`/
`UtilizationService.getRentalUtilization` now branch on caller org type,
same shape as `RentalService.listRentals` — a Renter gets read-only access
to their own rental's transport/logsheet/utilization records over the
exact same routes (no new endpoints for the per-rental case).
`UtilizationService.getMachineUtilization` deliberately NOT extended to
Renters (it would leak fleet-wide activity across other customers' rental
periods). create/update on Transport and Logsheet remain Rental-Company-
only. Tests: `apps/api/test/transport-service.test.ts`,
`logsheet-service.test.ts`, `utilization-service.test.ts` (2 new cases
each — Renter reads own rental, Renter denied on a rental they aren't
party to).

---

## feat/backend-mvp-gaps — full pass summary

Beyond the entries above (each already carrying its own **Resolved**
block), this pass also added backend capability the frontend gap report
had not yet surfaced an entry for — investigated directly against the
task's own ground-truth requirements:

- **Organization administration** — new `OrganizationService` +
  `apps/api/src/modules/organizations/presentation/routes.ts` (this module
  previously had no application/presentation layer at all): own-org profile
  read, member list, invite-an-existing-user, role/permission listing.
  Reuses the existing `organization.manage`/`membership.manage` permissions
  (seeded since migration `0002`, never enforced by any route until now).
  No org-profile _update_ endpoint yet — no UI requirement or new column is
  known to need one; deferred, not an oversight.
- **Catalogue administration** — new create/update endpoints for
  ProductCategory/ProductSubcategory/Product, gated by a new
  `catalogue.manage` permission. See
  `docs/backend-hardening-report.md` for the documented scoping limitation
  (per-Rental-Company, not truly platform-scoped — no platform-admin tier
  exists yet) and `docs/platform-admin-architecture-requirements.md` for
  what a real fix requires. No delete endpoints (existing `ON DELETE
RESTRICT` foreign keys already prevent deleting a referenced record).
- **Platform administration** — deliberately NOT implemented. Documented in
  `docs/platform-admin-architecture-requirements.md` per the task's own
  "document, don't build" instruction.

### Deferred, unchanged from before this pass

- Saved views (Machines list) — no UI requirement confirmed yet, low
  priority, not attempted.
- Machine detail Activity/audit-log tab — no UI requirement confirmed yet,
  low priority, not attempted.
- "N companies notified" on Requirement/Open market — an explicit product
  decision (targeted broadcast + subscriptions), not a backend gap; not
  attempted.
- Quotation PDF export / share link — not in this pass's scope (section 3
  of the task brief did not list it); not attempted.
- Organization profile _update_ (name/contact/address) — no columns exist
  for contact/address and none were added (no confirmed UI requirement);
  read-only profile view was added instead.

## Template for new entries

```
### Screen


### UI requirement


### Current backend support
None / Partial / Supported

### Existing source


### Missing capability


### Required backend work


### Priority
Critical / High / Medium / Low

### Reason

```
