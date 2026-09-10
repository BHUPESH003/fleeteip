# FleetIP Rental Domain Design

Status: **Approved**. No blocking open questions. Implementation begins at Step 1 (Authorization model correction) — see §23.

---

## 1. Purpose

Rental represents **the agreed, contracted engagement** between a Rental Company and a customer for a specific physical Machine over a specific period, at agreed commercial and operating terms. It sits downstream of the marketplace (RFQ/Quotation — both future) and upstream of execution (Logsheet — future) and Billing (future). It is the one entity in the whole platform that answers "is this machine currently committed, to whom, on what terms" — a question the legacy system answered incorrectly by mutating the equipment row itself (`fleet1`). Rental replaces that pattern with a real, historized, referenceable record.

Rental does **not** represent a marketplace requirement (RFQ), a priced offer (Quotation Response), a formal commercial document (Commercial Quotation), or a legally distinct contract document — Rental itself _is_ the contractual engagement. There is no separate Contract entity.

---

## 2. Scope

### In MVP

- Rental entity: identity, parties, machine assignment, period, commercial/operating terms snapshot, lifecycle status.
- Machine availability derived from Rental commitments.
- Double-booking prevention — application-level pre-check plus a database-level exclusion constraint, both from first release.
- Direct-client Rental creation by a Rental Company (Flow B — no RFQ/Quotation required).
- Authorization model correction at the shared layer (organization-type-constrained permissions), so Rental (and every domain after it) doesn't need a one-off patch.

### Deferred

RFQ, Quotation Response, Commercial Quotation, Auction, Project entity, Operator domain/FK, Logsheet, Billing, Maintenance interaction, Transport interaction, rental extensions as a distinct concept/entity, advanced availability engine (calendars, resourcing), Redis/realtime, MongoDB, full contract/document management (PDF generation, e-signature, etc.).

None of these are scaffolded, stubbed, or given placeholder fields in this design.

---

## 3. Actors

**Rental Company** — the organization that owns the Machine and drives the transaction. Creates, confirms, activates, off-rents, completes, and cancels Rentals. This is the only actor with real, exercisable actions in MVP.

**Renter** — a FleetIP organization that _may_ be the counterparty on a Rental (via `renterOrganizationId`). In MVP, with RFQ/Quotation not built, a Renter has **no active verb** in the Rental lifecycle — they don't create, confirm, or request anything through this domain yet. At most, a Renter could eventually view Rentals where they are the counterparty, but that's a read-only nicety, not a requirement of this design, and is **not** included in §18's use cases.

**External/non-FleetIP customer** — not an actor in the system sense (no login, no membership, no permission). Represented purely as data (`clientSnapshot`) on the Rental record. Confirmed by legacy evidence: `rentalclients`/`fleeteip_clientlist` describe customers with no corresponding login/session concept anywhere in the schema.

---

## 4. Rental Business Lifecycle

```
confirmed → active → off_rent → completed
    │           │         │
    └────────── cancelled ┘
```

**No draft state — an important implementation interpretation**: creating a Rental means immediately creating a _confirmed commitment_. There is no lower-than-`confirmed` status in which the party, machine, or period could be left unresolved.

```
Create Rental
     ↓
confirmed   ← the machine is already committed from this point
```

This has direct consequences already reflected elsewhere in this document: exactly one of `renterOrganizationId`/`clientSnapshot` must be set at creation (§7), the machine's availability must already be checked and pass _before_ creation succeeds (§9/§10), and commercial terms must already be populated at creation (their only mutable window is while still `confirmed`, §11).

- **confirmed** — the Rental exists with agreed machine, period, and terms, but execution hasn't started. Terms are still editable in this state (§11) — this is the pre-execution correction window.
- **active** — the machine is on-site/in-use, execution has begun. From this point on, commercial/operating terms are locked (§11).
- **off_rent** — demobilization is underway; the machine is being returned but the engagement isn't administratively closed. **`off_rent` blocks availability** (locked decision) — demobilization/return is still in progress, so the machine remains committed until `completed`, even though it may be physically moving off-site.
- **completed** — terminal, successful close.
- **cancelled** — terminal, reachable from `confirmed`, `active`, or `off_rent`. Cancelling an active or off-rent engagement is a real, allowed business event (equipment gets pulled early, a deal falls through) — not restricted to `confirmed` only.

**Valid transitions**: `confirmed→active`, `active→off_rent`, `off_rent→completed`, and `{confirmed,active,off_rent}→cancelled`. Same-state and backward transitions (`active→confirmed`, `completed→anything`) are invalid, mirroring exactly how `Machine`'s `canTransition` already treats `retired` as terminal and same-state transitions as `false`.

**Why "extended" is not a status**: an extension changes `endDate` (and possibly terms) on an _already-active_ Rental — it is a mutation of the record, not a distinct lifecycle state. Introducing `extended` as a status would mean a machine that's simply had its end date pushed out stops looking "active" for every other purpose (availability queries, reporting), which is wrong. This is independent of legacy evidence (legacy has no extension table at all — this is a pure FleetIP design call).

