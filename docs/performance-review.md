# MVP performance review

Status: complete for this pass — a practical review per §30 ("do not prematurely optimize, fix
demonstrated or obvious problems"), not a load test.

## Method

1. Grepped every application-service file for loop-with-await / `.map(async ...)` patterns (the
   classic N+1 shape).
2. Cross-referenced every foreign-key column across all 15 migrations against the actual `WHERE`
   filters each repository method issues, to find filter columns with no supporting index.
3. Spot-checked list endpoints for unbounded result sets.

## N+1 queries

**None found.** The one loop-with-await in the codebase (`AuthService.getAuthenticatedSession`,
iterating a user's memberships to resolve each one's permission list) already caches per-`role_id`
lookups in a `Map` specifically to avoid re-querying the same role's permissions once per membership
— a deliberate, already-correct optimization, not a gap.

## Missing indexes

One real, demonstrated gap, fixed in `0015_index_products_subcategory.ts`:

- **`products.product_subcategory_id`** had no index despite being the exact filter column for
  `ProductRepository.listAll(subcategoryId)` — the category → subcategory → product cascade picker
  hit on every Machine and Requirement creation form. Low impact at today's curated-catalogue scale
  (a handful of products), but a real, correctly-scoped fix — not a speculative one — since the query
  shape is already in production use.

Two columns are informational-only (no index, but also not currently used as a query filter — only
as a stored reference resolved by _its own_ primary key elsewhere), left alone per "do not add indexes
blindly":

- `commercial_quotations.requirement_id` / `.quotation_response_id` / `.source_auction_id` — nothing
  today queries `WHERE requirement_id = ?` against this table; a quotation is always reached by its
  own id. Add an index if a "quotations that came from this Requirement" list view is ever built.
- `auction_bids.participant_id` — the per-participant bid-cap check filters by `auction_id` (indexed)
  and scans that auction's (inherently small) bid set for the participant match. Fine at real auction
  scale; would only matter if a single auction ever accumulated thousands of bids.

Everything else checked — `rentals`, `requirements`, `maintenance_records`, `logsheets`,
`transport_records`, `invoices`/`invoice_line_items`/`payments`, `auction_participants` — has its hot
filter column covered either by an explicit index or by being the leading column of a compound
unique constraint (which Postgres can also use for lookups), confirmed by reading each repository's
actual query shape against its migration's constraints rather than assuming.

## Unbounded lists / large responses

List endpoints (`listRentals`, `listQuotations`, `listInvoices`, `discoverRequirements`, etc.) have no
pagination — every row for the organization comes back in one response. Acceptable at MVP/demo scale;
flagged as a known limitation (not fixed) in the final report, since building pagination now would be
solving a problem this dataset doesn't have yet (§30's own instruction).

## Frontend

No redundant re-fetching found — every page's data loading is a single `useEffect` keyed on the
resolved `organizationId` (and, where relevant, a route/query param), not re-run on unrelated
re-renders. Detail pages (`/rentals/[id]`, `/machines/[id]`) each make 2-3 parallel `Promise.all`
requests rather than sequential waterfalls.
