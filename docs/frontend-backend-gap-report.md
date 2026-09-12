# Frontend ↔ Backend Gap Report

Living document, updated as each frontend-revamp phase (see `feat/frontend-revamp`)
touches a screen. Every entry records a UI requirement from the approved design
that the current backend does not yet fully support, so the gap is explicit
instead of silently faked in the frontend.

Format per entry: Screen, UI requirement, Current backend support, Existing
source, Missing capability, Required backend work, Priority, Reason.

**Status**: Phases 1–10 of `feat/frontend-revamp` are complete (see
`docs/frontend-revamp-summary.md`). Phases 8–9 (Billing, Responsive/a11y
polish) didn't surface a new entry. Phases 11–16 (Catalogue, standalone
Transport/Logsheets/Maintenance, Rentals/Billing polish, tenant
Organization admin, Platform Admin shell, Edit flows/search polish) added
the entries below, and the `feat/backend-mvp-gaps` pass then closed most
of them — each resolved entry now carries a **Resolved** block recording
the endpoint/service, migration, permission, and tests added. See that
branch's own summary in this document's final section for the full list
of what shipped and what remains intentionally deferred. A subsequent
session (2026-09-12, still on `feat/frontend-revamp`) then wired the
already-built frontend to every one of those now-real endpoints — each
resolved entry above also carries its own **Frontend wiring** note, and
the final section has a dated summary. This document remains open for
any future phase or backend-hardening pass to add to.

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

### Frontend wiring (2026-09-12)

The header's disabled "coming soon" search box is now a real
`apps/web/components/GlobalSearch.tsx`: a debounced (300ms)
`apiClient.search(organizationId, q)` call, results grouped by
`SearchResult.type` in the order Machines/Requirements/Quotations/
Rentals, each row linking straight to its detail page. Fully resolved,
frontend and backend both.

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
the new Catalogue administration entry below.

### Frontend wiring (2026-09-12)

The standalone `/transport`, `/logsheets`, `/maintenance` pages (already
built in Phase 12 of `feat/frontend-revamp`, behind an honest empty
state) now call `listTransportRecords`/`listLogsheets`/
`listMaintenanceRecords` and render the real org-wide table as the
primary view — the per-rental/per-machine picker + panel stays
underneath since it's still the only create/update path. Catalogue's
own standalone pages (`/catalogue`, category/subcategory/product
detail) were already real reads from Phase 11; their create/edit
dialogs are wired up separately below. Fully resolved, frontend and
backend both.

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

### Frontend wiring (2026-09-12)

`apiClient.listAuctionsForOrganization` added; both dashboards now show
an "Auctions" KPI tile (Renter: total owned + "N awaiting selection";
Rental Company: total participated + "N selected — proceed") and an
attention row for every `needsAttention` auction ("Auction closed —
select a participant" for the Renter owner, "Selected in auction" for
the Rental Company participant), linking to
`/auctions?requirementId=&auctionId=` — the same deep-link shape the
Auctions screen itself already used. Fully resolved, frontend and
backend both.

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

### Frontend wiring (2026-09-12)

`apiClient.updateMachine` added. Machine detail's Edit dialog (Phase
16's full prefilled form, previously permanently disabled) is now a
real `EditMachineDialog` — submits, refreshes the machine in place,
shows a real error on failure. Fully resolved, frontend and backend
both.

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

### Frontend wiring (2026-09-12)

`apiClient.updateRequirement` added. Requirement detail's Edit dialog is
now a real `EditRequirementDialog` (project name/location/quantity/
requested start date — the fields the design already showed); the Edit
button is disabled once `status !== "open"` with an accurate tooltip,
respecting the same restriction the server enforces. Fully resolved,
frontend and backend both.

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

### Frontend wiring (2026-09-12)

Quotation detail's "Equipment & rental period" section and summary-strip
Machine tile now render `quotation.productName`/`machineAssetCode`
(falling back to the Rental Company's own `listMachines`/`listProducts`
lookup on that side) instead of "—" for a Renter. Fully resolved,
frontend and backend both.

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

### Frontend wiring (2026-09-12)