**Labeling**: the state names themselves (`confirmed/active/off_rent/completed/cancelled`) are a **FleetIP recommendation** — the legacy schema gives no reliable status vocabulary anywhere (every status-like legacy column is a bare `varchar`, no enum, no observed values in the structure-only export).

---

## 5. Rental vs Other Business Concepts

| Concept                  | Represents                                                                       | Owner                                | In MVP?               | Connection to Rental                                                       |
| ------------------------ | -------------------------------------------------------------------------------- | ------------------------------------ | --------------------- | -------------------------------------------------------------------------- |
| **Machine**              | Physical asset identity + condition                                              | Equipment module                     | Yes (built)           | Referenced by `machineId` FK; never contains rental state                  |
| **RFQ / Requirement**    | A Renter's open equipment need, broadcast to rental companies                    | Future `rfq` module                  | No                    | Optional upstream trigger; Rental has no FK to it yet                      |
| **Quotation Response**   | One rental company's priced reply to one RFQ                                     | Future `quotation-response` module   | No                    | Optional upstream trigger                                                  |
| **Commercial Quotation** | A formal, addressed commercial document with legal clauses                       | Future `commercial-quotation` module | No                    | Optional upstream trigger; may be issued with or without an RFQ            |
| **Rental**               | The agreed, contracted engagement — machine + party + period + terms + lifecycle | `marketplace/rental` module          | **Yes (this design)** | —                                                                          |
| **Project**              | A Renter's jobsite/initiative that can span multiple rentals                     | Future, no dedicated module          | No                    | Embedded as `projectName`/`projectLocation` text fields on Rental for MVP  |
| **Operator**             | The person operating the machine                                                 | Future `operator`/HR domain          | No                    | Represented only as a minimal `operatorScope` flag on Rental               |
| **Logsheet**             | Per-shift execution record (HMR/KM/fuel)                                         | Future `logsheet` module             | No                    | Will reference Rental by a real FK when built                              |
| **Billing**              | Invoicing/credit notes                                                           | Future `billing` module              | No                    | Will read Rental's commercial-terms snapshot when built, never redefine it |

---

## 6. Rental Entity

| Field                         | Type                                | Required?          | Meaning                                                     | Owner/source                                                             | Notes                                                                                                                                                                                                    |
| ----------------------------- | ----------------------------------- | ------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                          | UUID                                | Yes                | Identity                                                    | System                                                                   | —                                                                                                                                                                                                        |
| `rentalCompanyOrganizationId` | UUID (FK → organizations)           | Yes                | The organization that owns/drives this engagement           | Locked                                                                   | Must be a `rental_company`-type organization — data integrity rule (§21)                                                                                                                                 |
| `renterOrganizationId`        | UUID (FK → organizations), nullable | Conditionally (§7) | The counterparty, when it's a real FleetIP Renter           | Locked                                                                   | Must be a `renter`-type organization when present                                                                                                                                                        |
| `clientSnapshot`              | object, nullable                    | Conditionally (§7) | Immutable snapshot of an external customer's name + contact | `rentalclients` evidence, kept minimal                                   | `{ name (required within), contactPerson?, phone?, email? }`                                                                                                                                             |
| `machineId`                   | UUID (FK → machines)                | Yes                | The assigned physical machine                               | Locked                                                                   | No duplicated make/model/capacity                                                                                                                                                                        |
| `status`                      | enum                                | Yes                | Lifecycle state                                             | FleetIP recommendation (§4)                                              | `confirmed\|active\|off_rent\|completed\|cancelled`                                                                                                                                                      |
| `projectName`                 | string, nullable                    | No                 | Free-text project/jobsite label                             | `epcproject.projectname` evidence, embedded per locked decision          | Not required — not every rental has a named project                                                                                                                                                      |
| `projectLocation`             | string, nullable                    | No                 | Free-text jobsite location                                  | `epcproject`/`workorder` evidence                                        | Same reasoning                                                                                                                                                                                           |
| `startDate`                   | date (no time component)            | Yes                | Agreed start                                                | `workorder.start_date` evidence                                          | **Inclusive** — the rental covers the machine from the start of this date. May be today or a future date; advance booking is supported (§9).                                                             |
| `endDate`                     | date (no time component), nullable  | No                 | Agreed end                                                  | `workorder.end_date` evidence (nullable in legacy too)                   | **Inclusive** — covers the machine through the end of this date. **Null means open-ended**: an ongoing engagement with no committed return date yet, treated as unbounded for overlap purposes (§9/§10). |
| `rate`                        | numeric                             | Yes                | Agreed commercial rate                                      | `workorder.rate` evidence                                                | Mutable while `confirmed`, locked from `active` onward (§11)                                                                                                                                             |
| `rateUnit`                    | enum: `shift\|day\|week\|month`     | Yes                | Billing basis for `rate`                                    | **Decided, not inferred — see §11**                                      | Closed set; no other values for MVP                                                                                                                                                                      |
| `mobilizationCharge`          | numeric, nullable                   | No                 | Mobilization fee                                            | `mob_charges` evidence                                                   | Mutable while `confirmed`, locked from `active` onward                                                                                                                                                   |
| `demobilizationCharge`        | numeric, nullable                   | No                 | Demobilization fee                                          | `demob_charges` evidence                                                 | Same                                                                                                                                                                                                     |
| `paymentTerms`                | text, nullable                      | No                 | Free-text payment terms                                     | `payment_terms` evidence (always varchar, no structure in legacy either) | Same                                                                                                                                                                                                     |
| `shiftStructure`              | text, nullable                      | No                 | Free-text shift description                                 | `shift_wo`/`working_shift_start` evidence                                | Same                                                                                                                                                                                                     |
| `overtimeRate`                | numeric, nullable                   | No                 | OT rate                                                     | `ot_charges`/`ot_payment` evidence                                       | Same                                                                                                                                                                                                     |
| `sundayCondition`             | text, nullable                      | No                 | Free-text Sunday/holiday condition                          | `condition_sundays`/`sundaycondition` evidence                           | Same                                                                                                                                                                                                     |
| `fuelNorms`                   | text, nullable                      | No                 | Free-text fuel terms                                        | `fuel_norms` evidence                                                    | Same                                                                                                                                                                                                     |
| `operatorScope`               | enum, nullable                      | No                 | Minimal operator flag                                       | Locked                                                                   | `with_operator\|without_operator` — recommendation, no Operator FK                                                                                                                                       |
| `noticePeriodDays`            | integer, nullable                   | No                 | Days' notice for termination                                | `notice_period` evidence                                                 | —                                                                                                                                                                                                        |
| `dehireTerms`                 | text, nullable                      | No                 | Free-text de-hire/off-rent terms                            | `dehire` evidence                                                        | —                                                                                                                                                                                                        |
| `createdAt`                   | timestamp                           | Yes                | System                                                      | —                                                                        | —                                                                                                                                                                                                        |
| `updatedAt`                   | timestamp                           | Yes                | System                                                      | —                                                                        | New convention — `Machine` has no `updatedAt` today since its lifecycle is trivial; Rental changes far more over its life                                                                                |

