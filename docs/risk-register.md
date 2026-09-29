# FleetIP risk register: what to keep an eye on

This list covers what can break the app, leak data, or corrupt records if nobody
watches it. It's ordered by how badly each item can hurt. Each entry says what
the risk is, why it matters, and what to do about it. Last reviewed 2026-09-29.

Related docs:
- `docs/frontend-backend-gap-report.md`: missing backend capabilities.
- `docs/redesign-plan.md` §1: backend facts the UI depends on.
- `docs/frontend-conventions.md`: how forms, errors and enums are written.

---

## 1. Release blockers (fix before any real customer uses it)

| # | Risk | Why it matters | Action |
|---|---|---|---|
| 1.1 | **Uncommitted work.** Everything up to 2026-09-29 is now committed on `main`. A snapshot of the Kiro state is kept at `refs/kiro-snapshot`. | Unreviewed changes can hide regressions. | Review the commits. Delete `refs/kiro-snapshot` once you're happy. |
| 1.2 | **Emails aren't sent.** `LogMailer` writes password-reset links, which are live credentials, into the API log. | Anyone with log access can take over an account. Users can't reset passwords at all. | Build the planned SES + SQS mail system. Until then, keep production logs locked down or turn reset off. List every email the product needs first: invites, reset, quotation and rental events. |
| 1.3 | **No file or document storage.** There's nowhere to keep logsheet photos, signed work orders, invoices, machine documents (RC, insurance, fitness) or images. | Operations will fall back to WhatsApp and email, and records lose their evidence. Retrofitting storage later touches many screens. | Design it before more screens assume "no attachments". Use S3 with presigned uploads, tenant-scoped keys (`org/<id>/…`), an allow-list of file types with a size cap, a virus scan, and an `attachments` table linked to the owning record. |
| 1.4 | ~~Rate limiting covers only auth.~~ **Addressed:** a global limit of 300/min, plus 10/min by IP on auth routes. | Limits that are too strict can block real offices behind one NAT IP. | Tune them after launch from the 429 counts. |

## 2. Data integrity: records that can end up wrong

| # | Risk | Why it matters | Action |
|---|---|---|---|
| 2.1 | ~~Availability ignores maintenance.~~ **Addressed:** the API checks scheduled and in-progress workshop jobs on availability, rental create, rental start and date changes. The 409 names the conflicting record. | `CreateRentalDialog` still repeats the check in the browser, for a friendlier message. The server is the one that decides. | None. |
| 2.2 | ~~Retire is guarded only in the client.~~ **Addressed:** `EquipmentService` refuses to retire a machine with a committed rental or an open workshop job. | — | — |
| 2.3 | ~~Multi-step writes aren't atomic.~~ **Addressed:** `send-to-workshop`, `log-completed` and a status change with `machineStatus` each run in one transaction. | — | — |
| 2.4 | ~~Money calculated with floats.~~ **Addressed:** billing calculates in integer paise (`shared/money.ts`), and "fully paid" is an exact comparison. | The web still formats and sums some display figures with `Number`. That's display only. | Use paise for any new server-side money logic. |
| 2.5 | ~~Browser/server clock decides "today".~~ **Addressed:** the API uses `todayInBusinessZone()` and the web uses `todayIsoDate()`, both Asia/Kolkata. | Quotation, work-order and project reference numbers still take their year from the server clock. | Switch them if a year boundary in UTC vs IST matters. |
| 2.6 | **Quotation freeze is new.** Terms and scope can now be edited only in draft. Quotations sent before this change may already have been edited after sending. | Old records may not match what the Renter saw. | If that history matters, check old quotations. Changes after sending now go only through offers and alternate dates. |
| 2.7 | ~~Rental dates can't change.~~ **Addressed:** the Rental Company proposes a date change and the Renter accepts or rejects it. The Rental Company corrects disputed actual dates, and the Renter verifies them again. All of it is recorded in `rental_events`. | — | — |
| 2.8 | ~~Optional fields can't be cleared.~~ **Addressed** for rental terms and transport, which now accept `null`. Machine chassis number and year still can't be cleared. | A wrong chassis number or year can be replaced but not removed. | Add `null` to the machine update schema if ops asks for it. |

## 3. Security and tenant isolation

| # | Risk | Why it matters | Action |
|---|---|---|---|
| 3.1 | **Cross-tenant leaks through "shared" views.** The requirement detail page has a separate Rental Company branch so it never shows other companies' responses. | Any new screen built on a Renter-scoped endpoint for a Rental Company, or the reverse, can leak competitors' prices. | Rule: every view uses the endpoint for its own side (`*.manage` vs `*.respond`). Review every new cross-party screen for this. |
| 3.2 | **Tenant scoping depends on every repository query filtering on `organization_id`.** | One missed `where` clause exposes another tenant's data. | Keep the service tests that assert another org's record returns 404, and add one for every new endpoint. |
| 3.3 | **Password-reset timing.** A request for a known email does a few extra writes. | Response time can hint that an account exists. | Low risk. It goes away once sending moves onto the SQS queue. |
| 3.4 | ~~No session management.~~ **Addressed:** signed-in password change, a session list with revoke, and "sign out everywhere else". | A stolen cookie is valid until it's revoked, or for up to 30 days. | Consider a shorter idle timeout. |
| 3.5 | **Platform Admin uses its own client** (`AdminApiError`). An `onRequest` hook now requires a staff session on every `/admin/*` route. | A new admin route outside the `/admin` prefix wouldn't be guarded. | Keep every admin route under `/admin`. |

