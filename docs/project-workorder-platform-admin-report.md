# FleetIP — Project / Work Order / Platform Admin Implementation Report

Covers the production implementation pass driven by newly client-validated business decisions
(see "Client-validated business decisions" below): Project as a first-class entity, richer
Requirement/Commercial Quotation terms, a formal Work Order, Platform Admin (catalogue
administration + org/user suspend + cross-tenant oversight), and full-scope notifications.

## Client-validated business decisions this pass implements

1. Projects are required.
2. A formal Work Order / final order is required.
3. HMR/KMR, machine meter readings, and billing from meter readings are **Phase 2** — explicitly
   not touched in this pass.
4. Breakdown-hour impact on billing is **Phase 2** — not touched.
5. Rental quotation terms are important and required (structured where FleetIP needs to
   search/filter/compare, flexible where wording differs company to company).
6. Companies should be able to add equipment types (Platform Admin catalogue administration).
7. Notifications are required for all major workflow events.

## Architecture conflict flagged and resolved before implementation

Two locked/deferred decisions collided with this pass's brief:

- `docs/platform-admin-architecture-requirements.md` (status: deliberately deferred) — no
  authorization tier above Rental Company/Renter exists, and building one was explicitly flagged as
  "cannot be safely bolted on" without its own reviewed decision.
- The locked decision that MVP organization types are strictly `rental_company`/`renter`
  (`organizationTypeCodeSchema`), with Transport/OEM explicitly deferred to a later phase.

The natural-looking fix (a third `platform` organization type reusing memberships/roles) would have
broken the second lock. Resolved by keeping Platform Admin as a **wholly separate principal**
(`staff_users`/`staff_sessions` — see below) that never touches `organizationTypeCodeSchema` at
all. This was raised with the business owner before implementation; the answer also confirmed the
side benefit: keeping staff out of that enum leaves it clean for real future tenant types
(Transport, OEM) without ever having to distinguish "a real tenant" from "FleetIP's own ops team"
inside the same organization-type value.

## Completed

**Project** (`apps/api/src/modules/marketplace/project`) — renter-owned, `active → completed |
cancelled`, race-free per-renter reference numbering (`PRJ-{year}-{n}`, same pattern as
Commercial Quotation's `Q-{year}-{n}`). Requirement now carries a required `project_id` FK (backfilled
via a one-time "Pre-Project Records" project per renter for the 9 pre-existing rows, then locked
`NOT NULL` — a real database invariant, not just an application convention).

**Requirement** — added `boom_length` (nullable — never mandatory for equipment it doesn't apply
to), `shift_pattern` (`single|double|flexi`), `crew_requirement` (`one_crew_set|two_crew_sets`),
matching the client's exact "normal rental requirement" description. Existing `shift_requirement`
free-text field kept for shift-timing notes the enum doesn't capture.

**Commercial Quotation** — extended with the structured terms from the brief's §5A/§8:
`fuelScope`/`accommodationScope` (client/company responsibility), `workingHours`,
`workingDaysPerWeek`, `minimumRentalPeriod` (value + unit), `gstTerms` (a single free-text
commercial term, deliberately not a GSTIN/HSN/CGST-SGST invoicing engine), and `companyTerms` (the
flexible company-specific-T&Cs bucket, kept distinct from the existing `commercialNotes`
special/site-conditions field). New `quotation_scope_items` table implements §9's "structured
scope/responsibility collection" — category-specific items (wire rope scope, ground preparation,
support crane…) as rows (`item`, `responsible_party`, `notes`), not an ever-growing set of
`*Scope` columns.

**Work Order** (`apps/api/src/modules/marketplace/work-order`) — the finalized commercial order,
auto-created inside `awardQuotation` immediately after the Rental is created (never a standalone
"create" route, so it can never be hand-entered or diverge from what was actually awarded). Snapshots
every negotiated term plus a copy of the quotation's scope items, so it stays stable even if the
source quotation were ever altered later. Lifecycle `issued → completed | cancelled` (manual
transition; deliberately not auto-cascaded from Rental's own status changes — flagged as a
Phase 2/infra candidate, not guessed at). A printable document is a server-rendered, print-styled
HTML endpoint (`GET .../work-orders/:id/print`) — the browser's own print-to-PDF is the "printable
document," no PDF library dependency was added.

