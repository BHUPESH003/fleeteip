# FleetIP redesign plan

Machine Detail v2 is the reference screen for an app-wide redesign.

## Sources, in order of authority

1. This plan. Where it disagrees with the README, the plan wins, because every backend fact below was checked against the code.
2. `design/design_handoff_machine_detail/FleetIP Machine Detail v2.dc.html`: the only high-fidelity screen.
3. `FleetIP UX Pass.dc.html`: app-wide rules, plus written audits for the machines list, register/edit machine, rental detail and the navigation shell.
4. `FleetIP Status.dc.html` and `FleetIP Icon.dc.html`: the status map and the icon paths.

## Rules for every phase

- **No new endpoints, fields or statuses.** Backend needs go into section 7 as tickets, never stubbed.
- `packages/ui` stays domain-free and never imports `@fleetip/contracts`.
- Screens with no design file follow the recipe in section 3, and a designer reviews them before merge.

---

## 1. Backend facts that override the README

| README says | Reality | Build instead |
|---|---|---|
| Reactivate a retired machine | `retired` is terminal: the server returns 409, and a test covers it | Remove the Reactivate item and dialog |
| Send to workshop = 2 writes | `createMaintenance` always creates `scheduled`, so it takes 3 writes. It also returns 409 if a confirmed, active or off_rent rental overlaps the dates | Chain the 3 writes; disable the item with a reason while a rental is booked over those dates |
| "Set return date" | No endpoint writes maintenance `endDate` after creation | Remove the action (ticket a) |
| `checkMachineAvailability` | The function is `apiClient.checkRentalAvailability`. It returns `{available}` only and ignores maintenance | Work out the conflicting rental, earliest free date and workshop overlap in the browser |
| Invoice `overdue` and `balanceDue` | Both come only from `getInvoiceDetail`, which is also what flips an invoice to overdue | Fetch the detail per issued/overdue invoice, or treat `issued` with a past `dueDate` as overdue |
| The backend blocks retire | The server doesn't check rentals | Guard it in the browser, including `off_rent` |
| Hours/day vs `workOrder.workingHours` | `workingHours` is per shift | Label it "per shift" |
| Fuel in "L" | Stored as `fuelConsumed` plus a free-text `fuelUnit` | Send and show the stored unit |
| Spec groups Boom / Pump | Only `boomFamily`, `craneRigging`, `fluids` and `transport` exist | Render only the groups that are filled |
| RN-/MNT-/TR- references | Only `invoiceNumber` and `workOrder.referenceNumber` exist | Keep `RN-${id.slice(0,8)}`; add no MNT/TR numbers |
| "Reference req_…" line, 422 field mapping, stale-write toast | Errors come back as `{error:{code,message}}` with no request id; validation is a single 400 string; there is no `updatedAt` check on writes | Leave these out (tickets e, k) |
| Deployment | Today a confirmed rental counts as "on rent" and `off_rent` is ignored (`machines/lane.ts`, `machines/shared.ts`, dashboard) | Use on_rent (active) / booked (confirmed) / off_rent ("Returning") / available |
| Status colours | The 7 existing maps disagree with the design (for example, cancelled is red in 5 of them) | Use one map (section 2) |

---

## 2. The shared system (Phase 0)

### packages/ui