**Fields evaluated and deliberately excluded**: no `createdBy`, no `contractDocumentUrl`, no `invoiceStatus` — none are in the locked field list, none are evidenced as Rental-owned.

---

## 7. Customer / Party Model

Three-way party representation:

- **Rental Company**: `rentalCompanyOrganizationId`, always required, always a real FleetIP organization.
- **FleetIP Renter**: `renterOrganizationId`, nullable — set only when the counterparty actually has a FleetIP account.
- **External customer**: `clientSnapshot`, nullable — set only when there's no FleetIP account for the counterparty.

**Rule**: exactly one of `renterOrganizationId` / `clientSnapshot` must be present for a Rental to exist at all — there's no lower-than-`confirmed` status in which the party could be left unresolved (§4).

**Snapshot semantics**: `clientSnapshot` is captured **once**, at creation, and is **immutable** afterward — it is a record of who the customer was at the time of this specific engagement, not a live-editable profile. It must never grow into a queryable, reusable customer list (§24 risk).

**What must not be duplicated from Organization**: when `renterOrganizationId` is set, Rental must **not** copy the Renter's name/code/type onto itself — those are read through the FK, exactly the same discipline already enforced for `Machine → Product`.

---

## 8. Machine Relationship

`Rental.machineId → Machine.id`, a plain FK, many-to-one from Rental's side: **one Machine, many Rentals over time**. No cardinality constraint at the FK level prevents a machine from having multiple Rental rows — the _business_ invariant (no two overlapping committed Rentals) is enforced separately (§10), because a machine legitimately accumulates rental history (`Rental #1: Jan–Mar, completed`, `Rental #2: Jun–Aug, completed`, `Rental #3: Oct–ongoing, active`) — exactly the history the legacy `fleet1` design destroyed by overwriting rental fields in place.

Ownership: the Machine's `organization_id` should equal the Rental's `rentalCompanyOrganizationId` — a resource-ownership rule, checked in `RentalService`, not a DB constraint.

No Product data (manufacturer, capacity, specifications) is ever copied onto Rental — always read through `machineId → Machine → Product`.

---

## 9. Machine Availability

**Date semantics**: `startDate`/`endDate` are calendar dates with no time component, consistent with the legacy `date`-typed columns. Both are **inclusive** — a Rental with `startDate = Mar 1, endDate = Mar 10` occupies the machine for all of March 1 through March 10. `startDate` may be today or any future date — booking a machine ahead of time is a normal, supported case, not an edge case. A null `endDate` means the engagement is open-ended (no committed return date yet) and is treated as unbounded (+∞) for every overlap calculation below.