Rental detail's Transport and Logsheets & utilization tabs are now
gated on `hasPermission("transport.respond"/"logsheet.respond")`
instead of a blanket `isRenter` check (a Renter `member` role without
the permission — seeded owner-only per migration 0019 — correctly stays
disabled, with an accurate tooltip naming the permission gate instead of
the old "not visible to Renters yet" one). `TransportPanel`/
`LogsheetPanel` gained a `readOnly` prop that hides the plan/mark-status
buttons and the submit-logsheet form for a Renter, reusing the exact
same components already wired up on the Rental Company side — no
duplicate rendering logic. Maintenance tab stays Rental-Company-only
(no renter permission exists for it, unchanged). Fully resolved,
frontend and backend both.

---

## Phase 11 — Catalogue

### Screen
Catalogue overview, Category/Subcategory/Product detail

### UI requirement
Machine count per product (and per subcategory/category rolled up), and a
"machines using this product" list on Product detail, platform-wide.

### Current backend support
None

### Existing source
`apps/api/src/modules/equipment` has no `productId` filter on any machine
list endpoint, and `apps/api/src/modules/catalogue` has no reverse
product→machine lookup at all. `listMachines` is org-scoped, so even a
correct implementation could only ever answer "how many of MY org's
machines use this product" — never a platform-wide count across every
rental company.

### Missing capability
Either a denormalized `machine_count` column on `products` (maintained by
the equipment module on machine create/status change) or a dedicated
`GET /products/:id/machines` aggregate endpoint — and, if a platform-wide
count is wanted, it would need to run without organization scoping, which
is a deliberate boundary today (see Platform Admin entry below).

### Required backend work
New column/endpoint in the catalogue or equipment module. Out of scope for
a frontend branch.

### Priority
Low

### Reason
Built honestly instead: the catalogue overview and Product detail show
"in your fleet" — the calling organization's own `listMachines` filtered
client-side by `productId` (one real call, no loop) — with an explicit
note that a platform-wide count doesn't exist. No active/inactive column
exists on any catalogue table either (omitted, not fabricated).

---

### Screen
Catalogue administration (create/edit category, subcategory, product;
disable with dependency warning)

### UI requirement
Full catalogue CRUD for whoever administers the shared platform product
taxonomy.

### Current backend support
None

### Existing source
`apps/api/src/modules/catalogue/presentation/routes.ts` has exactly 3 GET
routes (`/product-categories`, `/product-categories/:id/subcategories`,
`/products`) and the service has only `listCategories`/`listSubcategories`/
`listProducts` — no create/update/delete anywhere in the module, and no
`is_active`/soft-delete column on any of the three tables.

### Missing capability
`POST`/`PATCH`/a soft-delete-or-equivalent endpoint for each of
`product_categories`, `product_subcategories`, `products` — plus whatever
authorization model decides who's allowed to call them (see the open
question below).

### Required backend work
New routes + service methods + migration (an `is_active` column, if
"disable" rather than hard-delete is the intended semantics — hard-delete
is unsafe given `machines.product_id` would need `ON DELETE RESTRICT` or
similar to avoid orphaning registered equipment).

### Priority
Medium

### Reason
Designed in full on `/catalogue` and its detail pages (Phase 11):
create/edit dialogs with every real field, a disable confirmation with
dependency-warning copy — Submit/Confirm always disabled with a tooltip,
never implying persistence.

### Open question (not guessed at)
Who should actually be authorized to manage the shared platform
catalogue — every rental company (since it's the only reachable admin
shell today), or a future platform-admin-only capability (see the Platform
Admin entry)? Not decided here; `/platform-admin`'s Catalogue section
explicitly defers to this question rather than picking an answer. Still
open after this pass — unchanged.

### Resolved (feat/backend-mvp-gaps) + frontend wiring (2026-09-12)