| Part | Change | Used by |
|---|---|---|
| Icon | new: 48 glyphs from `P`; `name: IconName`, `size`, `label` (announced as an image when given, otherwise hidden from screen readers), `strokeWidth` (2.4 for "more") | everything, including nav |
| Toast | new: `ToastProvider` + `useToast()`. Success/info vanish after 5 s (8 s with Undo); errors stay; max 3; announced politely | all writes |
| ConfirmDialog | new, built on `Dialog`: `role=alertdialog`, icon tile, consequence list, verb on the button, busy state, outlined danger button | retire, workshop, cancel rental, mark off rent, award, cancel invoice |
| AttentionList | new: severity icon, title, context and one action per row; shows 3 then "show N more"; hidden when empty | machine detail, rental detail, operations screens |
| DescriptionList | new: `<dl>` of label/value pairs; null shows "Not specified" | every detail page (replaces the `Field` helper copy-pasted into 10 pages) |
| KeyFigures | new: label, value + unit, context cells (`flex:1 1 180px`) | machine detail, rental detail, operations screens |
| RentalChain | new: ordered list of steps, each with its own status; the next step is highlighted | machine detail, rental detail |
| BulkBar | new: selection count plus actions, replacing the toolbar | machines list and other lists with bulk actions |
| Badge / StatusBadge | extend: square dots for warning/danger, 11px text, `size="sm"`, `variant="label"` (plain uppercase for derived values), `title`. The `{status, map}` API stays | everything |
| Button | extend: `danger-outline`, `busy`, 34×34 icon-only with a required `aria-label` | everything |
| Dropdown | extend: menu roles, `aria-haspopup="menu"`, items with icon, hint and a disabled reason | "More" menus and row menus |
| Tabs | extend: `count`, tablist/tab roles, arrow keys | detail pages |
| Input / Select | extend: `warning` next to `error`, `hint`, `suffix`, "required"/"optional" written out; a searchable Select for the category → product cascade | all forms |
| Drawer | extend: `min(440px,100vw)`, `aria-modal`, Esc, focus return | record drawers, forms |
| AvailabilityLane | extend: clickable blocks, more block kinds, transport markers, logsheet ticks | machine detail, machines list, rentals |
| Table | extend: horizontal scroll with min-width, 44px rows, `aria-sort` on sort buttons, a matching 8-row skeleton | every list |
| ErrorState / EmptyState / Alert | extend: code line and actions for full-page 403/404/500; separate first-run and filtered-empty variants; Alert as a page banner (offline, read-only) | everything |
| Meter | extend: extra tones (idle light blue, overtime amber) | utilization |

### apps/web (shared)

- **`lib/status.ts`:** maps for the 9 design domains (machine, rental, maintenance, invoice, transport, work_order, actual_dates, logsheet, deployment).
  - Each map is written with `satisfies Record<ContractEnum, Entry>`, so a new enum value fails typecheck.
  - `<Status domain value size>` wraps them.
  - It replaces the 7 per-module maps.
  - Domains the design doesn't cover (requirement, quotation, offer, auction, participant, project, membership) get entries that follow the same tone rules: green = done, amber = waiting, red only for money-at-risk, grey = cancelled.
- **`lib/category-icon.ts`:** maps `category.code` to an `IconName`; unknown codes fall back to `machine`.
- **`lib/format.ts`:**
  - money: ₹ with en-IN grouping;
  - dates: "29 Sep 2026" and short "29 Sep";
  - lane months: "1 Sep" and "Jan 2026".
- **`lib/api-client.ts`:** widen `submitLogsheet`, `recordPayment` and `updateTransport` inputs to the contract types (types only).
- **Deployment derivation:** one function in `machines/shared.ts`, used by machine detail, the machines list and the dashboard.
- **Shell:** `components/Sidebar`, `MobileNav` and `Header`.
  - Nav items get icons.
  - The active item gets an orange bar, white text and `aria-current`.
  - Below 1180px the sidebar becomes a 60px icon rail; below 760px it becomes a 48px top bar with a menu.
  - `ToastProvider` is mounted in `(app)/layout.tsx`.

---

## 3. Screen recipe (applies to every screen, including ones with no design)

1. **Status:** only `<Status>`. Stored values render as chips and derived conclusions as plain labels. Never show a value the enum doesn't have.
2. **Icons:** only `Icon`, and always next to a word, except on icon-only buttons, which get a name and a tooltip. Replace unicode glyphs (☰ ✕ ✓ ▲▼).
3. **Actions:** one state-aware primary button per surface. Everything else goes in the "More" menu, where disabled items stay visible and say why.
4. **Problems** go in an `AttentionList`: one row, one action, derived only from data already loaded. Only use it where real derived problems exist. The dashboard keeps `AttentionPanel`/`KpiGrid`, as a past matha decision established.
5. **Figures:** every number has a label and context (`KeyFigures`). No bare numbers.
6. **Tables:**
   - 44px rows; references in mono and never truncated; names clamp to 2 lines with a tooltip.
   - Money is right-aligned.
   - At most one visible row action, the rest in a row menu.
   - An 8-row skeleton while loading, and distinct first-run and filtered-empty states.
