# FleetIP

FleetIP is an equipment rental / fleet management platform connecting **Rental Companies** (who own
and lease out heavy equipment — cranes, boom pumps, generators, and similar) with **Renters** (who
need equipment for a project). It replaces a legacy PHP/MySQL system whose schema mixed machine
identity, rental state, and execution data into a handful of oversized tables — the new system is a
from-scratch redesign around proper domain boundaries, not a port of the old one.

The long-term equipment lifecycle FleetIP is built around:

```
Registered → Available → RFQ/Inquiry → Quoted → Awarded → Reserved → Mobilized →
On Rent → Logsheets → Utilization → Maintenance → Billing → Payment → Off Rent → Available again
```

## Status

MVP scope is implemented and demoable end-to-end: Foundation (identity/organizations/permissions),
Product Catalogue, Equipment (Machines), Rental, the marketplace core loop (RFQ → Quotation →
Negotiation → Auction), Rental Execution (Transport/Mobilization, Logsheets, Utilization), and
Billing/Payments. See `docs/final-report.md` for the full build report and
`docs/frontend-revamp-summary.md` for the current state of the UI. **Production readiness: READY
WITH KNOWN RISKS** — see [Known limitations](#known-limitations) below.

## Tech stack

| Layer         | Choice                                                                  |
| ------------- | ------------------------------------------------------------------------ |
| Frontend      | Next.js (App Router), TypeScript, Tailwind CSS v4                         |
| Backend       | Fastify, TypeScript, modular monolith (no microservices)                  |
| Database      | PostgreSQL, accessed via Kysely (a query builder, not an ORM) + `pg`       |
| Contracts     | Zod schemas in `packages/contracts` — the single source of truth for shapes |
| Auth          | Hashed passwords (`scrypt`) + DB-backed cookie sessions, no OTP/JWT         |
| Monorepo      | pnpm workspaces                                                             |
| Deployment    | `apps/api` → Render (see `render.yaml`); `apps/web` → Vercel                  |

Deliberately **not** used: an ORM, microservices, MongoDB, Kafka, Kubernetes, Redis (unless a
measured need appears), or any generic workflow/permission-builder engine. See
`docs/autonomus-building-instructions.md` §39 for the full "do not overengineer" list.

## Architecture

A modular monolith: one Next.js web app, one Fastify API, one shared PostgreSQL database. Each
backend domain module follows the same four-layer shape:

```
presentation (routes) → application (services/use cases) → domain (ports, rules) → infrastructure (Kysely repositories)
```

Business logic never depends directly on Fastify, Kysely, or raw HTTP/SQL objects — repositories
sit behind hand-written, business-named interfaces (`*RepositoryPort`), not a generic repository
abstraction.

**Identity & authorization**: `User → Membership → Organization → Role → Permission`. A user can
belong to multiple organizations. Every organization is one of exactly two types for MVP:
`rental_company` or `renter`. Tenant isolation and permission checks are enforced **server-side,
always** — the frontend hiding a button is UX only, never the real authorization boundary.

**Product Catalogue vs. Machine**: the catalogue (`ProductCategory → ProductSubcategory → Product`)
is a shared, platform-level taxonomy with no `organization_id` — think "Caterpillar 320, 20-ton
crane" as a specification. A `Machine` is one rental company's actual serialized physical asset,
registered against a catalogue `Product`. Availability is never stored on `Machine` — it's always
derived from `Rental` records (see `docs/equipment-domain-design.md`, `docs/rental-domain-design.md`).

**Rental** is the one entity that answers "is this machine committed, to whom, on what terms" — no
separate Contract entity exists. Lifecycle: `confirmed → active → off_rent → completed`, with
`cancelled` reachable from any non-terminal state. Double-booking is prevented at two levels: an
application-level pre-check (fast, friendly errors) and a PostgreSQL exclusion constraint (the actual
correctness guarantee under concurrent requests).

**Marketplace core loop** (RFQ → Quotation → Negotiation → Auction): three paths converge on the same
`awardQuotation` action, which always creates a `Rental` — there is no separate "Award" entity.
Auctions are server-authoritative (PostgreSQL is the source of truth, never the client or Redis),
with participant-isolated bid visibility.

Full domain write-ups live in `docs/`:

- `docs/equipment-domain-design.md` — Product Catalogue + Machine
- `docs/rental-domain-design.md` — Rental lifecycle, availability, double-booking
- `docs/marketplace-core-loop-design.md` — RFQ, Quotation, Negotiation, Auction
- `docs/execution-and-billing-design.md` — Maintenance, Transport, Logsheets, Utilization, Billing
- `docs/project-workorder-platform-admin-report.md` — Project & Work Order entities, staff/platform-admin auth model
- `docs/platform-admin-architecture-requirements.md` — why a real platform-admin tier is deliberately *not* built yet

## Monorepo layout

```
fleetip/
├── apps/
│   ├── web/                 # Next.js frontend (App Router)
│   └── api/                 # Fastify backend
│       ├── src/modules/     # one folder per domain (equipment, rental, maintenance, ...)
│       └── scripts/         # seed-demo-data.ts, seed-staff-admin.ts
├── packages/
│   ├── contracts/           # Zod schemas + inferred types, shared frontend/backend
│   ├── ui/                  # @fleetip/ui — hand-rolled component library, zero runtime deps
│   └── config/              # shared tsconfig base
├── infrastructure/
│   ├── database/            # migrations
│   └── docker/               # local Postgres (docker-compose.yml)
├── design/                   # approved design canvases (source of truth for UI work)
└── docs/                     # domain designs, decisions log, review reports
```

## Getting started

**Prerequisites**: Node 22+, pnpm (repo pins `pnpm@10.28.0`), Docker (for local Postgres).

```bash
# 1. Install dependencies (run from the repo root — required for workspace linking)
pnpm install

# 2. Start local Postgres (mapped to port 5433, not 5432 — see infrastructure/docker)
docker compose -f infrastructure/docker/docker-compose.yml up -d

# 3. Configure environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# apps/api/.env: set SESSION_COOKIE_SECRET to a random string, 32+ chars

# 4. Run migrations
pnpm migrate

# 5. (Optional) Seed realistic demo data — two organizations with a full business journey
pnpm --filter @fleetip/api run seed:demo

# 6. Start both apps
pnpm dev
# API on http://localhost:4000, web on http://localhost:3000
```

Demo accounts (after `seed:demo`), both password `DemoPass123!`:

| Account                              | Organization type |
| ------------------------------------- | ------------------ |
| `owner@apex-demo.fleetip.local`       | Rental Company      |
| `owner@metro-demo.fleetip.local`      | Renter               |

### Common commands

```bash
pnpm dev            # both apps, parallel
pnpm dev:api         # API only
pnpm dev:web         # web only
pnpm typecheck        # all workspace packages
pnpm lint              # repo-wide eslint
pnpm test               # all workspace test suites (vitest for the API)
pnpm build               # production build, both apps
pnpm migrate               # apply pending migrations
pnpm migrate:down           # roll back the last migration
```

## Deployment

`apps/api` deploys to Render via `render.yaml` (Blueprint import) — migrations run automatically as
part of the start command. `apps/web` deploys separately to Vercel (Root Directory: `apps/web`).
`WEB_ORIGIN` (API) and `NEXT_PUBLIC_API_URL` (web) must point at each other's real deployed URLs.

## Testing & quality

- Backend: table-driven state-machine tests for every status enum (Rental, Requirement, Auction,
  Maintenance, Transport, CommercialQuotation, Invoice) plus service-level tests using hand-written
  fakes (no mocking library) — 277 tests passing as of the last full report.
- `pnpm typecheck && pnpm lint && pnpm build` clean across the workspace as of the last verified run.
- Security review (`docs/security-review.md`): no Critical/High/Medium findings; two Low findings
  fixed (login timing side-channel, missing rate limiting on `/auth/login`/`/auth/signup`).
- Performance review (`docs/performance-review.md`): no N+1 queries found; one missing index fixed.
- No automated frontend/E2E test suite is committed yet — UI review to date has been screenshot-based
  (desktop/tablet/mobile) against seeded demo data, not a repeatable test file.

## Known limitations

- No pagination on list endpoints (`listRentals`, `listQuotations`, `listInvoices`, etc.) — fine at
  MVP/demo scale, needs attention before real-world data volume.
- No membership-invite / team-management flow beyond the current invite-link mechanism — every
  organization's roles/permissions are real, but broader team administration is still thin.
- No real **platform administration** tier — FleetIP staff managing tenant data or the catalogue
  independent of any tenant membership does not exist in the authorization model yet, and is
  deliberately not bolted on without a dedicated design pass (see
  `docs/platform-admin-architecture-requirements.md`). Any Platform Admin UI in the frontend is a
  target-UI preview behind an explicit "not live" banner, not a working feature.
- No CAPTCHA or progressive backoff beyond a flat per-IP rate limit on login/signup.
- The Maintenance ↔ Rental double-booking cross-check is application-level only, not a cross-table
  database constraint (Postgres can't `EXCLUDE` across two tables) — Rental's own exclusion
  constraint still guards the adversarial double-booking case.
- Several UI requirements from the approved design have no backing endpoint yet (e.g. machine
  photographs, a fleet-wide "committed value" aggregate, batch status-change endpoints) — each is
  called out explicitly in the UI rather than faked. Full list in
  `docs/frontend-backend-gap-report.md`.

Everything explicitly out of MVP scope — Operators, GPS/telematics, OEM, Used Equipment, Parts,
Services, Financing, Insurance, advanced analytics/AI, a Transport Marketplace — remains unbuilt, as
instructed by `docs/autonomus-building-instructions.md` §40.

## Documentation index

All design and review documents live in `docs/`:

- `autonomus-building-instructions.md` — the original build mission and MVP scope contract
- `decisions.md` — running log of what was decided and why, plus corrections made mid-build
- `equipment-domain-design.md`, `rental-domain-design.md`, `marketplace-core-loop-design.md`,
  `execution-and-billing-design.md` — per-domain design docs
- `project-workorder-platform-admin-report.md`, `platform-admin-architecture-requirements.md` —
  Project/Work Order entities and the platform-admin authorization gap
- `frontend-revamp-summary.md`, `frontend-review.md` — UI redesign history and screenshot-based review
- `frontend-backend-gap-report.md` — every UI requirement without full backend support, living document
- `backend-hardening-report.md` — business-rule permissiveness observations for a future hardening pass
- `security-review.md`, `performance-review.md` — dedicated review passes
- `final-report.md` — the MVP build's completion report and production-readiness assessment
