# Frontend Revamp — Summary

Branch: `feat/frontend-revamp`. A 10-phase rebuild of `apps/web` from a
functional-but-wireframe-looking UI into a production-quality "modern
industrial B2B" product, matching the approved Claude Design canvas
(`FleetIP Redesign.dc.html`). No backend/contract changes were made on this
branch beyond two tiny compatibility additions (both predate/were made
alongside this branch's work — see below), per the standing rule that
backend changes stay out of scope for a frontend branch.

## Design system foundation

- `apps/web/app/globals.css`: Tailwind v4 `@theme` tokens taken verbatim
  from the canvas (ink/rail/accent/status color families, radii, fonts) —
  a locked decision; this branch never re-litigates the palette.
- Self-hosted Archivo + IBM Plex Mono via `next/font/google`.
- `packages/ui` grew from a handful of components to a real primitive set:
  `Button`, `Input`, `Select`, `Card`, `Badge`, `StatusBadge`, `Table`,
  `Pagination`, `Tabs`, `Dialog`, `Drawer`, `Alert`, `Meter`, `Skeleton`,
  `EmptyState`/`ErrorState`/`LoadingState`, `PageHeader`, `Dropdown` — zero
  runtime dependencies, hand-rolled, consistent with the existing
  "no clsx/cva" convention.

## Phases and commits

| #   | Phase                                | Commit(s)            |
| --- | ------------------------------------ | -------------------- |
| 1   | Design system + application shell    | `1788f3e`, `eea859d` |
| 2   | Dashboards (Rental Company / Renter) | `3dbfc73`            |
| 3   | Machines (list + detail)             | `04fb38d`            |
| 4   | Requirements / Open Market           | `470b186`            |
| 5   | Quotations / negotiation             | `7fff35b`            |
| 6   | Auctions (bidder + owner)            | `bb7407b`            |
| 7   | Rentals / operations                 | `5df2a0a`            |
| 8   | Billing                              | `1514056`            |
| 9   | Responsive + accessibility polish    | `f76e2c7`            |
| 10  | Final cleanup + this summary         | (this commit)        |

Each commit message carries that phase's own detail (what changed, real
bugs found and fixed, verification performed) — this document doesn't
repeat it, only indexes it.

## Phase 11+ — Catalogue, standalone Operations, admin surfaces

A second pass (Phases 11–16), same branch, same discipline, under a
stricter rule than Phases 1–10: **no backend/contract changes at all**,
not even a tiny compatibility one (a separate agent is closing the gap
report on a sibling branch, `feat/backend-mvp-gaps`, forked from this
branch's tip — integration happens later, not here). Every capability
the backend doesn't support today renders the correct target UI behind a
disabled control, an honest empty state, or (Platform Admin) a whole
gated mock section — never faked.

| #   | Phase                                              | Commit(s) |
| --- | -------------------------------------------------- | --------- |
| 11  | Catalogue (list/detail/admin dialogs)              | `e3143bd` |
| 12  | Standalone Transport, Logsheets, Maintenance       | `cd4a9e7` |
| 13  | Rentals + Billing final polish                     | `fcfba21` |
| 14  | Organization admin (tenant Settings)               | `2db9dc3` |
| 15  | Platform Admin shell (target-UI-plus-gap)          | `732dd4d` |
| 16  | Edit flows (Machines/Requirements) + search polish | `05fb7ff` |
| —   | Gap/hardening report updates for the above         | `416c3d1` |

Highlights:

- **Catalogue** (`/catalogue`, `/catalogue/categories/:id`,
  `/catalogue/subcategories/:id`, `/catalogue/products/:id`) is real
  end-to-end — the catalogue module is 100% read-only, confirmed by
  reading `routes.ts` — with catalogue administration (create/edit/
  disable) fully designed but always disabled (no write endpoint exists
  anywhere in the module).
- **Transport/Logsheets/Maintenance** move from nav "Soon" tags to real
  standalone workspaces. Their existing per-rental/per-machine panels
  (`TransportPanel`, `LogsheetPanel` from Rental detail;
  `MaintenancePanel` from Machine detail) were extracted into
  `rentals/panels.tsx` / `machines/panels.tsx` and reused, not
  reimplemented. Each workspace's list stays an honest "fleet-wide list
  needs an org-wide endpoint" state (no such endpoint exists; looping
  the per-parent endpoint across every rental/machine would fake an
  aggregate) with a real rental/machine picker underneath; each
  workspace's detail page is genuinely real (`?rentalId=`/`?machineId=`
  - find-by-id against the real scoped endpoint, zero N+1). Maintenance
    gained a correctly-derived "availability impact" indicator (mirrors
    the real `hasOverlappingMaintenance` SQL, not a fabricated stored
    flag).
- **Rentals/Billing polish**: Rental detail gained Maintenance and
  Activity tabs and a "what happens next" status hint; Billing gained a
  due-soon/overdue badge derived client-side from the real due date
  (independent of the server-only `issued→overdue` transition, which
  can lag).