**"Is Machine M available for period [reqStart, reqEnd]?"** is answered by a query over Rental, never a field on Machine:

1. **Physical status gate**: `Machine.status` must be `active`. `under_maintenance` and `retired` machines are never available, regardless of Rental commitments.
2. **Commitment gate**: no Rental exists for `machineId = M` with `status IN (confirmed, active, off_rent)` whose inclusive `[startDate, endDate]` range overlaps `[reqStart, reqEnd]`. For two inclusive ranges (treating a null end as +∞), overlap is: `existingStart <= (reqEnd or +∞) AND reqStart <= (existingEnd or +∞)`.
3. **Completed and cancelled Rentals never block** — they're terminal and released.
4. **Future bookings block**: a `confirmed` Rental with a `startDate` next month still counts — it's a real reservation, not a hypothetical.

**`off_rent` blocks availability (locked decision)**: demobilization/return is still underway during `off_rent`, so the machine remains committed until it reaches `completed`. This is a FleetIP design decision, not legacy evidence — the legacy schema shows no explicit off-rent status at all, only the concept via `dehire`/`notice_period`/`demob_charges` fields.

What belongs to Rental now vs. future domains: Rental owns the _commitment_ signal (points 1–4 above, plus the `off_rent` rule). Future domains that could further constrain availability — Maintenance scheduling, Transport (machine in transit) — are **not** modeled here; when they exist, they'll add their own commitment source that an availability query also checks, without requiring Machine or Rental to change.

Machine itself gains **no new field** — availability stays 100% derived, per the locked constraint.

---

## 10. Double-Booking Invariant

**Precise statement**: for a given `machineId`, no two Rental rows with `status IN (confirmed, active, off_rent)` may have overlapping **inclusive** `[startDate, endDate]` ranges (null `endDate` treated as unbounded, per §9).

**This is a first-release integrity requirement, enforced at two levels, not one**:

1. **Application-level pre-check** — `RentalService` runs the availability query (§9) before allowing a create or a `confirmed`-producing transition, rejecting with `ConflictError` and a clear message. This exists for **fast, friendly errors** — most conflicts get caught here before ever touching the database.
2. **Database-level exclusion constraint** — a PostgreSQL range-exclusion constraint (a date-range representation of `[startDate, endDate]`, scoped only to rows with a committed status) is part of the **first Rental migration**, not a deferred follow-up. This is the actual correctness guarantee: double-booking a crane is a real, costly failure mode, and a check-then-insert at the application layer alone has a genuine race window under concurrent requests (two overlapping create calls can both pass step 1 before either commits). The DB constraint closes that window unconditionally, regardless of how many API instances or concurrent requests exist.

**Consequence for implementation**: when the DB constraint rejects an insert/update (a concurrent race that slipped past the application check), `RentalService`/`RentalRepository` must catch that specific constraint violation and translate it into the same `ConflictError` shape the application-level check produces — the client should never see a raw Postgres error. This translation is real work to account for in the migration/repository step (§23), not an afterthought.

**Still not written here**: actual SQL/migration syntax — this document states the _requirement_ and its _shape_ (range type + exclusion constraint, scoped by status), not the literal DDL.

---

## 11. Commercial Terms

**Ownership chain**: Quotation (future) is where terms get _negotiated_. Once negotiation (if any) is done, or once a Rental Company drafts a Rental directly (Flow B), the agreed `rate`, `rateUnit`, `mobilizationCharge`, `demobilizationCharge`, `paymentTerms`, `shiftStructure`, `overtimeRate`, `sundayCondition`, `fuelNorms`, `noticePeriodDays`, `dehireTerms` are captured on Rental.

**Mutability window**: these fields are **editable while `status = confirmed`** — this is the deliberate pre-execution correction window (fixing a typo, adjusting a mobilization charge before the machine leaves the yard, correcting a rate entered wrong at creation). The moment `status` transitions to **`active`**, the terms become an **immutable snapshot** for the remainder of the Rental's life (through `off_rent`, `completed`, or `cancelled`). This is the point future Logsheet/Billing will read from, and it must not change underneath them once execution has started. `confirmed` is the only state in which commercial terms may be edited; every state reachable from `active` onward treats them as read-only. Enforced in `RentalService`, not a DB constraint.

**`rateUnit` — decided, not inferred from legacy**: `shift | day | week | month`.

- **`shift` and `month` are directly grounded in legacy evidence**: `fleet1.hour_shift`/`workorder.shiftinfo` describe shift-based engagements; `linked_equipment.monthly_rental` describes month-based billing. Both bases are real in the source business.
- **`day` and `week` are a deliberate FleetIP addition, not a legacy extraction**: equipment rental businesses standardly bill across the full shift→day→week→month spectrum, and offering only the two extremes observed in the legacy columns would leave an obvious, commonly-needed gap. This is a design decision made explicitly for this reason, not a claim that legacy data showed day/week billing.
- **`hour` is deliberately excluded**: `fleet1.hour_shift` describes the _length of a shift_ (how many hours count as one shift), not a distinct hourly billing basis. Conflating "hours per shift" with "billed per hour" would be a real semantic error — there's no legacy evidence of true hourly billing, and introducing it would blur the meaning of `shiftStructure` (§6) versus `rateUnit`.