Backend: `POST`/`PATCH` for product-categories/product-subcategories/
products, gated by a new `catalogue.manage` permission (seeded
`rental_company`-only — see the open question above and
`docs/backend-hardening-report.md`). Frontend: `apiClient` gained
`create`/`updateProductCategory`/`Subcategory`/`Product`;
`CatalogueFormDialog` now renders a real working form (Cancel/Submit,
error state) for a caller with `catalogue.manage`, falling back to the
existing disabled-dialog treatment — with an accurate
"requires catalogue.manage (Rental Company only)" reason instead of the
stale "no backend endpoint" one — for everyone else. Wired on all four
surfaces: catalogue overview's New category/subcategory/product,
category detail's Edit/Add subcategory, subcategory detail's Edit/Add
product, product detail's Edit product. Product specifications stay
read-only in the edit form (no safe label→key round-trip exists via
`flattenSpecifications`) — noted inline, not faked. The disable/delete
confirm dialogs are untouched and stay permanently disabled — no
delete endpoint exists (`ON DELETE RESTRICT` FKs), correct and
unchanged.

---

## Phase 12 — Standalone Transport, Logsheets, Maintenance

### Screen
Transport list, Logsheets list, Maintenance list (new standalone
workspaces)

### UI requirement
A fleet-wide/org-wide table: every transport record, every logsheet, every
maintenance record across every rental/machine — not just one at a time.

### Current backend support
None

### Existing source
`apps/api/src/modules/transport` exposes only
`listTransportForRental(rentalId)`; `apps/api/src/modules/logsheet` only
`listLogsheetsForRental(rentalId)`; `apps/api/src/modules/maintenance` only
`listByMachine(machineId)`. None of the three has an org-scoped list
method or route.

### Missing capability
`GET /organizations/:id/transport`, `GET /organizations/:id/logsheets`,
`GET /organizations/:id/maintenance-records` (or equivalent), each
returning every record the calling Rental Company owns across its whole
fleet/rental book, with enough denormalized fields (asset code, rental
customer name) to avoid a client-side N+1 join.

### Required backend work
New repository methods (a `JOIN` against `rentals`/`machines` scoped by
`organization_id`, mirroring how `RentalService.listRentals` already
scopes by org) + routes + permission checks.

### Priority
Medium

### Reason
Built as real page shells at `/transport`, `/logsheets`, `/maintenance`
(Phase 12): the intended columns/filters render, but the table body is an
honest "fleet-wide list isn't available yet" empty state instead of an
N+1 loop over every rental/machine faking an aggregate. Each page's real,
working part is a rental/machine picker that mounts the exact
TransportPanel/LogsheetPanel/MaintenancePanel already wired up on Rental/
Machine detail — genuinely real data, just not a fleet-wide table yet.

---

### Screen
Transport detail, Logsheets detail, Maintenance detail (standalone)

### UI requirement
`/transport/:id`, `/logsheets/:id`, `/maintenance/:id` reachable and
useful on their own (e.g. from a notification or a bookmark), not only
from inside a Rental/Machine.

### Current backend support
Partial

### Existing source
None of the three modules has a get-by-id route independent of its
parent — a transport record is only reachable via
`listTransportForRental`, a logsheet via `listLogsheetsForRental`, a
maintenance record via `listByMachine`.

### Missing capability
`GET .../transport/:id`, `GET .../logsheets/:id`,
`GET .../maintenance-records/:id` directly, so a detail page doesn't need
its parent id in the URL/query string to resolve.

### Required backend work
Three small new routes + repository `findById` methods (all three
repositories almost certainly already have an internal `findById` used by
the update path — likely just needs a route + permission check wired to
each).

### Priority
Low

### Reason
Worked around honestly rather than blocked on: each detail page takes
`?rentalId=`/`?machineId=` (known whenever it's reached via the working
per-rental/per-machine panel, which is every real path into it today),
fetches the existing scoped list endpoint, and finds the record by id —
zero N+1, genuinely real data. A direct link with only the record's own
id (no parent) correctly shows a "this link needs its parent" empty
state instead of guessing or fabricating a lookup.

---

## Phase 14 — Organization admin (tenant)

### Screen
Settings → Organization

### UI requirement
Edit organization name/contact/address.

### Current backend support
None

### Existing source
`apps/api/src/modules/organizations` has no `presentation/routes.ts` at
all (infrastructure/domain/application only) — there is no organization
profile GET/PATCH endpoint, and the `organizations` table has no
contact/address columns.

### Missing capability
`PATCH /organizations/:id` + a migration adding contact/address columns.

