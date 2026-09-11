# Frontend build + screenshot review (marketplace loop + execution/billing)

Status: complete for this pass. Covers the pages built to give RFQ, Quotation, Negotiation, Auction,
Maintenance, Transport, Logsheets, Utilization, and Billing a UI (previously backend-only).

## What was built

- `/requirements` — dual-mode (Renter posts/manages; Rental Company discovers/responds), reusing
  `@fleetip/ui` primitives throughout.
- `/quotations` — dual-mode create/send/negotiate/award/reject, with an inline negotiation panel
  (offer history + make-offer + accept-offer).
- `/auctions` — dual-mode create/approve-participants/bid/close, with participant-isolated bid
  visibility on the Rental Company side (own bids + current leading bid only, never the competitor
  roster — matches the backend's own isolation rule).
- `/billing` — dual-mode invoice creation (dynamic line items) + payment recording; Renter side is
  read-only.
- `/rentals/[id]` — Transport (both legs) + Logsheets + Utilization for one Rental.
- `/machines/[id]` — Maintenance schedule/history + Utilization for one Machine.
- `navigation.ts` reworked from a single `requiredPermission`/`requiredOrganizationType` pair to a
  `requiredPermissions: PermissionCode[]` any-of list, since several of these pages are shared by both
  organization types under different permission codes (e.g. Requirements via `rfq.manage` for a
  Renter or `rfq.respond` for a Rental Company) — the old single-pair model couldn't express that.

## Verification performed

`pnpm typecheck && pnpm lint && pnpm build` clean across the workspace. Live review via a headless
Chrome (Playwright driving the already-installed system browser) logged into two seeded demo
accounts (a Renter and a Rental Company) with realistic data (an RFQ with a response, a sent
quotation with a counter-offer, a live auction with an approved bidder and a bid, a rental with
mobilization dispatched and two logsheets, a partially-then-fully-paid invoice) — desktop (1440px),
tablet (768px), and mobile (375px) screenshots of every page above.

## Real bugs found and fixed during this pass

1. **Whole-page horizontal overflow on mobile.** `(app)/layout.tsx`'s content flex column
   (`<div className="flex flex-1 flex-col">`) had no `min-w-0`, so a flex item's default
   `min-width: auto` let a wide `<table>` inside it force the _entire page_ wider than the viewport
   — not contained by the table's own `overflow-x-auto` wrapper. Confirmed empirically: a 375px-wide
   viewport screenshot came back 699px wide before the fix, exactly 375px after. Fixed by adding
   `min-w-0` to that flex column and to `<main>`. This was a **pre-existing bug** affecting the
   already-shipped Machines and Rentals pages too, not something newly introduced — caught only
   because this pass actually rendered pages in a real browser at mobile width instead of only
   type-checking and unit-testing.
2. **Action-heavy tables were illegible on mobile even after the overflow fix**, per §23's own
   guidance ("desktop table → mobile cards / stacked records"): Requirements' list (4 wrapping action
   buttons per row) was converted to a real stacked-card layout below the `sm` breakpoint
   (`sm:hidden` card list + `hidden sm:block` table). Quotations and Billing — whose rows are more
   complex (inline negotiation/payment panels) — got a lighter but still real fix: secondary columns
   (Machine/Customer, Period/Due date) hide below `sm` and reappear inline as a subtitle, and the
   action-button group switches from `flex-wrap` (which was wrapping to multiple lines and then
   clipping) to a vertical stack on mobile, single-line legible buttons on larger screens.
3. **Raw ISO timestamps shown to users.** The Auction panel displayed `startsAt`/`endsAt` as literal
   `2026-09-11T04:19:08.000Z` strings. Added a `formatDateTime` helper (`toLocaleString` with
   medium date / short time) — the only place in the new pages that displayed a `datetime` field
   directly to a user rather than as a plain `date`.

## Known limitations (not fixed in this pass)

- Quotations/Billing's mobile fix is "reduced columns + stacked buttons," not full stacked cards like
  Requirements — legible and functional, but less polished. Would benefit from the same card
  treatment if these pages get more real-world use.
- No automated Playwright/E2E test suite committed — this review was done with an ad-hoc script
  against seeded demo data, not a repeatable test file. `playwright-core` is now a workspace
  devDependency; a real `apps/web/e2e/` suite is a reasonable next investment (see the final report's
  "known limitations").
- Auction/Quotation/Billing list pages don't yet paginate — fine at demo scale, would need attention
  before a rental company with hundreds of quotations/invoices uses this for real.