This is a closed enum for MVP — no per-organization custom units, no free-text rate basis.

---

## 12. Project / Jobsite

`projectName`/`projectLocation` stay embedded, free-text fields on Rental for MVP — building a full Project entity now would be exactly the premature module the working rules forbid, and nothing in current scope needs cross-rental project rollups. Migration path when a real need appears: add a nullable `Rental.projectId` FK to a new `Project` entity; the embedded text fields become that entity's seed data. This requires no rewrite of Rental itself — purely additive.

---

## 13. Operator

No Operator FK — the Operator/HR domain doesn't exist, and every legacy operator reference (`workorder.operating_crew_select`, `fleet1.operator_fname`, `logsheet.operator_name`) is itself free text with no FK, so there's no legacy precedent for a real relationship either. Minimal representation: `operatorScope: with_operator | without_operator | null` — enough to know whether the rental includes an operator, nothing about _who_. Future Operator integration would add a nullable `Rental.operatorId` FK once that domain exists, following the same additive pattern as Project.

---

## 14. RFQ and Quotation Integration

**Flow A — RFQ-driven** (not built yet): `Renter → RFQ → Quotation Response → Commercial Quotation → Award → Rental`.
**Flow B — Direct client** (what MVP Rental supports today): `Known customer → Commercial Quotation → Award → Rental` — or even more minimally, a Rental Company creates a Rental directly with no Commercial Quotation object at all, since that module isn't built either.

**Should Rental hold nullable `sourceRfqId`/`sourceQuotationId` FKs now?** No. An FK to a table that doesn't exist can't be a real constraint, and adding speculative nullable UUID columns "for later" is the fake-ID pattern the working rules forbid. When Quotation is built, add `Rental.sourceQuotationId` (nullable FK) via a new, additive migration at that time.

---

## 15. Domain Boundaries

`modules/marketplace/rental` (already scaffolded, empty, from Stage 5) owns:

- `domain/` — the `Rental` conceptual shape, the status state machine, and pure availability/overlap logic (inclusive-range formula from §9).
- `application/` — `RentalService`: create, confirm, activate, off-rent, complete, cancel, check-availability use cases; permission + organization-type + resource-ownership + domain-rule checks; the confirmed-only term-mutability rule (§11); the DB-constraint-violation-to-`ConflictError` translation (§10).
- `infrastructure/` — `RentalRepository` implementing `RentalRepositoryPort` via Kysely.
- `presentation/` — `rentalRoutes`.

**Does not belong here**: Product Catalogue, Machine, RFQ, Quotation, Auction, Operator, Maintenance, Transport, Billing, Analytics, Project.

**Dependencies**: Rental's `application/` layer may depend on Equipment's `domain/ports.ts` types (`MachineRepositoryPort`, `MachineRecord`), exactly the precedent already set by `EquipmentService` importing `ProductRepositoryPort` from `catalogue/domain/ports.ts`. Rental must **never** import `equipment/infrastructure/machine-repository.ts` or Kysely types directly.

---

## 16. Database Model (prose)

```
Rental Company Organization   1 ─── N   Rental   (rentalCompanyOrganizationId, required)
Renter Organization           1 ─── N   Rental   (renterOrganizationId, nullable)
Machine                       1 ─── N   Rental   (machineId, required)
```

**Nullable relationships**: `renterOrganizationId` is the only nullable organization FK.

**Expected indexes**: `machineId` (availability queries — the hottest lookup), `rentalCompanyOrganizationId`, `renterOrganizationId` (sparse), `status`, and a composite covering `(machineId, status, startDate, endDate)` for the overlap check.

**Constraints (conceptual, not SQL)**:

- `endDate >= startDate` when present (inclusive dates, §9).
- **The double-booking exclusion constraint — first-release, not deferred** (§10): a range-exclusion constraint over `machineId` + the inclusive date range, scoped to `status IN (confirmed, active, off_rent)`.
- `rentalCompanyOrganizationId` must resolve to a `rental_company`-type organization; `renterOrganizationId`, when present, must resolve to a `renter`-type organization — both via the §17 authorization-model mechanism, applied as a service-level check.

---

## 17. Authorization Model

**The gap, precisely**: `PermissionService.requirePermission(userId, organizationId, permission)` today checks _only_ "does this user's role in this organization grant this permission code" — it has no concept of organization type at all. `role_permissions` is a flat `(role_id, permission_id)` table; `roles` (`owner`/`member`) are shared by every organization regardless of type. This is exactly why a Renter's owner silently held `equipment.manage`. That gap was patched for Equipment specifically with a hand-written `requireRentalCompanyOrganization` check inside `EquipmentService` — correct as a stopgap, but exactly the per-domain repetition this section eliminates.