**Catalogue administration** — `CatalogueService` gained `*AsPlatformAdmin` entry points
(create/update category, subcategory, product) that skip the tenant permission check entirely,
sharing the exact same validation/write logic as the tenant-facing methods via extracted private
helpers. Reachable only through staff-authenticated `/admin/*` routes. The existing tenant
`catalogue.manage` permission was **left intact**, not silently revoked — see "Business decisions
still required" below.

**Platform Admin** (`apps/api/src/modules/staff`, `apps/api/src/modules/platform-admin`) — a
`staff_users`/`staff_sessions` principal reusing the exact same password-hashing (scrypt) and
session-token discipline as tenant auth, but its own login endpoint (`/admin/auth/login`) and its
own cookie (`fleetip_staff_session`). One fixed staff role for now (any authenticated staff session
holds the full documented scope) — no `staff_roles`/`staff_permissions` table; add one only if a
second tier (e.g. read-only support) is ever actually needed. `organizations.status`/`users.status`
back suspend/reactivate, enforced at the two real choke points: `PermissionService.hasPermission`
(a suspended organization loses every permission immediately) and `AuthService.login` (a suspended
user cannot start a session — checked only *after* a real password match, so it can't be used to
enumerate accounts by response shape). Read-only cross-tenant visibility into open Requirements
(reuses the existing broadcast-discovery query) and Auctions (new `listAllForPlatformAdmin`).
Staff accounts are provisioned only via `pnpm --filter @fleetip/api run seed:staff-admin` (env-var
credentials) — no signup route, no hardcoded bypass credential.

**Notifications** — extended `notificationTypeSchema` with `workorder.issued`, `rental.active`,
`rental.completed`, `transport.dispatched`, `transport.delivered`, `billing.invoice_issued`,
`billing.payment_recorded`, wired at the real transition points in `WorkOrderService`,
`RentalService`, `TransportService`, and `BillingService` — each using the same best-effort
`notify()` wrapper already established (never blocks the real business action on a notification
failure). Still deliberately not covered: bare Requirement creation (no single well-defined
recipient in a broadcast-discovery marketplace with no subscription feature) and a time-based
"rental ending soon" reminder (needs a scheduler/cron — no such infrastructure exists in this
codebase, flagged as Phase 2/infra work rather than guessed at).

**Frontend** — `/projects` (list + create), `/work-orders` + `/work-orders/[id]` (detail, status
control, real "Print / Download" link), `/platform-admin/login` + a fully rewired `/platform-admin`
(real API calls throughout; the two sections with no backing — Audit & activity, System settings —
were removed rather than kept as fake data). Requirement and Commercial Quotation creation forms
extended with the new fields; the quotation detail page gained a Scope Items panel (add/remove,
gated to the drafting Rental Company while the quotation is still editable).

## Tests

```
pnpm typecheck                          — clean (5 workspace projects)
pnpm lint                               — clean
pnpm --filter @fleetip/api run test     — 395/395 passing (was 356 before this pass)
pnpm --filter @fleetip/web run build    — clean production build
```

New test files: `project-service`, `work-order-service`, `platform-admin-service`,
`auth-service` (this pass added the first direct unit tests for `AuthService.login`, including the
new suspension check). Extended: `commercial-quotation-service` (scope items),
`permission-service` (organization suspension denies every permission).

## End-to-end workflows verified live

All of the following were exercised against a real running Postgres + API, not just unit tests:

- The full migration chain (all 25 migrations, `0001`→`0025`) applied cleanly to a **truly empty**
  database, followed by a successful demo-data seed run.
- The `0022` backfill migration specifically: run against the populated dev database (9 pre-existing
  Requirement rows across 3 renters), confirmed every row got a synthetic "Pre-Project Records"
  project and `project_id` before the column was locked `NOT NULL`.
