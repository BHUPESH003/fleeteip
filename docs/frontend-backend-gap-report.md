# Frontend ↔ Backend Gap Report

Living document, updated as each frontend-revamp phase (see `feat/frontend-revamp`)
touches a screen. Every entry records a UI requirement from the approved design
that the current backend does not yet fully support, so the gap is explicit
instead of silently faked in the frontend.

Format per entry: Screen, UI requirement, Current backend support, Existing
source, Missing capability, Required backend work, Priority, Reason.

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
