# FleetIP MVP — Final Report

Covers the autonomous build session that took FleetIP from "Foundation + Catalogue + Equipment +
Rental" to the complete MVP scope in `docs/autonomus-building-instructions.md` §10.

## Completed

**Backend** — every domain in the MVP scope list, each following the same four-layer module shape
(`domain` → `application` → `infrastructure` → `presentation`) as the pre-existing foundation:

- RFQ (Requirement): post/discover/respond/close, broadcast to eligible Rental Companies.
- QuotationResponse: lightweight interested/not-interested reply, upsert-shaped.
- CommercialQuotation: the formal document, supporting all three origin paths (RFQ response,
  known customer, auction win), with draft/sent/negotiating/awarded/rejected/expired/withdrawn
  lifecycle and lazy expiry.
- Negotiation: append-only offer/counter-offer trail, accept-without-award and award-as-a-separate-
  step kept distinct.
- Auction: server-authoritative bidding (direction-aware, per-participant cap, lazy
  scheduled→live→closed transitions via a locked transaction), a persisted auditable result, and
  participant isolation (a bidder sees only its own bids + the current leading bid, never the
  competitor roster).
- Maintenance: bidirectionally integrated with Rental's existing availability check — a Rental can't
  be confirmed/activated over scheduled maintenance, and maintenance can't be scheduled over a
  committed Rental.
- Transport/Mobilization: one record per mobilization/demobilization leg, deliberately decoupled from
  Rental's own status machine.
- Logsheets + Utilization: upsert-shaped daily records; Utilization is a read-only aggregate report,
  not a new writable entity.
- Billing: invoices with app-computed line-item totals, a race-free per-organization reference-number
  counter, and payments that deterministically flip an invoice to `paid` once fully covered.

**Frontend** — `/requirements`, `/quotations`, `/auctions`, `/billing` (each dual-mode: Renter vs.
Rental Company), plus `/rentals/[id]` (Transport + Logsheets + Utilization) and `/machines/[id]`
(Maintenance + Utilization), all built on `@fleetip/ui`.

**Cross-cutting**: 5 new database migrations (0011-0015) plus the marketplace-loop migrations
(0008-0010) from the prior stage; a demo-data seed script (`pnpm --filter @fleetip/api run
seed:demo`) that drives two complete business journeys through the real application services;
dedicated security and performance review passes with real fixes applied.

## Tests

```
pnpm typecheck   — clean (5 workspace projects)
pnpm lint        — clean
pnpm --filter @fleetip/api run test   — 277/277 passing
pnpm --filter @fleetip/web run build  — clean production build
pnpm --filter @fleetip/api run build  — clean production build (after the esbuild-external fix)
```

277 backend tests: table-driven state-machine tests for every status enum (Rental, Requirement,
Auction, Maintenance, Transport, CommercialQuotation, Invoice) plus service tests using hand-written
fakes (no mocking library) covering authorization, ownership, and business-rule edge cases for every
domain.

**Known gap**: no automated frontend or E2E test suite is committed. `playwright-core` was added as a
devDependency and used for the UI review pass below, but as an ad-hoc script against seeded data, not
a repeatable test file.

## End-to-end workflows verified live

All of the following were exercised against a real running Postgres + API + web app, not just unit
tests, with all throwaway data cleaned up afterward:

- Full RFQ → Response → Quotation → Negotiation (counter-offer, accept) → Award → Rental, confirming
  the **negotiated** rate (not the original) flows through to the final Rental record.
- Full RFQ → Auction (two competing bidders, participant approval, direction-aware bid validation,
  lazy close, persisted result) → formalized Quotation → Award → Rental, including verifying a
  bidder cannot see a competitor's identity, only the current leading bid amount.
- Scheduled Maintenance correctly blocking an overlapping Rental, and allowing a non-overlapping one.
- Transport lifecycle (plan → dispatch → deliver), Logsheet upsert-correction reflected immediately
  in Utilization aggregates.
- Invoice creation → issue → partial payment (stays `issued`) → full payment (auto-`paid`, zero
  balance).
- The complete migration chain (all 15 migrations) applied cleanly to a **truly empty**, isolated
  temporary database (not the shared dev database), followed by a successful app boot, signup, and
  catalogue-seed check against that fresh instance.
