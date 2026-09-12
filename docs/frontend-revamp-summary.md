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

| # | Phase | Commit(s) |
|---|---|---|
| 1 | Design system + application shell | `1788f3e`, `eea859d` |
| 2 | Dashboards (Rental Company / Renter) | `3dbfc73` |
| 3 | Machines (list + detail) | `04fb38d` |
| 4 | Requirements / Open Market | `470b186` |
| 5 | Quotations / negotiation | `7fff35b` |
| 6 | Auctions (bidder + owner) | `bb7407b` |
| 7 | Rentals / operations | `5df2a0a` |
| 8 | Billing | `1514056` |
| 9 | Responsive + accessibility polish | `f76e2c7` |
| 10 | Final cleanup + this summary | (this commit) |

Each commit message carries that phase's own detail (what changed, real
bugs found and fixed, verification performed) — this document doesn't
repeat it, only indexes it.

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

## Verify this branch

```
pnpm typecheck   # all 5 workspace packages, clean
pnpm lint        # repo-wide, clean (canvas export folder now git/eslint-ignored)
pnpm build       # apps/api + apps/web both build, all 14 web routes generate
```

Live: `pnpm dev`, then `owner@apex-demo.fleetip.local` (Rental Company) /
`owner@metro-demo.fleetip.local` (Renter), both `DemoPass123!`.
