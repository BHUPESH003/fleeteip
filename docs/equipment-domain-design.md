# Equipment domain — design walkthrough

Status: design locked, contracts not yet updated. `apps/api/src/modules/equipment/index.ts` is still the Stage 5 stub.

**Revision history**:
1. Per-organization Machine Model → superseded by a platform-level Product Catalogue (matha decision `1788857313985-dcf5cb2a59ec8446`).
2. Minimal 4-field Product skeleton → superseded by the richer catalogue design below, after inspecting the legacy schema (116-page phpMyAdmin export) and a representative production data sample (`oem_fleet`, `fleet1`, `images`). Recorded in matha as `1788884744636-b425c76f30890b93`, superseding decision 1.

Grounded in what's actually in the repo: `apps/api/src/modules/organizations/*`, `permissions/*`, the `0001`/`0002` migrations, and `packages/contracts/src/organization`. The module split below follows the same four-layer shape (`domain/ports.ts` → `application/*-service.ts` → `infrastructure/*-repository.ts` → `presentation/routes.ts`), wired through `infrastructure/container.ts`.

One open decision remains (the module split in §2, unchanged from before). Everything else in this document reflects locked, owner-approved decisions.

---

## 1. Business objective

A Rental Company needs an auditable registry of the physical machines it owns, so later domains (Rental, RFQ, Quotation) have something concrete to attach a booking or a quote line to. Equipment is a **system of record**, not a booking engine — it answers "what do we own and is it usable," never "is it free on March 12." That second question belongs to the Rental domain later and must not leak in here.

The Product Catalogue exists so that Rental Companies register machines against a shared, curated specification instead of each hand-typing their own "Caterpillar 320" — and so a future OEM domain has one place to plug into instead of thousands of per-tenant duplicates.

## 2. Domain concepts involved

- **ProductCategory** — top-level taxonomy (Crane, Concrete Equipment, Aerial Work Platform...). Platform-wide, ownerless.
- **ProductSubcategory** — second taxonomy level (Hydraulic Crawler Crane, Pick and Carry Crane, under Crane). **Locked**, not just recommended — confirmed by real legacy data where every subcategory value mapped to exactly one category with zero cross-category leakage across a 118-row sample. Belongs to exactly one `ProductCategory`.
- **Product** — a catalogue specification: manufacturer + model name + capacity + category-specific specs, under a Subcategory. Platform-level, no `organization_id`. The catalogue's unit of truth, not something any single Rental Company owns.
- **Machine** — the physical asset: one serial-numbered thing a Rental Company owns, registered against a catalogue `Product`. Has no `manufacturer` field of its own — manufacturer is a Product-level fact, reached via `machine.productId → product.manufacturer`, never duplicated onto Machine.

### Open decision — one module or two?

Unchanged from the prior revision.

| | One module (`modules/equipment`) | Split (`modules/catalogue` + `modules/equipment`) |
|---|---|---|
| Matches today's scaffold | Yes, zero new folders | No, one new module folder |
| Matches where OEM will eventually plug in | Catalogue and Machine stay entangled | Catalogue is already its own seam — OEM later reads/writes `catalogue`, never touches `equipment` |
| Cost now | None | Trivial — folder + port split, no extra runtime complexity |

**Recommendation: split.** `modules/catalogue/` owns `ProductCategory`/`ProductSubcategory`/`Product` (read-only in MVP). `modules/equipment/` owns `Machine`, and depends on `catalogue`'s repository ports to validate a `productId` exists — the same kind of cross-module read dependency `permissions` already has on `organizations`.

## 3. Entities & relationships

```
ProductCategory 1───N ProductSubcategory 1───N Product 1───N Machine N───1 Organization
```

`ProductCategory` is not referenced directly by `Product` — it's reached by joining through `ProductSubcategory`, since a subcategory already determines its category and storing both FKs on `Product` would be redundant, out-of-sync-prone denormalization.

`Product` carries the catalogue **specification** (identity, capacity, category-specific specs). `Machine` carries the **physical instance** attributes (asset code, chassis number, registration, year, operational status). Catalogue spec and physical asset stay two different tables with different lifecycles and different owners.

## 4. Database changes

```
product_categories
  id uuid pk
  code text unique
  name text
  created_at timestamptz

product_subcategories
  id uuid pk
  product_category_id uuid fk -> product_categories.id, on delete restrict
  code text
  name text
  created_at timestamptz
  unique (product_category_id, code)   -- unique within its parent category, not globally

products
  id uuid pk
  product_subcategory_id uuid fk -> product_subcategories.id, on delete restrict
  manufacturer text
  name text
  capacity numeric nullable
  capacity_unit text nullable          -- constrained set at the Zod layer, NOT free text
  specifications jsonb nullable        -- category-specific technical + transport specs, grouped
  created_at timestamptz
  unique (manufacturer, name)          -- global dedup — meaningful now that Product is shared

machines
  id uuid pk
  organization_id uuid fk -> organizations.id, on delete cascade
  product_id uuid fk -> products.id, on delete restrict
  asset_code text
  chassis_number text nullable         -- added: legacy evidence confirms per-unit, never per-model
  registration_number text nullable
  year_of_manufacture integer nullable
  status text                -- 'active' | 'under_maintenance' | 'retired'
  created_at timestamptz
  unique (organization_id, asset_code)
```