- The actual `dist/index.js` production bundle booting and serving a login request end to end.

## UI review

Real browser screenshots (headless Chrome via Playwright) at desktop (1440px), tablet (768px), and
mobile (375px) for every new page, both organization types where dual-mode, against seeded realistic
demo data. Full detail in `docs/frontend-review.md`. Two real bugs found and fixed, not just in new
code:

1. A **pre-existing** whole-page horizontal-overflow bug on mobile, affecting the already-shipped
   Machines and Rentals pages too — a missing `min-w-0` on the app layout's flex column let a wide
   table force the entire viewport wider instead of scrolling within its own container. Confirmed
   empirically (699px-wide screenshot at a 375px viewport before the fix, exactly 375px after).
2. Action-heavy tables were still illegible on mobile after that fix — Requirements got a real
   stacked-card mobile layout; Quotations/Billing got a lighter (column-hiding + vertical-button-
   stack) fix, functional but less polished.

Also fixed: raw ISO timestamps (`2026-09-11T04:19:08.000Z`) shown directly to users on the Auction
panel, now formatted via `toLocaleString`.

## Security

Full findings in `docs/security-review.md`. A dedicated audit covering all 14 application services,
every route handler, every raw SQL call site, and the session/password modules found **no Critical,
High, or Medium issues**. Two real Low-severity gaps were fixed:

1. Login timing side-channel — response time used to reveal whether an email was registered even
   though the error message was identical; fixed by always running the slow password-verify step.
2. No rate limiting on `/auth/login`/`/auth/signup` — added `@fastify/rate-limit`, scoped to just
   those two routes, verified live (11th rapid attempt in a minute returns 429).

Confirmed safe (not just "no bugs found," actually verified): authorization/IDOR across every
resource-accepting service method (including both directions of every dual-party resource), zero
SQL-injection-prone raw query construction anywhere, session/password hygiene, the input-validation
boundary, error-message leakage, and cross-tenant filtering on every list/aggregate endpoint.

## Architecture

No deviations from the locked architecture contract (modular monolith, Fastify + Next.js, Kysely +
`pg` + Postgres only, Zod contracts as the single schema source, hand-written business-named
repositories, no ORM). Every new domain follows the same four-layer shape and the same authorization
pattern (`PermissionService.requirePermission` + an explicit ownership check) already established by
the foundation. One deliberate, documented gap: the Maintenance ↔ Rental double-booking cross-check
is app-level only, not a cross-table database constraint (Postgres can't `EXCLUDE` across two tables)
— Rental's own exclusion constraint still guards the adversarial double-booking case; this only
affects the same Rental Company's own self-service maintenance scheduling.

## Known limitations (honest, not fixed in this pass)

- No automated frontend/E2E test suite (see Tests, above).
- No pagination on list endpoints (`listRentals`, `listQuotations`, `listInvoices`, etc.) — fine at
  MVP/demo scale, would need attention before real-world data volume.
- Quotations/Billing's mobile layout is functional but less polished than Requirements' full
  stacked-card treatment.
- No CAPTCHA or progressive backoff beyond the flat per-IP login rate limit.
- No membership-invite / team-management flow — `organization.manage`/`membership.manage`
  permissions are declared but nothing exercises them yet (every organization today has exactly one
  owner, created at signup).
- Everything explicitly out of MVP scope per the mission doc (Operators, GPS/telematics, OEM, Used
  Equipment, Parts, Services, Financing, Insurance, Advanced Analytics/AI, Transport Marketplace)
  remains unbuilt, as instructed.

## Production readiness

**READY WITH KNOWN RISKS.**

The core business logic is solid: every domain in the MVP scope is implemented, tested (277 backend
tests plus extensive live E2E verification across every workflow), security-reviewed with real fixes
applied and verified, and the full migration chain plus the actual production build have both been
proven to work from scratch — not just asserted. The known gaps (no automated frontend/E2E suite, no
pagination, no team-management flow, two pages with less-polished mobile treatment) are real and
worth closing before a genuine production launch, but none of them represent a defect in the
implemented business logic itself — they're scope not yet covered, which is why this isn't a plain
"READY."
