# Marketplace core loop — RFQ, Quotation, Negotiation, Auction

Status: locked (autonomous build — see `docs/autonomus-building-instructions.md`). Written directly from the mission
doc + matha's locked decisions, without an approval round-trip, per that document's authority hierarchy
(engineering judgment fills gaps the mission doc leaves open).

Grounded in the same four-layer module shape as `equipment`/`rental`
(`domain/ports.ts` → `application/*-service.ts` → `infrastructure/*-repository.ts` → `presentation/routes.ts`).

## 1. Why one document for four domains

RFQ → Quotation → Negotiation → Auction interlock tightly enough (a Quotation can originate from an RFQ response
_or_ an auction win _or_ neither; Negotiation is a sub-workflow of Quotation) that designing them independently
would risk exactly the kind of schema rework the Rental doc's revision history shows happens when relationships
are decided piecemeal. Each still gets its own module folder and migration.

## 2. The two paths (from the mission doc, §12)

```
Path A: Renter -> Requirement (RFQ) -> QuotationResponse (per Rental Company) -> CommercialQuotation -> Negotiation -> Award -> Rental
Path B: Rental Company -> CommercialQuotation (known customer, no RFQ)         -> Negotiation -> Award -> Rental
Path C: Renter -> Requirement (RFQ) -> Auction -> AuctionResult -> CommercialQuotation (formalizing the win) -> Award -> Rental
```

Award is always the same action for all three paths: accepting a `CommercialQuotation` creates a `Rental` via the
existing `RentalService`. There is no separate "Award" entity — it is a status transition plus a Rental-creation
call, keeping exactly one place where a Rental gets created.

## 3. Why QuotationResponse and CommercialQuotation stay separate (locked, matha decision)

- **QuotationResponse**: a Rental Company's lightweight reply to one Requirement — "interested, here's an
  indicative rate" or "not interested." One per (requirement, rental company). This is the comparison list a
  Renter scans; it is not a negotiable, legally-shaped document.