7. **Filters** live in the URL, so Back restores them.
8. **Forms:**
   - Errors appear under the field, with the fix in words.
   - Warnings don't block submitting.
   - Required/optional is written out.
   - The submit button shows "Saving…" and can't be double-submitted.
   - A 409 shows inline, names the conflicting record and keeps the input.
9. **Confirmations:** `ConfirmDialog`. The title names the action and the record, the body lists the consequences (including any second write), and the buttons repeat the verb.
10. **Feedback:** success toasts are in the past tense and name the record. Offer Undo only where the reverse call exists. Errors that belong to a field go on the field.
11. **Nulls** read "Not specified". Money and dates use `lib/format.ts`.
12. **Page states:** a skeleton that matches the layout, an offline banner that makes the page read-only, and full-page 403/404/500.
13. **Data:** respect section 1. A missing permission empties a section; it never fails the page.
14. **Tokens** come from `globals.css` only. Accent orange is for the primary button, the selected tab, the next step in the chain and the today line.

---

## 4. Machine detail: the reference screen (Phase 1)

**Files in `app/(app)/machines/[id]/`**
- `page.tsx`: loads data and composes the page. It keeps `?tab=` deep links, resets when the id changes, and keeps the permission fallbacks.
- `derive.ts` and `derive.test.ts`: pure functions for deployment, the primary action, attention rules, key figures per state, lane blocks, chain steps, logsheet coverage, the "is it free" check and the outstanding amount.
- Page components: `MachineHeader`, `AvailabilityCard`, `CurrentRentalCard`, `RecordTabs`, `Aside`, `RecordDrawer`, `LogsheetForm`, `dialogs` (workshop, complete, retire), `MachineDetailSkeleton`.
- Reused: `EditMachineDialog`, and `MaintenancePanel`'s create form.

**Data calls** (all exist already; each is gated by permission)

| When | Call | Permission | Feeds |
|---|---|---|---|
| load | `listMachines` → find by id | equipment.manage | everything; if not found, the 404 page (there is no single-machine GET) |
| load | `listProducts`, `listProductCategories`, `listProductSubcategories` per category | none | model line, category icon |
| load | `listRentals` → filter by `machineId` | rental.manage | deployment, current rental, Rentals tab and lane, retire guard, free check |
| load | `listMaintenanceForMachine` | maintenance.manage | Workshop tab and lane, inspection, attention, free check |
| load | `listTransportRecords` → filter to this machine's rentals | transport.manage | markers, Transport tab, chain, demobilization attention |
| load | `listInvoices` → filter to this machine's rentals | billing.manage | Invoices tab, chain, "raise invoice" attention |
| load | `listWorkOrders` → find by `rentalId` | rental.manage | chain step, working hours |
| load | `getMachineUtilization` | logsheet.manage | Hours logged |
| load | `listRenterOrganizations` | quotation.manage | customer names |
| wave 2 | `listLogsheetsForRental(current)` | logsheet.manage | coverage, missing dates, ticks, Logsheets tab |
| wave 2 | `getInvoiceDetail` per issued/overdue invoice | billing.manage | Outstanding amount, overdue |
| on click | `checkRentalAvailability` | rental.manage | "Is it free?" |

**Writes**

| Action | Calls |
|---|---|
| Submit logsheet | `submitLogsheet` (an upsert; the server needs the rental active and the date inside it, not in the future) |
| Send to workshop | 3 writes, as in section 1 |
| Mark job complete | `updateMaintenanceStatus(completed)` + `updateMachineStatus(active)`, or only the latter if there's no record |
| Retire | `updateMachineStatus(retired)` |
| Edit details | `updateMachine` |

