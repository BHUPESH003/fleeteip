# Execution & billing domains — Maintenance, Transport, Logsheets, Utilization, Billing

Status: locked (autonomous build — see `docs/autonomus-building-instructions.md`). Completes the MVP scope list
(§10) beyond the marketplace core loop (`docs/marketplace-core-loop-design.md`).

## 1. Why these five together

Each attaches to an already-real entity (Machine or Rental) rather than to each other, so — unlike the marketplace
loop — they don't need one shared schema decided up front. Grouped in one document only because they round out
the same MVP-scope checklist and share two structural choices worth stating once: (a) Rental Execution (§15) and
Transport/Mobilization (§20) are **one module, not two** — see §3; (b) Utilization (§17) is a **read-only report,
not a new writable entity** — see §5.

## 2. Maintenance

```
maintenance_records
  id
  machineId            -- fk machines, cascade
  maintenanceType       -- 'scheduled' | 'breakdown' | 'inspection' | 'other'
  startDate             -- date
  endDate               -- date, nullable — null means ongoing/open-ended, same convention as Rental
  status                -- 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  notes                 -- nullable text
  createdAt / updatedAt
```

Status lifecycle: `scheduled -> in_progress -> completed`; `scheduled|in_progress -> cancelled`. Committed statuses
(block availability) are `scheduled`/`in_progress` — the same "committed vs. terminal" split Rental already uses.

### Availability integration (the reason this domain comes first)