- **CommercialQuotation**: the formal document with full commercial terms (mirrors Rental's term fields exactly,
  since a Quotation is a Rental's terms _before_ an award). It is what gets negotiated and awarded. It can carry
  an optional `requirementId`/`quotationResponseId` (Path A — formalizing a response) or neither (Path B), or an
  optional `sourceAuctionId` (Path C — formalizing a win). Exactly one origin reference may be set, or none.

Reusing Rental's exact term-field shape means an accepted CommercialQuotation converts into a Rental by copying
fields across — no separate mapping logic to invent or keep in sync.

## 4. Requirement (RFQ)

### Entity

```
id
renterOrganizationId      -- fk organizations, cascade — RFQs are the renter's own record
productSubcategoryId      -- fk product_subcategories, restrict — "what kind of equipment"
capacity / capacityUnit   -- nullable, same vocabulary as Product (packages/contracts/src/catalogue)
quantity                  -- integer, default 1
projectName / projectLocation  -- nullable text, mirrors Rental's fields
requestedStartDate        -- date
expectedDurationValue / expectedDurationUnit  -- nullable int / rateUnit vocabulary (shift|day|week|month) —
                                                  reuses Rental's rate-unit enum so "3 months" and a quotation's
                                                  eventual rate unit speak the same vocabulary
shiftRequirement          -- nullable text (free text — legacy shift structures vary too much to enum yet)
validityDate              -- date — Requirement stops accepting new responses after this date
status                    -- 'open' | 'closed' | 'cancelled'
notes                     -- nullable text
createdAt / updatedAt
```

### Status lifecycle

`open -> closed` (renter awarded a quotation, or manually closed), `open -> cancelled`. Both terminal. Closing is
a status write, never a delete or a move to a side table (the mission doc's explicit anti-pattern, §11/§21).

### Authorization

New permission `rfq.manage` — org types `["renter"]` (create/close/cancel a Requirement is a Renter action).
Rental Companies read Requirements via a **discovery** endpoint gated by a separate permission `rfq.respond` —
org types `["rental_company"]` — since "create an RFQ" and "browse/respond to RFQs" are different capabilities
on different organization types, exactly the shape `PERMISSION_ORGANIZATION_TYPES` already exists to express.

### Discovery rule

A Rental Company sees a Requirement only while `status = 'open'` and `validityDate >= current_date`. No
cross-tenant filtering beyond that — Requirements are not private the way Rentals are; the whole point of an RFQ
is broadcast to eligible supply.

## 5. QuotationResponse

```
id
requirementId                       -- fk requirements, cascade
rentalCompanyOrganizationId         -- fk organizations, cascade
status                              -- 'pending' | 'interested' | 'not_interested'
indicativeRate / indicativeRateUnit -- nullable, only meaningful when status = 'interested'
notes                               -- nullable text
createdAt / updatedAt
unique (requirementId, rentalCompanyOrganizationId)
```

Gated by `rfq.respond`. A Rental Company creates at most one response per Requirement; re-submitting updates the
existing row (upsert-shaped use case), so "decline / not interested / provide an offer" (§11) never produces
duplicate rows for the same pair.

## 6. CommercialQuotation

```
id
rentalCompanyOrganizationId   -- fk organizations, cascade
renterOrganizationId          -- fk organizations, nullable
clientSnapshot                -- jsonb, nullable — same ClientSnapshot shape as Rental
                                  (exactly one of renterOrganizationId/clientSnapshot, same CHECK as rentals)
requirementId                 -- fk requirements, nullable, on delete set null
quotationResponseId           -- fk quotation_responses, nullable, on delete set null
sourceAuctionId               -- fk auctions, nullable, on delete set null
referenceNumber               -- text, per-rental-company sequential display reference (legacy-familiar; generated
                                  app-side as `Q-{yyyy}-{seq}`, uniqueness enforced by a per-org sequence table
                                  rather than parsing/max-ing existing rows under concurrency)
machineId                     -- fk machines, restrict — same machine a Rental would reference
startDate / endDate           -- date, endDate nullable (mirrors Rental's inclusive/open-ended rule)
rate / rateUnit                -- numeric / rateUnit enum
mobilizationCharge / demobilizationCharge / overtimeRate  -- nullable numeric
paymentTerms / shiftStructure / sundayCondition / fuelNorms / dehireTerms  -- nullable text
operatorScope                  -- nullable enum, same as Rental
noticePeriodDays               -- nullable integer
validityDate                    -- date — quotation lapses (status -> 'expired') if not accepted by then
commercialNotes                 -- nullable text (§12 "commercial notes")
status                          -- 'draft' | 'sent' | 'negotiating' | 'awarded' | 'rejected' | 'expired' | 'withdrawn'
createdAt / updatedAt
```

**Why no separate "accepted" status before "awarded":** an accepted CommercialQuotation converts into a Rental
in the same application-service call (`awardQuotation`) that flips its status to `awarded`. There is no window
where a quotation is "accepted but not yet a Rental" — that limbo state has no use case in this MVP and would
just be one more state to keep consistent. `awarded` is terminal and locks the quotation's terms permanently,
mirroring Rental's own "locked once active" rule.

### Status lifecycle

```
draft -> sent -> negotiating -> awarded
sent/negotiating -> rejected
sent/negotiating -> expired      (validityDate passed, checked lazily like Auction's close)
draft/sent -> withdrawn          (rental company pulls it back before any answer)
```

`draft` exists so a Rental Company can prepare a quotation before sending it (matches "commercial quotation
drafting" in the legacy discovery notes). Terms are mutable only in `draft`/`sent`/`negotiating`; `awarded` and
every terminal status lock them — same mutability rule shape as Rental's `confirmed`-only-mutable window.

### Authorization

`quotation.manage` — org types `["rental_company"]` (create/send/withdraw a quotation, and award it — awarding
is the rental company converting an accepted negotiation into a Rental on the renter's behalf in this MVP, since
Rental creation already requires `rental.manage` which only rental companies hold). Renters accept/reject via a
narrower `quotation.respond` permission — org types `["renter"]` — mirroring the `rfq.manage`/`rfq.respond` split.

## 7. Negotiation (QuotationOffer)

```
id
quotationId                -- fk commercial_quotations, cascade
offeredByOrganizationId     -- fk organizations — whichever side proposed these terms
rate / rateUnit
startDate / endDate
notes
status                      -- 'pending' | 'accepted' | 'rejected' | 'superseded'
createdAt
```

Only the negotiable subset (price, dates, notes) — not every commercial field — is carried per offer.
`// ponytail: negotiation covers price/dates/notes only; extend to full-term counter-offers if a real workflow
needs it.` Each new offer marks every other still-`pending` offer on the same quotation `superseded` (at most one
live offer at a time — no need for a priority/ordering model beyond insertion order). Accepting an offer copies
its `rate`/`rateUnit`/`startDate`/`endDate` onto the parent `CommercialQuotation` and marks the offer `accepted`;
this is a distinct action from _awarding_ the quotation (accepting terms vs. converting to a Rental), so a Renter
and Rental Company can agree on terms over several rounds before either side commits to Award.

Making an offer moves the quotation from `sent` to `negotiating` (first offer) and keeps it there until Award/
reject/expire. History is never overwritten — `quotation_offers` is append-only; the parent quotation always
reflects only the latest _accepted_ terms.

### Authorization

Either side may submit an offer if they hold `quotation.manage` (rental company) or `quotation.respond` (renter)
on the quotation's own organizations — checked against the quotation's actual `rentalCompanyOrganizationId`/
`renterOrganizationId`, not just "any permission holder," since two rental companies must never negotiate on each
other's quotations.

## 8. Auction

### Entities

```
auctions
  id
  requirementId                 -- fk requirements, cascade — every auction runs against a Requirement in this MVP
  createdByOrganizationId        -- fk organizations — the renter
  biddingDirection                -- 'ascending' (highest bid wins, legacy "H1") | 'descending' (lowest bid wins, "L1")
  basePrice                       -- numeric — floor (ascending) or ceiling (descending) valid bid
  maxBidsPerParticipant           -- nullable integer
  startsAt / endsAt                -- timestamptz — authoritative, never client-supplied at read time
  status                           -- 'scheduled' | 'live' | 'closed' | 'cancelled'
  createdAt / updatedAt

auction_participants
  id, auctionId, rentalCompanyOrganizationId, status ('pending'|'approved'|'rejected'), createdAt
  unique (auctionId, rentalCompanyOrganizationId)

auction_bids
  id, auctionId, participantId (fk auction_participants), amount, createdAt default now()  -- server time orders bids

auction_events                    -- append-only audit log, never mutated
  id, auctionId, eventType, actorOrganizationId nullable, payload jsonb nullable, createdAt default now()

auction_results
  auctionId (pk, fk auctions)     -- one result row per auction, written exactly once by close()
  winningBidId nullable (fk auction_bids, restrict)
  winningAmount nullable
  closedAt default now()
```

### Closing model — lazy, idempotent, server-time-only

No background job runner exists in this stack (deliberately — Redis/queues are "introduce when justified," and
nothing yet justifies one). Every read or write on a `live` auction whose `endsAt <= now()` closes it first, in
the same transaction, before doing anything else: compute the winning bid (best `amount` by `biddingDirection`,
ties broken by earliest `createdAt`), insert `auction_results`, set `status = 'closed'`, write an
`auction_events` row. Guarded by `status = 'live'` in the `UPDATE ... WHERE` so a concurrent request never closes
twice — the same idempotent-transition shape as Rental's status guard. A manual "close early" action is the same
function with the `endsAt` check skipped, restricted to the auction's own creator.

### Bid validation (direction-aware, server-time-only)

- `ascending`: `amount >= basePrice` AND `amount > current leading bid` (strictly improves the standing bid).
- `descending`: `amount <= basePrice` AND `amount < current leading bid`.
- Participant must be `approved`. Auction must be `live` (post-lazy-close-check) and `now() <= endsAt`.
- `maxBidsPerParticipant`, if set, caps total bids by that participant.
- Every rejection reason (not approved, auction not live, wrong direction, doesn't improve standing bid, cap
  reached) is a distinct `ValidationError`/`ConflictError` — never a raw DB error.

### From AuctionResult to Award

Auction's job stops at producing a persisted, auditable winner — it does not itself create a Rental. The Renter
(or the winning Rental Company) formalizes the win by creating a `CommercialQuotation` with `sourceAuctionId` set
and terms pre-filled from the winning bid; from there it follows the exact same Award path as any other
quotation. This keeps "run a fair auction" and "create a Rental" as one boundary instead of two entities both
knowing how to produce a Rental.

### Authorization

`auction.manage` — org types `["renter"]` (create/invite participants/approve/reject/close/cancel — all renter
actions on their own auction, since the renter runs the auction they posted the Requirement for).
`auction.participate` — org types `["rental_company"]` (request to join, place bids). Every write additionally
checks the specific auction/participant row belongs to the caller's organization — permission alone is necessary,
never sufficient (mirrors Rental's ownership checks).

## 9. Database summary (new migrations)

```
0008_create_requirements.ts        -- requirements table + rfq.manage/rfq.respond permission seed
0009_create_quotations.ts          -- quotation_responses, commercial_quotations, quotation_offers,
                                       quotation_reference_sequences (per-org counter for referenceNumber) +
                                       quotation.manage/quotation.respond permission seed
0010_create_auctions.ts            -- auctions, auction_participants, auction_bids, auction_events,
                                       auction_results + auction.manage/auction.participate permission seed
```

Each migration's `up`/`down` follows the exact pattern already established in `0006`/`0007` (Kysely schema
builder for tables/columns/FKs/indexes, `sql` template only for the parts Kysely's builder can't express, a
matching seed migration for any new permission in the _same_ migration file so contracts-level and DB-level
declarations can never drift apart again — the exact gap `0007` closed for `rental.manage`).

## 10. Cross-cutting: reference-number sequence

`referenceNumber` needs a per-organization monotonic counter without a read-then-increment race. Use a tiny
`quotation_reference_sequences (organization_id pk, next_value integer not null default 1)` table and
`UPDATE ... SET next_value = next_value + 1 ... RETURNING next_value - 1`, the standard Postgres-safe counter
pattern — no `SELECT MAX(...)` scan, no advisory lock needed.

## 11. What this section deliberately does not add

- No generic "workflow engine" or state-machine framework — every lifecycle here is one `Record<Status,
Status[]>` lookup table, same as Rental/Machine.
- No realtime transport (WebSocket/SSE) for auction bidding in this pass — the frontend polls the auction's
  current standing (bids + time remaining) on an interval, same as the legacy app's polling approach but
  server-validated end to end. Upgrade path noted in the Auction frontend section once built.
- No separate "Award" table/entity — it is a status value plus a service method.
- No automatic Quotation-from-AuctionResult creation — a deliberate manual step (§8, "From AuctionResult to
  Award").

## 12. Implementation order

1. Contracts (`packages/contracts/src/rfq`, `.../quotation`, `.../auction`) + permission codes.
2. `0008` Requirement migration + module (RFQ).
3. `0009` Quotation migration + modules (QuotationResponse, CommercialQuotation, Negotiation share one
   `marketplace/quotation-response` + `marketplace/commercial-quotation` module pair per the existing folder
   split; Negotiation lives inside `commercial-quotation` since it only ever acts on a quotation).
4. `0010` Auction migration + module.
5. Frontend: Requirement create/browse/respond, Quotation create/negotiate/award, Auction create/bid/result —
   reusing `@fleetip/ui` primitives exactly as the Rental page does.
6. Tests at each step (state-machine table tests + service tests with hand-written fakes, matching existing
   convention), then a live E2E pass through all three paths (A/B/C) before moving to Rental Execution/Transport.