- **Organization admin** (`/settings`, tabbed): real organization
  profile, real "your own membership" row (no fabricated teammates —
  no list-members endpoint exists), real role/permissions from
  `/auth/me`, each gap named plainly.
- **Platform Admin** (`/platform-admin`, new route outside the tenant
  shell, never linked from any nav): FleetIP has no authorization tier
  above the Rental Company/Renter model anywhere in the backend —
  confirmed by reading every module. Built as target-UI behind a
  permanent "not live" banner; every section is a hardcoded, clearly
  tagged "Sample" except Access & roles, which is real (the fixed
  permission list from `packages/contracts`). This is the single
  biggest gap surfaced by the whole frontend-revamp effort.
- **Edit flows**: Machines' and Requirements' disabled "Edit" buttons
  now open the complete intended form (prefilled from real data),
  Submit still disabled with a tooltip naming the missing endpoint —
  via a new shared `components/NotYetAvailableDialog.tsx`, also
  backing Catalogue's admin dialogs.

Gap/hardening reports gained: catalogue admin + machine-count/reverse-
lookup, standalone-workspace aggregation + by-id routes, organization
admin (profile/members/roles), Platform Admin (flagged
architecture-level), the general audit-trail gap — plus two new
hardening observations found while reading the real service code:
`MaintenanceService.createMaintenance` never checks for
maintenance-vs-maintenance overlap on the same machine (only
maintenance-vs-rental), and `RentalService.updateRentalStatus` has no
link between the rental lifecycle and the transport lifecycle (a rental
can go `active` with no delivered mobilization leg).

## Phase 17 — Backend integration

`feat/backend-mvp-gaps` merged into this branch (2026-09-12), closing
almost every gap Phases 11–16 had documented. This pass wired the
already-built target UI to each now-real endpoint — a wiring pass, not a
redesign; every component/token/convention from Phases 1–16 is unchanged.
Confirmed against the actual route/contract code before wiring each one
(not paraphrased). One commit per item, matching the existing
per-phase granularity:

1. **Machine edit** — `apiClient.updateMachine` → `PATCH
.../machines/:machineId`. Machine detail's disabled edit dialog is now
   a real `EditMachineDialog` (own submit/error/loading state, refreshes
   the machine in place).
2. **Requirement edit** — `apiClient.updateRequirement` → `PATCH
.../requirements/:requirementId`. Requirement detail's disabled edit
   dialog is now a real `EditRequirementDialog`; the Edit button disables
   once the requirement is no longer `open` (server-enforced, respected
   client-side too).
3. **Renter quotation machine info** — Quotation detail now reads
   `CommercialQuotation.productName`/`machineAssetCode` (server-resolved
   for the Renter) instead of showing "—".
4. **Renter Transport/Logsheets read access** — Rental detail's Transport
   and Logsheets & utilization tabs now gate on
   `hasPermission("transport.respond"/"logsheet.respond")` instead of a
   blanket `isRenter` check; `TransportPanel`/`LogsheetPanel` gained a
   `readOnly` prop reused as-is on the Renter side (no new components).
5. **Auctions dashboard tile** — `apiClient.listAuctionsForOrganization`
   → `GET .../auctions`. Both dashboards gained an "Auctions" KPI tile
   and a `needsAttention`-driven attention row (previously omitted
   entirely, not just disabled — no org-scoped auction list existed).
6. **Standalone Transport/Logsheets/Maintenance** — `apiClient.
listTransportRecords`/`listLogsheets`/`listMaintenanceRecords` → the
   new org-wide list routes. `/transport`, `/logsheets`, `/maintenance`
   now render the real fleet-wide table as the primary view, with
   working search/status filters; the per-rental/per-machine picker +
   panel stays underneath as the only create/update path.
7. **Catalogue administration** — `apiClient` gained create/update
   methods for categories/subcategories/products.
   `CatalogueFormDialog` now renders a real form for a caller with
   `catalogue.manage`, falling back to an accurate permission-gated
   message otherwise. Disable/delete stays correctly disabled (no
   endpoint exists).
8. **Organization administration (tenant)** — `apiClient` gained
   `listOrganizationMembers`/`inviteMember`/`listRolesAndPermissions`.
   Settings → Members lists real members with a real invite dialog;
   Settings → Roles & access lists every role's real permissions. Org
   profile stays read-only (no update endpoint exists, deliberately
   deferred).
9. **Global search** — `apiClient.search` → `GET .../search?q=`. The
   header's disabled "coming soon" input is now a real, debounced,
   grouped-by-resource-type `GlobalSearch` component.

Left exactly as-is, correctly still gapped: Platform Admin (entirely
out of scope, no backend exists), organization-profile update,
Catalogue disable/delete, saved views, machine/rental audit-log tabs,
"N companies notified", quotation PDF/share.

Verification: `pnpm typecheck`, `pnpm lint`, `pnpm build` (whole repo)
all clean; see `docs/frontend-backend-gap-report.md` for the per-entry
detail and dates.