**Proposed mechanism**: declare, statically, which organization type(s) each `PermissionCode` applies to — a small typed map living next to `permissionCodeSchema` in `packages/contracts`, not a new database table:

```
equipment.manage    → [rental_company]
rental.manage        → [rental_company]
organization.manage → [rental_company, renter]
membership.manage   → [rental_company, renter]
```

`PermissionService.requirePermission` folds this in as one additional step:

1. **User → Membership**: active membership exists for `(userId, organizationId)`? _(existing)_
2. **Membership → Organization → Organization Type**: resolve via `organizationRepository.findWithTypeById` _(already exists — added for the Equipment fix)_.
3. **Organization Type → Permission applicability**: is `permissionCode` declared applicable to this organization type in the static map? If not, `ForbiddenError` — indistinguishable from a missing role-grant.
4. **Role → Permission**: existing `role_permissions` lookup, unchanged.

Steps 5–6 stay **outside** `PermissionService`, per-service:

5. **Resource ownership** — inherently resource-specific; centralizing it would require `PermissionService` to know about every resource type, the generic-framework anti-pattern the working rules forbid.
6. **Business/domain rules** — same reasoning.

**Why this option over scoping `role_permissions` itself by organization type**: that's the more "textbook" fix but requires a real schema/migration change; with exactly 2 organization types and a handful of permissions, it's more machinery than the problem currently needs. Presented as the alternative, not discarded — revisit if per-organization-type-configurable grants become a real requirement.

**Consequence for the current codebase**: `PermissionService`'s constructor gains an `OrganizationRepositoryPort` dependency, rippling to `container.ts` and the fake `PermissionService` construction in both existing test files. `EquipmentService.requireRentalCompanyOrganization` becomes redundant once `equipment.manage` is declared `[rental_company]`-only in the map, and should be deleted. This is Implementation Sequence Step 1 (§23) — it must land before Rental's own `rental.manage` permission is wired up.

---

## 18. API / Use Cases

| Use case                        | Actor                        | Authorization                                  | Key validation/domain rules                                                                                                                              | Affected entities       |
| ------------------------------- | ---------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Create rental                   | Rental Company               | `rental.manage` (rental_company-only, via §17) | Machine belongs to the org, not retired, available for period (inclusive-range check, §9); exactly one of renter/clientSnapshot set; endDate ≥ startDate | Rental                  |
| Get rental                      | Rental Company (owner of it) | `rental.manage`                                | Resource ownership: rental's `rentalCompanyOrganizationId` matches path org — else `NotFoundError`                                                       | Rental                  |
| List rentals                    | Rental Company               | `rental.manage`                                | Scoped to `rentalCompanyOrganizationId`                                                                                                                  | Rental                  |
| Update rental before activation | Rental Company               | `rental.manage`                                | Only while `status = confirmed` — the pre-execution correction window (§11); rejected once `active` or later                                             | Rental                  |
| Confirm→Activate                | Rental Company               | `rental.manage`                                | `canTransition(confirmed, active)`; machine still not retired; **this transition locks commercial terms** (§11)                                          | Rental, (reads) Machine |
| Activate→Off-rent               | Rental Company               | `rental.manage`                                | `canTransition(active, off_rent)`                                                                                                                        | Rental                  |
| Off-rent→Complete               | Rental Company               | `rental.manage`                                | `canTransition(off_rent, completed)`                                                                                                                     | Rental                  |
| Cancel                          | Rental Company               | `rental.manage`                                | `canTransition(current, cancelled)` — allowed from confirmed/active/off_rent only                                                                        | Rental                  |
| Check machine availability      | Rental Company               | `rental.manage`                                | Runs the §9 inclusive-range query, including the `off_rent`-blocks rule                                                                                  | (reads) Machine, Rental |

---

## 19. Frontend Workflow

Built on the existing shell (`(app)/layout.tsx`, `Sidebar`/`Header`, `useSession`), following the exact pattern already established by `/machines`:

- **Rental list** — a new `(app)/rentals/page.tsx`, gated in `NAV_ITEMS` by `requiredPermission: "rental.manage"` + `requiredOrganizationType: "rental_company"` — table of rentals for the current organization, status badge (reusing `@fleetip/ui`'s `Badge`).
- **Rental detail** — machine, party (renter org name or client snapshot), period, terms, lifecycle actions rendered only for the transitions `canTransition` currently allows. Terms editable in the UI only while `status = confirmed` — the form should disable/hide term fields once `active` or later, mirroring §11's rule.
- **Create Rental** — machine selection, customer selection (FleetIP Renter vs. external snapshot), commercial/operating terms fields (including a `rateUnit` select: shift/day/week/month), project/jobsite fields (plain optional text inputs), date pickers presenting `startDate`/`endDate` as plain calendar dates (no time picker — matches §6/§9).
- **Permission-based UI**: lifecycle action buttons only render for users whose session `hasPermission("rental.manage")` is true; the backend remains the actual enforcement point.

No visual/styling design here — reuses the design-system primitives already built.

---

## 20. Legacy Mapping

| Legacy table                                                         | Legacy concept                                   | FleetIP concept                                               | What we keep                                                                                                  | What we discard/change                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `fleet1`                                                             | Equipment master **with rental state bolted on** | Split: `Machine` (identity/condition) + `Rental` (engagement) | The real business fields (rate, shift, OT, Sunday condition, fuel norms, notice period) — relocated to Rental | Rental state living on the equipment row; single-slot/no-history mutation      |
| `fleet`                                                              | Older, simpler equipment master                  | `Machine`                                                     | Confirms equipment identity predates rental-state mixing                                                      | N/A                                                                            |
| `linked_equipment`                                                   | Machine-to-engagement assignment, free text      | `Rental.machineId` FK                                         | The concept of assignment                                                                                     | Free-text make/model/chassis; use real FK                                      |
| `rentallinkedequipment`                                              | Slimmer duplicate of the above                   | (same as above)                                               | Nothing additional                                                                                            | Duplication itself                                                             |
| `rentalclients` / `rentalclient_basicdetail` / `fleeteip_clientlist` | Rental company's private client address book     | `Rental.clientSnapshot`                                       | The minimal identity+contact shape                                                                            | GST/payment-terms/KAM CRM fields — not modeled                                 |
| `epcproject` / `epcprojectcontact`                                   | Renter's project, spans multiple engagements     | `Rental.projectName`/`projectLocation` (embedded)             | The concept that a project exists                                                                             | The entity itself — deferred, not built                                        |
| `workorder`                                                          | The agreed contract/engagement                   | `Rental`                                                      | Terms, period, machine assignment, notice/dehire concept                                                      | `equipment_detail` free text (→ real `machineId` FK); no FK anywhere in legacy |
| `logsheet` / `logsheetnew`                                           | Per-shift execution                              | Future `Logsheet` (not built)                                 | The FK-to-engagement idea, done properly                                                                      | `worefno` free-text reference — will be a real FK when built                   |
| `req_by_epc`                                                         | RFQ requirement                                  | Future `RFQ` (not built)                                      | The requirement concept                                                                                       | Destructive move-and-delete `closed_requirement_epc_latest` pattern            |
| `requirement_price_byrental`                                         | Quotation response                               | Future `QuotationResponse` (not built)                        | The priced-offer concept                                                                                      | —                                                                              |
| `quotation_generated` / `quotation_status`                           | Commercial quotation document + its status       | Future `CommercialQuotation` (not built)                      | The document/clause concept, its independent status                                                           | —                                                                              |

---

## 21. Data Integrity Rules

**Database-enforceable**:

- `endDate >= startDate` when present (inclusive dates).
- `machineId`, `rentalCompanyOrganizationId`, `renterOrganizationId` FKs.
- **The double-booking exclusion constraint — first-release** (§10): no overlapping inclusive date ranges for the same `machineId` among rows with `status IN (confirmed, active, off_rent)`.

**Service/domain-rule-enforced**:

- `rentalCompanyOrganizationId` must resolve to a `rental_company`-type organization (via §17).
- `renterOrganizationId`, when present, must resolve to a `renter`-type organization.
- Exactly one of `renterOrganizationId` / `clientSnapshot` must be set.
- The referenced Machine must belong to `rentalCompanyOrganizationId`.
- The referenced Machine must not be `retired` when confirming/activating.
- No overlapping committed-status Rental for the same machine — application-level pre-check in front of the DB constraint (§10), not the sole enforcement.
- Status transitions only via the legal set in §4.
- Cancellation only from `confirmed`/`active`/`off_rent`.
- Commercial-term fields are mutable only while `status = confirmed`; immutable from `active` onward (§11).
- A DB exclusion-constraint violation (a race that slipped past the pre-check) must be caught and re-raised as the application's own `ConflictError`, never surfaced as a raw Postgres error (§10).

---

## 22. Deferred Decisions

Not decided, not implemented, not stubbed in this design: RFQ, Quotation Response, Commercial Quotation, Auction, Project entity, Operator entity/FK, Logsheet, Billing, Maintenance interaction, Transport interaction, rental extensions as a distinct entity, full contract/document management, an advanced availability/resourcing engine, Redis/realtime, MongoDB.

No unresolved business semantics remain — `rateUnit` (§11) and the `off_rent`-blocks-availability rule (§9) are both decided.

---

## 23. Implementation Sequence

1. **Authorization model correction** — add the organization-type-applicability map (§17), thread `OrganizationRepositoryPort` into `PermissionService`, update `container.ts` and both existing test fakes, delete `EquipmentService.requireRentalCompanyOrganization` once `equipment.manage` is declared in the map. _Understand first_: the full current `PermissionService`/`requirePermission` call chain and every existing call site.
2. **Contracts** — `packages/contracts/src/rental/index.ts`: `rentalStatusSchema`, `rateUnitSchema` (`shift|day|week|month`), `clientSnapshotSchema`, `createRentalRequestSchema`, `rentalSchema`, transition-request schemas, plus `rental.manage` in `permissionCodeSchema`.
3. **Database design/migration** — the `rentals` table per §16/§21, **including the exclusion constraint in this same first migration**. _Understand first_: how the inclusive `[startDate, endDate]` convention (§9) maps to a Postgres range type, and how the constraint scopes to `status IN (confirmed, active, off_rent)` specifically (not all rows).
4. **Repository** — `RentalRepository` implementing `RentalRepositoryPort`, including the overlap-check query (§9) and translating an exclusion-constraint violation into `ConflictError` (§10). _Understand first_: the existing `MachineRepository` as the direct pattern to mirror, plus how Kysely/`pg` surfaces a Postgres constraint-violation error so it can be pattern-matched reliably.
5. **Domain/application service** — `RentalService`: lifecycle transitions (table-tested like `machine-status.test.ts`), the confirmed-only term-mutability rule (§11), availability check, ownership checks, permission checks. _Understand first_: `EquipmentService`'s exact structure as the template.
6. **API routes** — `rentalRoutes`, mirroring `equipmentRoutes`'s shape.
7. **Tests** — state-machine table test + service test with hand-written fakes, mirroring `equipment-service.test.ts`, plus a dedicated overlap-rejection test (pre-check path, and the DB-constraint path if feasible against a real test DB), and a term-mutability test (edit allowed while confirmed, rejected once active).
8. **Frontend** — §19.
9. **End-to-end verification** — the same live curl rhythm used for Equipment: cross-org isolation, illegal transition rejection, overlap rejection (verify the actual DB constraint fires under a forced-race scenario, not just the application pre-check), term-edit-rejected-after-activation, camelCase response shape.

---

## 24. Architecture Risks

- **Duplicated commercial logic** — if Logsheet/Billing ever redefine rate/terms instead of reading Rental's locked snapshot, the §11 discipline breaks silently.
- **Constraint-violation error translation gap** — the DB exclusion constraint is first-release; failing to catch and translate its violation to `ConflictError` would leak a raw Postgres error to the client.
- **Customer snapshot creeping into a hidden customer master** — if `clientSnapshot` starts getting updated in place, deduplicated, or searched across rentals, it has quietly become the CRM entity this design explicitly avoided building.
- **Permission model drift** — if Step 1 (§23) is skipped and Rental gets its own ad hoc patch instead, the exact problem this document exists to close repeats a third time.
- **Premature Project/Operator domains** — the embedded-fields approach only stays cheap if nobody starts adding query/filter/reporting logic against `projectName` as if it were a real entity.
- **Legacy concepts leaking in** — reaching for `worefno`-style free-text references instead of real FKs.
- **Term-mutability boundary bugs** — since terms are conditionally editable (confirmed only) rather than always-immutable or always-mutable, this is a real branch to get right in both the API (reject writes once active) and the UI (disable fields once active) — worth explicit test coverage (§23 step 7).

---

## 25. Final Locked Decisions

- Rental is the agreed engagement; no separate Contract entity/module.
- RFQ and Quotation are optional and not required to exist before Rental.
- `machineId` is a real FK; Machine carries no rental/commercial state; availability is fully derived.
- Lifecycle: `confirmed → active → off_rent → completed`, `cancelled` from any non-terminal state; `extended` is not a status.
- No draft state — creating a Rental is immediately a `confirmed` commitment.
- Dates are calendar dates, inclusive on both ends; null `endDate` means open-ended; advance booking is supported.
- `off_rent` blocks availability — the machine stays committed until `completed`.
- `rateUnit`: closed enum `shift | day | week | month` — decided, not legacy-inferred; `hour` excluded to avoid conflating with `shiftStructure`.
- Commercial terms are mutable only while `status = confirmed`; immutable from `active` onward.
- No overlapping committed-status Rentals per machine — enforced by a PostgreSQL exclusion constraint shipped in the first Rental migration, backed by an application-level pre-check for fast, friendly errors.
- Machine-availability checks require `rental.manage`.
- Party model: `rentalCompanyOrganizationId` (required) + `renterOrganizationId` (nullable) + `clientSnapshot` (nullable, immutable, minimal fields) — exactly one of the latter two present.
- Project/jobsite and operator scope stay embedded/minimal — no new modules.
- Authorization: organization-type constraints on permissions move to a shared, declarative mechanism in `PermissionService` (§17) — not repeated per-domain patches. This is its own implementation checkpoint (§23 Step 1), completed and verified before any Rental-specific code.