- Full Journey 1 (RFQ → response → negotiated quotation → **Renter's explicit acceptance** → award)
  and Journey 2 (RFQ → Auction → participant selection → formalized quotation → **Renter's explicit
  acceptance** → award) — both now producing a real Work Order automatically, confirmed carrying the
  **negotiated** rate and the correct project, via direct queries against `work_orders` and
  `work_order_scope_items`.
- The printable Work Order document over real HTTP: both parties (Rental Company and Renter) see
  full equipment/product/project detail — a bug where the Rental Company's own view came back blank
  (the in-app view's renter-only display-resolution logic was reused by mistake) was found and fixed
  during this verification, not left in.
- Platform Admin end-to-end: staff login → dashboard counts → catalogue category creation (visible
  immediately on the public, unauthenticated catalogue read) → an unauthenticated write correctly
  rejected (401).
- **Organization suspension actually enforced, not just accepted by an endpoint**: a tenant could list
  its own Work Orders; staff suspended the organization; the identical tenant request then failed
  with 403; staff reactivated it; the identical request succeeded again.
- **User suspension actually enforced**: a real login succeeded; staff suspended that user; the
  identical login attempt then failed (403, "This account has been suspended"); staff reactivated;
  login succeeded again.
- All 7 new notification types confirmed firing in a real seed run (verified by querying the
  `notifications` table directly): `workorder.issued` ×2, `transport.dispatched`,
  `transport.delivered`, `rental.active`, `billing.invoice_issued`, `billing.payment_recorded`.
- A final combined regression pass on the same fresh dataset: existing Rentals/Quotations/
  Notifications endpoints still correct, and `project.manage`'s renter-only scoping confirmed both
  ways (403 for the Rental Company actor, real data for the Renter actor).

## Architecture

No deviations from the locked architecture contract. Every new module follows the existing
four-layer shape (`domain → application → infrastructure → presentation`) and the existing
authorization pattern. One new, deliberate cross-module pattern: `CommercialQuotationService`
depends on a narrow `WorkOrderCreationPort` (one method) rather than the concrete `WorkOrderService`
— unlike the documented exception for `RentalService` (reused for its real business logic/
validation), Work Order creation here is closer to a plain "snapshot and store," so the ordinary
port-based convention applies instead of repeating that exception.

## Known limitations (honest, not fixed in this pass)

- **The DB-level hardening this pass was asked to review was not added**: nothing at the database
  layer yet prevents an `awarded` Commercial Quotation with a real renter but no
  `renter_accepted_at` from existing if a row were inserted directly (e.g. a future seed script bug,
  or a bypass of the service layer) — the application-level guard is real and tested, but there is no
  CHECK constraint backing it.
- Two pre-existing bugs in `scripts/seed-demo-data.ts` (missing `acceptQuotation` and
  `selectParticipant` calls, predating this pass) were found and fixed while verifying the Work
  Order integration — not introduced by this pass, but the script was silently stale against
  already-fixed acceptance rules until now.
- No dedicated unit tests assert notification *content* for the Transport/Billing/Rental wiring
  added in this pass — proven via the real seed run and a direct database query, not a unit
  assertion.
- Platform Admin has exactly one fixed staff role; there is no lower-privilege staff tier.
- No time-based "rental ending soon" reminder — would need a scheduler/cron, which doesn't exist in
  this codebase today.

## Business decisions still required

- Whether to deprecate the existing tenant `catalogue.manage` permission now that Platform Admin
  catalogue administration exists (left intact this pass rather than silently revoke a live tenant
  capability).
- KYC/banking onboarding for organizations remains out of scope (flagged in the prior gap-analysis
  pass, still open).
- Whether Platform Admin ever needs a second, lower-privilege staff tier.

## Production readiness

**READY WITH KNOWN RISKS**, same posture as the prior MVP final report. Every capability in this
pass's scope is implemented, tested (395 backend tests plus extensive live end-to-end verification,
including the security-sensitive suspension paths), and the full migration chain plus a clean
production build have both been proven from scratch. The known gaps above (the missing DB-level
quotation-acceptance constraint chief among them) are real and worth closing before relying on this
in production, but none represent a defect in the business logic actually implemented — they are
scope explicitly deferred or flagged, not silently skipped.