## Six brief-vs-canvas conflicts (from the canvas itself)

The approved design canvas documents these directly (its own "conflicts"
panel) — the canvas already resolved them in favor of the real code, and
this branch followed the canvas:

1. **No "available"/"on rent" machine status.** `machineStatusSchema` is
   `active | under_maintenance | retired`; availability is derived from
   overlapping rentals, so the UI labels it as derived rather than
   pretending a status field exists.
2. **Auctions are owned by the Renter.** `auction.manage` sits with
   `renter`, `auction.participate` with `rental_company` — the opposite of
   what the original brief assumed. Confirmed directly in
   `packages/contracts/src/organization/index.ts`'s own comments.
3. **Quotations have no "accepted" status.** Acceptance is the
   `renterAcceptedAt` timestamp, independent of `status` and cleared by any
   term change — rendered as status `sent` + no acceptance stamp, not a
   dedicated status value.
4. **Two different Requirements lists.** `listRequirements` returns only a
   Renter's own posted requirements; a Rental Company sees the
   marketplace-wide discover list — same underlying object, two screens,
   two headings (Phase 4).
5. **Catalogue, transport, logsheets, maintenance have no standalone
   pages.** Contracts/APIs exist; maintenance and utilization only surface
   on Machine detail. Shown in the nav as "Soon", not built this pass
   (tracked in the gap report, Phase 1 entry).
6. **Dashboard counts are not one endpoint.** Each dashboard tile counts a
   client-filtered list; every tile states how it's derived so nothing
   implies an aggregate endpoint that doesn't exist (Phase 2).

## Screens with no approved mockup: Rentals, Billing

The canvas has exactly 12 screens (Foundations, Dashboard ×2, Machines ×2,
Open market, Requirement detail, Quotations ×2, Auctions ×3) — confirmed by
scanning every screen-title marker in the canvas file. Rentals and Billing
were never designed. Both were built this branch (Phases 7–8) using the
documented authority order: Architecture Contract → existing backend →
locked decisions → approved screens → existing frontend → engineering
judgment — reusing the exact tokens/`Table`/`StatusBadge`/`Tabs`/
field-group-card conventions already approved in Phases 1–6, rather than
inventing a new visual language.

## Real-data policy compliance

Every screen either renders real API data or, where a capability doesn't
exist yet, shows a disabled control with an explanatory tooltip plus a
gap-report entry — nothing is fabricated. The living records:

- `docs/frontend-backend-gap-report.md` — 10 entries across Phases 1–7
  (e.g. no cross-resource search, no machine/requirement edit endpoints, no
  quotation PDF export, no `transport.respond`/`logsheet.respond` read
  permission for Renters).
- `docs/backend-hardening-report.md` — 1 entry (Phase 5: the
  `commercial_quotations` awarded/unaccepted invariant has no DB-level
  constraint, only a service-layer one).

Both are observational — nothing on this branch changes backend behavior
to address them; they're input for a future backend-focused pass.

## The two backend compatibility additions

Confirmed via the matha project brief and this branch's own commits — both
are the same "manage/respond" read-permission pattern already established
by `quotation.manage`/`.respond` and `billing.manage`/`.respond`, extended
to one more resource each because a screen genuinely needed it:

- `rental.respond` (Renter, read-only) + `Rental.machineAssetCode`/
  `rentalCompanyOrganizationName` (server-resolved only for the Renter
  caller) — so a Renter can list and view their own rentals without
  `equipment.manage` on the Rental Company's org. Landed with Phase 7.
- `CommercialQuotation.renterAcceptedAt` + a Renter-only `acceptQuotation`
  action (`quotation.respond`) — predates this branch's Phase 1 (a
  correction from an earlier session, per the matha brief), fixing an
  "award to self" shape where only the Rental Company could ever act.

No other backend/contract file was touched on this branch.

## matha

Not connected via MCP this session (would need a session restart — no
`matha_*` tools were available at any point, confirmed by tool search).
`matha after`/`matha record` is also not usable non-interactively (its CLI
has no non-interactive flag; it's built on `@inquirer/input`). This
session's decisions and corrections are recorded instead in the gap and
hardening reports above and in each phase's commit message, rather than in
`.matha/`.

Same finding on the Phase 11+ session: `matha_brief`/`matha_record` (named
directly in this repo's `CLAUDE.md`) were not present in the tool list at
any point either, confirmed via tool search before writing any code — so
this pass's decisions/corrections are likewise recorded in the gap and
hardening reports and in each phase's own commit message.

## Verify this branch

```
pnpm typecheck   # all 5 workspace packages, clean
pnpm lint        # repo-wide, clean (canvas export folder now git/eslint-ignored)
pnpm build       # apps/api + apps/web both build, all 25 web routes generate
```

Live: `pnpm dev`, then `owner@apex-demo.fleetip.local` (Rental Company) /
`owner@metro-demo.fleetip.local` (Renter), both `DemoPass123!`.