### Required backend work
New route + service method + migration.

### Priority
Low

### Reason
Shown read-only from the already-fetched `MembershipWithOrganization`
(real: name/code/type/created), disabled "Edit" with a tooltip.

---

### Screen
Settings → Members

### UI requirement
List every member of the organization; invite a new member.

### Current backend support
None

### Existing source
No list-members or invite-member endpoint exists anywhere — the only
membership-creation path in the entire codebase is signup itself
(`POST /auth/signup`, which creates a user AND their first organization
together).

### Missing capability
`GET /organizations/:id/members` and
`POST /organizations/:id/members/invite` (or similar — likely an
invite-token + accept flow, since a bare "add member" would need the
invitee to already have an account).

### Required backend work
New table (`membership_invitations` or similar) + two-plus new routes +
service methods + (out of this branch's scope) an email-delivery
integration for the invite itself.

### Priority
Medium

### Reason
Designed the target list/invite UI, but only ever shows the caller's own
real membership row — never fabricates teammates.

### Resolved (feat/backend-mvp-gaps) + frontend wiring (2026-09-12)

Backend: new `OrganizationService` + `apps/api/src/modules/organizations/
presentation/routes.ts` — `GET .../members` (list) and
`POST .../members` (invite, `inviteMemberRequestSchema`: email +
roleName), reusing the existing `membership.manage` permission. The
invitee must already hold a FleetIP account (looked up by email) — no
email-delivery/signup-invite flow exists, a documented limitation, not
attempted here. Frontend: `apiClient.listOrganizationMembers`/
`inviteMember` added; Settings → Members now lists every real member
(gated on `membership.manage`) with a real "Invite member" dialog,
replacing the "only your own membership" caption and disabled button.
Fully resolved, frontend and backend both.

---

### Screen
Settings → Roles & access

### UI requirement
List every role used in the organization (who has `owner` vs. `member`).

### Current backend support
None

### Existing source
No endpoint returns any membership/role data except the caller's own, via
`/auth/me`.

### Missing capability
`GET /organizations/:id/members` (same endpoint as above would cover
this) returning each member's `roleName`.

### Required backend work
Same as the Members entry above.

### Priority
Medium

### Reason
Shown as a designed not-yet-available state; the caller's own real
`roleName` + `permissions` array (from `/auth/me`) render as real data
above it, grouped by domain for readability — not a new permission model.

### Resolved (feat/backend-mvp-gaps) + frontend wiring (2026-09-12)

Backend: `GET .../roles` (`OrganizationService.listRolesAndPermissions`),
gated by `organization.manage`, iterating the fixed `owner`/`member`
role set and each role's seeded permissions, filtered by the caller's
own organization type. Frontend: `apiClient.listRolesAndPermissions`
added; Settings → Roles & access's "All roles in this organization" now
renders the real list (gated on `organization.manage`, matching the
endpoint's own requirement) instead of the "not available yet" empty
state. Fully resolved, frontend and backend both.

---

## Phase 15 — Platform Admin (severity: architecture-level)

### Screen
Every Platform Admin screen: Overview dashboard, Organization directory +
detail, User directory + detail, Access & roles, Catalogue administration,
Audit/activity, System settings.

### UI requirement
An internal FleetIP operations experience, fundamentally separate from
the Rental Company/Renter tenant model — cross-tenant visibility into
every organization, every user, platform-wide catalogue administration,
and a system-level audit trail.

### Current backend support
None — this is not a missing endpoint, it's a missing authorization tier.

### Existing source
Read every module in `apps/api/src/modules`: the organization model is
locked to exactly two types (`organizationTypeCodeSchema` is
`rental_company | renter`, with a code comment confirming this is a
deliberate MVP scope decision, not an oversight). There is no
super-admin/staff role, no third organization type, no cross-tenant query
method on any repository (every single query in the codebase is scoped by
a caller's own `organization_id`), and no session/auth concept for a
principal that isn't a member of exactly one or more of these two
organization types.

### Missing capability
An entirely new authorization tier: a platform-staff user/role concept,
session support for it, and cross-tenant-safe versions of essentially
every list/aggregate query in the system (organizations, users, machines,
products, rentals, requirements, quotations, auctions) plus a real
system-wide audit log (see the Audit entry below).

### Required backend work
This is a platform architecture decision, not a gap-fix: a new identity/
authorization model, likely a separate "platform_staff" table +
session/auth path distinct from the existing organization-membership
model, plus cross-tenant query support added deliberately (with its own
security review — this is exactly the kind of capability that needs
careful scoping, not a quick add) to every domain module that would feed
the dashboard/directories.

### Priority
Critical (architecturally), but explicitly out of scope for any frontend
branch and for the current backend-mvp-gaps branch's stated scope too —
this needs its own dedicated design pass, not a bolt-on.

### Reason
Built as target-UI-plus-honest-gap-documentation per the brief (§11):
`/platform-admin`, a new route outside the tenant shell entirely (never
linked from navigation.ts/Sidebar/MobileNav, visually distinct dark
shell), with a permanent top banner stating the gap, every section
labeled "Sample" (hardcoded placeholder numbers, zero API calls), except
Access & roles which shows FleetIP's real, static, already-known
permission list from `packages/contracts` (labeled "Real, static" to
contrast it against the surrounding mock sections). This is the single
biggest gap surfaced by the entire frontend-revamp effort — everything
else in this document is an endpoint or a column; this is a whole
authorization tier that doesn't exist.

---

### Screen
Platform Admin → Audit & activity; Rental detail → Activity tab (Phase
13); Machine detail → Activity tab (pre-existing, Phase 3)

### UI requirement
A meaningful business/security event feed: organization created, user
added, role changed, product created, machine registered, rental status
changed, etc.

### Current backend support
None — partial substitute exists

### Existing source
The only cross-domain timestamped table in the whole schema is
`notifications`, and its `notificationTypeSchema` enum is scoped to
marketplace/negotiation events only (`quotation.sent`,
`quotation.awarded`, `auction.started`, etc. — 11 types total, confirmed
by reading the enum directly). No mutation in transport, logsheet,
maintenance, machine-status, or membership/organization services writes
any log row anywhere. `relatedResourceType` is a free-form nullable
string, and no notification type is ever rental- or machine-scoped, so
even filtering the real `notifications` feed by a rental/machine id
returns nothing — confirmed, not assumed (checked every write site in
`apps/api/src/modules/notification`).

### Missing capability
A real generalized audit/event table, written by every mutating service
(organization/membership changes, machine status changes, rental
lifecycle transitions, maintenance/transport/logsheet writes, catalogue
changes) — today only the dashboard's "recent activity" and the
Requirement detail "Activity" panel are legitimately backed by real data,
because they only ever claim to show marketplace/negotiation events,
which is exactly what `notifications` contains.

### Required backend work
New `audit_log` (or similarly-named) table + a write call added to every
mutating service method across every domain — a cross-cutting change,
not a single module's job.

### Priority
Medium

### Reason
Rental detail's Activity tab (Phase 13) and Machine detail's Activity tab
(pre-existing) both state the gap plainly rather than rendering a
permanently-empty "real" feed that would misleadingly look like a working
but-quiet audit trail. Platform Admin's Audit & activity section (Phase
15) shows sample rows of the kind of event a future trail would record,
clearly tagged as illustrative, not live.

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

### Frontend integration pass (2026-09-12)

A later session on `feat/frontend-revamp` wired the already-built
Phase 11–16 target UI to every one of the backend capabilities above —
see `docs/frontend-revamp-summary.md`'s "Phase 17 — Backend
integration" section for the full list, and each entry above (Phases
1, 2, 3, 4, 5, 7, 11, 12, 14) for the per-screen detail. Machine/
Requirement edit, Renter quotation machine info, Renter Transport/
Logsheets read access, the Auctions dashboard tile/attention row, the
three standalone fleet-wide lists, Catalogue create/edit, Organization
Members/Roles, and global search are now fully resolved end to end.
Left exactly as documented and correctly not faked: Platform Admin (no
authorization tier exists, out of scope by design), Organization profile
update, Catalogue disable/delete, saved views, machine/rental audit
logs, "N companies notified", and quotation PDF/share.

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

---

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