"A machine under maintenance should not become available for a conflicting rental" (§19) and, symmetrically, a
machine already committed to a Rental shouldn't be schedulable for conflicting maintenance. Rather than inventing
a cross-table DB constraint (Postgres can't `EXCLUDE` across two tables) or rewriting `RentalRepository.isAvailable`
(already tested, in production use), both directions are enforced at the **application layer** via one new
cross-module repository-port dependency each way — the same "read the other module's port, never its service or
its Kysely" pattern already used for `EquipmentService` reading `catalogue`'s ports:

- `RentalService` gains a `MaintenanceRepositoryPort` dependency and calls its new `hasOverlappingMaintenance
(machineId, startDate, endDate)` before confirming a new Rental and before transitioning one to `active` — the
  same two checkpoints that already re-verify `machine.status !== "retired"`.
- `MaintenanceService` reuses the **existing** `RentalRepositoryPort.isAvailable(...)` (already checks
  confirmed/active/off_rent overlap) before scheduling maintenance — no new method needed on that side.

This is app-level-only, not DB-enforced across tables — a deliberate, documented gap. Rental's own exclusion
constraint still guards the truly adversarial case (two different customers double-booking); Maintenance is a
self-service action by the same Rental Company against its own asset, materially lower risk if a rare race ever
produces an overlap. `// ponytail: app-level cross-check only; a real cross-table constraint would need a
generated shared "commitments" table — add one if a real double-booking-via-maintenance incident ever happens.`

Permission: `maintenance.manage` — org types `["rental_company"]`.

## 3. Transport / Mobilization (one module for §15 and §20)

Rental already owns the "on rent / off rent" lifecycle via its own status machine
(`confirmed -> active -> off_rent -> completed`) — Transport does not duplicate that. What Transport actually adds
is the **logistics data** for the two physical legs bookending a Rental: getting the machine _to_ site
(mobilization) and getting it _back_ (demobilization).

```
transport_records
  id
  rentalId              -- fk rentals, cascade
  leg                    -- 'mobilization' | 'demobilization'
  pickupLocation / destination   -- nullable text
  plannedDate / actualDate       -- nullable date
  status                  -- 'planned' | 'dispatched' | 'delivered' | 'cancelled'
  transportDetails         -- nullable text (vehicle/driver, free text)
  charges                   -- nullable numeric
  notes                     -- nullable text
  createdAt / updatedAt
  unique (rentalId, leg)     -- at most one record per leg per Rental
```

Status lifecycle: `planned -> dispatched -> delivered`; `planned|dispatched -> cancelled`. Deliberately **not**
wired to auto-drive Rental's own status (e.g. "mobilization delivered" does not auto-flip Rental to `active`) —
that stays a manual `RentalService.updateRentalStatus` call, keeping the two state machines decoupled per the
locked rule that Rental's lifecycle is already complete and not to be rebuilt around a new domain's needs.

Permission: `transport.manage` — org types `["rental_company"]`.

## 4. Logsheets

```
logsheets
  id
  rentalId                -- fk rentals, cascade
  machineId                -- fk machines, restrict — denormalized from rentals.machine_id for §17's
                               "machine-level history" queries (avoids joining through rentals for every report)
  logDate                  -- date
  shift                     -- nullable text (free text, same style as Requirement's shiftRequirement)
  operatingHours / idleHours / overtimeHours   -- nullable numeric
  operatorName               -- nullable text — no separate Operator module in MVP (deferred scope, §40)
  fuelConsumed / fuelUnit      -- nullable numeric / text
  remarks                       -- nullable text
  customerConfirmed               -- boolean, default false
  createdAt / updatedAt
  unique (rentalId, logDate)        -- one logsheet per Rental per day
```

`customerConfirmed` is rental-company-attested (a checkbox the crew ticks once the customer has verbally/on-paper
confirmed) rather than a separate Renter-facing confirmation action.
`// ponytail: self-attested confirmation; add a real Renter-side confirm endpoint if that becomes a genuine need.`

Permission: `logsheet.manage` — org types `["rental_company"]`.

## 5. Utilization — a report, not an entity

No new table. `UtilizationService` computes aggregates on read from `logsheets` + `rentals`:

- Per-Rental: total days elapsed, total operating/idle/overtime hours, day-count with a logsheet vs. without.
- Per-Machine: the same, summed across every Rental that machine has ever had — "machine-level history" (§17).

Nothing is denormalized or cached; MVP scale doesn't justify it, and a derived number that could silently drift
from its source rows is worse than a slightly slower aggregate query.

## 6. Billing / Payments

```
invoices
  id
  rentalCompanyOrganizationId   -- fk organizations, cascade
  rentalId                       -- fk rentals, restrict
  invoiceNumber                   -- text, per-org sequence: INV-{year}-{n}, same race-free counter-table
                                      pattern as quotation_reference_sequences (a second, separate sequence
                                      table — not generalized into one shared multi-document-type table until a
                                      third document type needs numbering)
  billingPeriodStart / billingPeriodEnd   -- date
  status                            -- 'draft' | 'issued' | 'paid' | 'overdue' | 'cancelled'
  subtotal                           -- numeric, sum of line items
  taxAmount                           -- numeric, default 0 — a plain entered amount, not a computed
                                          country-specific tax engine (§18 explicitly rejects hard-coding one
                                          country's tax system; this keeps it "extensible" the cheap, honest way)
  adjustmentAmount                     -- numeric, default 0 (may be negative = discount, positive = surcharge)
  totalAmount                           -- numeric = subtotal + taxAmount + adjustmentAmount, computed app-side
  dueDate                                 -- date
  notes                                     -- nullable text
  createdAt / updatedAt

invoice_line_items
  id, invoiceId (fk invoices, cascade), description, quantity, rate, amount (= quantity * rate, app-computed),
  createdAt

payments
  id, invoiceId (fk invoices, cascade), amount, paidDate, method (nullable text), reference (nullable text),
  notes (nullable text), createdAt
```

Status lifecycle: `draft -> issued|cancelled`; `issued -> paid|overdue|cancelled`; `overdue -> paid|cancelled`;
`paid`/`cancelled` terminal. `overdue` is a lazy transition (touched on read, same shape as Auction's close /
Quotation's expiry): `issued` and `dueDate < today` and not yet fully paid. `paid` is a deterministic transition,
not lazy: `recordPayment` inserts the payment row, then if `sum(payments) >= totalAmount`, flips status to `paid`
in the same call. `amountPaid`/`balanceDue` are computed at read time from the payments sum, never stored
redundantly. Invoices only ever _read_ their source Rental — nothing here ever writes back to `rentals`, so
"billing must not silently change historical Rental terms" (§18) holds by construction, not by convention.

Permissions: `billing.manage` — org types `["rental_company"]` (issue invoices, record payments, on their own
Rentals only). `billing.respond` — org types `["renter"]` (read-only: view invoices for Rentals where
`renterOrganizationId` matches — an external `clientSnapshot`-party Rental has no FleetIP Renter to show invoices
to, same limitation already accepted for Quotation rejection).

## 7. Migrations

```
0011_create_maintenance.ts      -- maintenance_records + maintenance.manage permission seed
0012_create_transport.ts        -- transport_records + transport.manage permission seed
0013_create_logsheets.ts        -- logsheets + logsheet.manage permission seed
0014_create_billing.ts          -- invoices, invoice_line_items, payments, invoice_reference_sequences +
                                    billing.manage/billing.respond permission seed
```

(Utilization needs no migration — it is query-only.)

## 8. Implementation order

Maintenance first (the Rental-availability integration is the only architecturally load-bearing piece left in the
MVP scope). Then Transport, Logsheets, Utilization, Billing — each is a self-contained attach-to-Rental domain
with no further cross-cutting design decisions, so they follow the same four-layer shape without needing their
own design round.