No `organization_id` anywhere in the catalogue chain (`product_categories`/`product_subcategories`/`products`) — that's the whole point of the redesign. `on delete restrict` throughout the catalogue chain means nothing referenced by a `Machine` can be silently orphaned by a catalogue change.

**Why `capacity`/`capacity_unit` are relational, not jsonb**: confirmed by the data sample — 117 of 118 real capacity values were plain numbers, and it's the dominant marketplace filter/sort field. `capacity_unit` must be validated against a fixed set at the contract layer specifically because the legacy sample showed the same unit (cubic meters) stored as both `M³` and `m^3` — free text would reproduce that exact bug.

**Why `specifications` is jsonb, grouped not flat**: legacy's `fleet1`/`oem_fleet` spread ~19 category-specific spec fields as flat nullable columns, mostly empty for any given row depending on category. Real co-occurrence in the sample supports grouping by fact-cluster, not by one flat bag: `boomFamily` (boomLength/jibLength/luffingLength), `craneRigging` (wireRope, counterWeight, boomSection, ...), `fluids` (tank capacities, oil grades), `transport` (length/width/height/weight).

**Explicitly deferred, not included**: chassis manufacturer (legacy `chassis`/`chassis_make`). Real data showed one genuine conflicting-value example for the same make/model (`Ashok Leyland` vs. `MAN`), enough to disprove "always fixed by the model" but not enough to confirm systemic variance from a ~118-row sample. Left off both `Product` and `Machine` pending a direct business answer to: *does chassis manufacturer ever vary between two physical units of the identical catalogue Product?*

**Optional, still your call**: `products.is_active boolean not null default true`, to retire a stale catalogue entry without breaking existing `Machine` references. Not load-bearing yet since the catalogue is seed-only.

## 5. Migration plan

**Practical note before this section applies**: `0003`–`0005` already exist in the repo and have been applied to your local dev database with the old 4-field `Product` shape. Per the project's own rule (never edit an applied migration, add a new one — already documented in `infrastructure/database/migrate.ts` and in matha), the strict path is new additive migrations (`0006`+) that `alterTable` the existing `products`/`machines` tables and `createTable` for `product_subcategories`. The pragmatic alternative — since these three migrations have never left your local dev environment, represent design churn during initial buildout rather than a shipped schema, and were written before this catalogue analysis existed — is to rewrite `0003`–`0005` in place and re-run `migrate:down`/`migrate` locally. Both are defensible; I'd lean toward rewriting in place *this one time* given how early this still is, but flagging it as your call, not mine, since it's a direct exception to a rule you specifically wanted enforced.

Either way, the migrations needed:

- `product_categories`, `product_subcategories`, `products` (with `capacity`/`capacity_unit`/`specifications`) — schema.
- `machines` (with `chassis_number` added) — schema.
- Seed: `product_categories` + `product_subcategories` + a curated starter `products` set (now includes real `capacity`/`capacity_unit` values, dedup-checked against the global `unique(manufacturer, name)`), insert `equipment.manage`, grant to `owner`.

## 6. Repository interfaces

`modules/catalogue/domain/ports.ts` — **read-only** in MVP:

```ts
export interface ProductCategoryRepositoryPort {
  listAll(): Promise<ProductCategoryRecord[]>;
  findById(id: string): Promise<ProductCategoryRecord | undefined>;
}

export interface ProductSubcategoryRepositoryPort {
  listByCategory(categoryId: string): Promise<ProductSubcategoryRecord[]>;
  findById(id: string): Promise<ProductSubcategoryRecord | undefined>;
}

export interface ProductRepositoryPort {
  listAll(subcategoryId?: string): Promise<ProductRecord[]>;
  findById(id: string): Promise<ProductRecord | undefined>;
}
```

`modules/equipment/domain/ports.ts` — unchanged shape, now includes `chassisNumber`:

```ts
export interface MachineRepositoryPort {
  create(input: { organizationId: string; productId: string; assetCode: string; chassisNumber?: string; ... }): Promise<MachineRecord>;
  findById(id: string): Promise<MachineRecord | undefined>;
  listByOrganization(organizationId: string): Promise<MachineRecord[]>;
  updateStatus(id: string, status: MachineStatus): Promise<MachineRecord>;
  assetCodeExists(organizationId: string, assetCode: string): Promise<boolean>;
}
```

## 7. Domain rules