## 4. Performance and scale

| # | Risk | Why it matters | Action |
|---|---|---|---|
| 4.1 | **The lists page in the browser.** The API supports paging, filtering and sorting (`list…Page`, ticket l), but no screen uses it yet. The screens still load the whole list. | Slow and memory-heavy past a few thousand machines, rentals or invoices. Server paging loses total counts, most sortable columns, derived filters and the figure tiles unless summary endpoints are added. | Switch the big lists (machines, rentals, invoices, maintenance) to server paging and add summary endpoints once a load test shows it's needed. |
| 4.2 | **One API call per item on the Open market** (the response and auction lookups per requirement). Availability is now one batch call. | Page load grows with the number of requirements. | Add those fields to the discovery list. |
| 4.3 | ~~No scheduler.~~ **Addressed:** a daily in-process reminders job (`REMINDERS_ENABLED`), made idempotent by `reminder_log`. It sends in-app notifications only. | With several API instances, every instance runs it. It stays safe (idempotent), but the work is duplicated. | Enable it on one instance, or move it to SQS with the mail work. |

## 5. Frontend traps (things that have already bitten once)

| # | Trap | Rule |
|---|---|---|
| 5.1 | Unlayered global CSS beats Tailwind v4 utilities. `a { color: inherit }` hid the whole sidebar. | Global element styles go in `@layer base` in `globals.css`. |
| 5.2 | `sr-only` (absolute) labels escape `overflow-x-auto` containers and make the whole page scroll sideways. | Scroll containers get `relative` (already in `Table` and `Tabs`). |
| 5.3 | Running `pnpm build` while `pnpm dev` is running corrupts `.next`, and dev then serves 500s. | Stop dev before building, or delete `apps/web/.next` and restart dev. |
| 5.4 | A query-only `router.push` doesn't remount the page. Deep-link params read in a `useState` initializer get stuck. | Read deep-link params in an effect keyed on the param (see `docs/decisions.md`). |
| 5.5 | A failed background refresh used to replace a loaded page with an error page. | Fixed in `useLoad`. Pages should show the error page only when there's no data yet. |
| 5.6 | Status labels and colours drifting between screens. | Only `<Status>` and `lib/status.tsx` decide them. No local maps. Compare against the enum objects from contracts, never bare strings. |
| 5.7 | Forms hand-rolling validation and error handling. | Use `useForm` / `useAction` (`docs/frontend-conventions.md`). |
| 5.10 | Importing a runtime value (not just a type) from `@fleetip/contracts` makes webpack bundle its source, which uses NodeNext `.js` import paths. | `next.config.mjs` maps `.js` → `.ts` (`extensionAlias`). Keep that line. If you ever switch dev to Turbopack, add the same mapping there. |
| 5.8 | `apiClient.listProducts()` includes disabled products by default, so existing machines keep resolving their names. | Any **picker** must pass `includeDisabled = false`. |
| 5.9 | ~~No web tests.~~ Vitest now runs in `apps/web/test` (format, status, errors, the `next` param). | Add a test with each new pure helper. |

## 6. Operations

| # | Risk | Action |
|---|---|---|
| 6.1 | Never edit a migration that has already been applied. Kysely also requires them to run **in order**: on the original dev DB, 0034 was applied after 0035–0037, and `pnpm migrate` refuses that until the row's timestamp is fixed. | Add new migrations with the next number only. Run `pnpm migrate` in every environment as part of deploy. |
| 6.2 | ~~The demo seed isn't idempotent.~~ **Addressed:** it skips existing records. | — |
| 6.3 | Local Postgres is on port **5433**, because 5432 is taken by another project. | Keep `.env` files in sync. |
| 6.4 | Decisions aren't recorded in matha: `matha after` is interactive-only, and the MCP tool isn't connected. | Run `matha after` after each work session, or connect the matha MCP server. |

## 7. Waiting on a product decision

- The storage design (1.3) and the full list of emails (1.2).
- ~~Category/subcategory disable~~: decided and built as a soft cascade.
- Emails beyond the log (SES + SQS) and document/image storage: to be designed later.
- Designer review of the redesigned screens: the plan's "done" definition still needs sign-off.
- The "parked" and "dropped" backend lists aren't written down anywhere yet.