Everything else links to its existing flow.

**Slices** (compare each against the prototype):

| # | Scope |
|---|---|
| 1.1 | Header, "More" menu, attention list, key figures, `derive.ts` + tests |
| 1.2 | Lanes (90 days / 12 months), record drawer, "Is it free?" |
| 1.3 | Current rental card with the chain and terms; record tabs |
| 1.4 | Logsheet form; workshop, complete and retire dialogs; toasts |
| 1.5 | Loading, empty, offline and 403/404/500 states |

**Exit gate:** the design owner signs off Machine Detail as the reference. Any system changes found here go back into Phase 0 parts before Phase 2 starts.

---

## 5. Rollout (Phase 2)

One spec per screen group. Apply the recipe and reuse the Phase 0 parts; only screen-specific pieces stay in the route folder.

| Wave | Screens (routes under `app/(app)/` unless noted) | Design input | Notes |
|---|---|---|---|
| A | `machines` list | UX Pass audit | Status column plus a "Right now" label, 16px category icon, URL filters, bulk bar, two empty states. Server-side filter/sort/paging is ticket l |
| A | Register / edit machine dialogs | UX Pass audit | Category → subcategory → product cascade, product preview, product locked on edit. A duplicate asset code shows the 409 as a form banner (no field path: ticket m) |
| A | `rentals/[id]`, `rentals` list | UX Pass audit | `RentalChain`, terms in contract order, `actual_dates` chip with the dispute reason, explicit transition buttons with the actual date defaulting to today, Mark off rent / Cancel confirms |
| B | `maintenance`, `transport`, `logsheets`, `billing`, `work-orders` (list + detail) | recipe only | Section 1 applies (maintenance end date, lazy overdue, fuel unit). Cancel invoice confirm; recording a payment needs no confirm |
| C | `requirements` (incl. OpenMarket), `quotations`, `auctions`, `projects` | recipe only | Keep the tenant-isolation branch in `requirements/[id]` (a past matha decision). Award confirm. Bulk "Add to quotation" = N calls with a result per row |
| D | Dashboard, `catalogue/*`, `settings`, `unauthorized`, `platform-admin`, `(public)/login`, `signup`, `invite/[token]` | recipe only | Dashboard: icons, status and format only, keeping `KpiGrid` and `AttentionPanel`. Auth pages: form rules only |

**Per-screen done:**
- no ad-hoc status maps, unicode icons or hand-rolled `Field`/`Metric` helpers remain;
- all 14 recipe points pass;
- `pnpm -r typecheck` passes;
- the screen has been checked at 1180px and 760px.

---

## 6. Open decisions (answer before Phase 0)

1. Status maps: `apps/web/lib/status.ts` (recommended) or `packages/ui` (as the README says)?
2. Tests: add Vitest to `apps/web` (only `apps/api` has it), or rely on `satisfies` plus typecheck?
3. Designer review for the recipe-only screens (waves B–D): per screen, or per wave?
4. Categories with no matching glyph (LOADER, and COMPACTOR → roller?): accept the fallback, or ask the designer for glyphs?

## 7. Backend tickets (C): never stub these

a. Endpoint to edit maintenance `endDate`.
b. Availability response that names the conflicting rental and counts maintenance.
c. Single-machine GET and product GET-by-id.
d. `balanceDue` and overdue status on the invoice list.
e. Request id in error responses.
f. `rentalId` on maintenance.
g. `updatedAt` / `createdBy` / `retiredAt` on machine.
h. Document entity.
i. Scheduler for reminders.
j. Changing rental dates.
k. Per-field validation errors and stale-write detection.
l. Server-side list filtering, sorting and paging, including deployment.
m. 409 responses that carry the field path.

## 8. Not yet verified: check at the start of the relevant slice

- Does create-rental accept a preselected machine? (1.1)
- Do list pages keep their filters in the URL? (Wave A)
- What do Drawer and Dialog already do for Esc and focus? (Phase 0)
- What does `format.ts` already cover? (Phase 0)