- **`productId` must resolve to a real catalogue entry** — checked via `ProductRepositoryPort.findById` in the use case.
- **Asset code uniqueness is per-organization**, not global — enforced by the DB unique constraint, pre-checked in the use case for a clean `ConflictError`.
- **Status is a closed state machine, not a free-form field**: `active ⇄ under_maintenance`, `active | under_maintenance → retired` (terminal). One pure `canTransition(from, to): boolean` guard, unit-tested directly.
- **No cross-tenant reference-integrity check needed** — `Product` isn't tenant data, so there's nothing to cross-check against `organizationId`. Any org may reference any `Product`.

## 8. Application / use cases

```
CatalogueService (modules/catalogue/application)
  listCategories()
  listSubcategories(categoryId)
  listProducts(subcategoryId?)

EquipmentService (modules/equipment/application)
  createMachine(userId, organizationId, input)
    - requirePermission(userId, organizationId, "equipment.manage")
    - verify productId exists (via ProductRepositoryPort)
    - assetCodeExists check
    - create
  updateMachineStatus(userId, organizationId, machineId, newStatus)
    - requirePermission(...), load machine, verify org ownership, canTransition, persist
  listMachines(userId, organizationId)
    - requirePermission(...)
```

## 9. API endpoints / contracts

`packages/contracts/src/catalogue/index.ts` — needs real revision from its current 4-field state:

- `productCategorySchema` — `id`, `code`, `name`, `createdAt`. Unchanged.
- `productSubcategorySchema` — **new**: `id`, `productCategoryId`, `code`, `name`, `createdAt`.
- `productSchema` — revised: `id`, `productSubcategoryId` (replaces `productCategoryId`), `manufacturer`, `name`, `capacity` (nullable number), `capacityUnit` (nullable, constrained enum — not `z.string()`), `specifications` (nullable object, grouped shape per §4), `createdAt`.

`packages/contracts/src/equipment/index.ts` — needs one addition:

- `createMachineRequestSchema` / `machineSchema` — add `chassisNumber` (nullable/optional, matching the pattern already used for `yearOfManufacture`).

Routes — unchanged in shape, one addition for the new taxonomy level:

```
GET   /product-categories
GET   /product-categories/:id/subcategories
GET   /products?subcategoryId=...
GET   /organizations/:organizationId/machines
POST  /organizations/:organizationId/machines
PATCH /organizations/:organizationId/machines/:machineId/status
```

## 10. Authorization requirements

Unchanged from the prior revision — `equipment.manage` gates all `Machine` writes; catalogue curation (now including `ProductSubcategory`) stays migration-only with no runtime write endpoint and no platform-admin concept in MVP.

## 11. Frontend responsibilities

Machine-registration form becomes a three-step cascade: `ProductCategory` → `ProductSubcategory` → `Product` (all read-only `GET` endpoints, no creation UI) → physical-instance fields (asset code, chassis number, registration, year) → submit.

## 12. Testing strategy

Unchanged pattern (hand-written fakes, no mocking library). Add: a `canTransition` table-driven suite; `EquipmentService` tests covering unknown-product rejection, duplicate-asset-code rejection, illegal-transition rejection, and the cross-org-shared-Product happy path; `CatalogueService` tests stay close to trivial.

## 13. Recommended implementation order

1. `packages/contracts/src/catalogue` (revised) + `packages/contracts/src/equipment` (add `chassisNumber`).
2. Migrations — either rewritten `0003`–`0005` or new `0006`+ (§5's call to make).
3. `modules/catalogue` (ports for all three entities, read-only repositories, service).
4. `modules/equipment` domain (`canTransition` + tests, ports with `chassisNumber`).
5. `modules/equipment` infrastructure (`MachineRepository`).
6. Seed migration (categories, subcategories, curated products with real capacity/spec data).
7. `EquipmentService` + tests.
8. Wire into `infrastructure/container.ts`.
9. Routes, registered in `app.ts`.
10. Frontend cascade picker + machine registration.

## 14. Common mistakes to avoid

- Don't add `organization_id` to any catalogue table.
- Don't leave `capacityUnit` as unconstrained free text — the `M³`/`m^3` split is proven real, not hypothetical.
- Don't flatten `specifications` into ~19 individual columns — that's reproducing the exact legacy anti-pattern this redesign exists to avoid.
- Don't add `chassis_manufacturer` to either schema yet — genuinely deferred pending a business answer, not an oversight.
- Don't store both `product_category_id` and `product_subcategory_id` on `Product` — category is reachable via the subcategory join.
- Don't build any catalogue write endpoint in MVP.
- Don't add a `rental_status`/`availability` field to `machines`.

## 15. How to verify

1. `pnpm typecheck && pnpm lint && pnpm test` clean.
2. Fresh DB: migrations apply and reverse cleanly.
3. Manual round trip: two different organizations both successfully create a `Machine` referencing the same seeded `Product`; illegal status transition rejected; duplicate asset code within one org rejected.
4. `SELECT` a seeded Product's `specifications` back out and confirm it round-trips as the grouped object shape, not a flat bag.
5. Grep checks: `grep -rl kysely apps/api/src/modules/{catalogue,equipment}` only matches `infrastructure/`; `grep -rl organization_id apps/api/src/modules/catalogue` returns nothing.
