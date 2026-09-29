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
| 1.1 | **Nothing is committed.** The whole redesign, the backend build and migrations 0030–0031 exist only in the working tree. A snapshot of the Kiro state is kept at `refs/kiro-snapshot`. | One bad `git checkout` or disk problem loses weeks of work. | Commit in reviewable slices (UI system, screens, backend features) as soon as you've reviewed them. |
| 1.2 | **Emails aren't sent.** `LogMailer` writes password-reset links, which are live credentials, into the API log. | Anyone with log access can take over an account. Users can't reset passwords at all. | Build the planned SES + SQS mail system. Until then, keep production logs locked down or turn reset off. List every email the product needs first: invites, reset, quotation and rental events. |
| 1.3 | **No file or document storage.** There's nowhere to keep logsheet photos, signed work orders, invoices, machine documents (RC, insurance, fitness) or images. | Operations will fall back to WhatsApp and email, and records lose their evidence. Retrofitting storage later touches many screens. | Design it before more screens assume "no attachments". Use S3 with presigned uploads, tenant-scoped keys (`org/<id>/…`), an allow-list of file types with a size cap, a virus scan, and an `attachments` table linked to the owning record. |
| 1.4 | **Rate limiting covers only login, signup and password reset.** | Every other endpoint can be scripted without limit (scraping, brute-forcing ids, load). | Turn on a global per-session/IP limit with the per-route overrides already there (`@fastify/rate-limit` is registered with `global: false`). |

## 2. Data integrity: records that can end up wrong

| # | Risk | Why it matters | Action |
|---|---|---|---|
| 2.1 | **Availability doesn't include maintenance.** `checkRentalAvailability` looks only at rentals. The UI adds maintenance overlap in the browser. | Another client, script or a future mobile app can book a machine that's in the workshop. | Move the maintenance-overlap check into the rental service (ticket b). |
| 2.2 | **Retiring a machine is guarded only in the client.** | Through the API, a machine with active rentals can be retired. | Add the guard to `EquipmentService` (plan §1). |
| 2.3 | **Multi-step writes aren't atomic.** "Send to workshop" makes 3 writes, and so does "Log maintenance as already done". | If a write fails partway, the machine or job is left in a half state. The UI reports it, but the data stays inconsistent. | Put each flow in one API endpoint and one transaction. |
| 2.4 | **Money is calculated with JavaScript floats.** The DB columns are `numeric`, but totals, balances and payments are computed with `Number(...)`. | Rounding errors like 0.1 + 0.2 show up in invoice totals, balances and "fully paid" checks. | Calculate in integer paise, or use a decimal library in the billing service, and compare with a tolerance of 0. |
| 2.5 | **"Today" and "overdue" come from the browser or server clock and timezone.** | An invoice or rental can show as overdue on one side and not the other near midnight IST. | Pick one business timezone (Asia/Kolkata) and derive every date-only comparison from it, on the server. |
| 2.6 | **Quotation freeze is new.** Terms and scope can now be edited only in draft. Quotations sent before this change may already have been edited after sending. | Old records may not match what the Renter saw. | If that history matters, check old quotations. Changes after sending now go only through offers and alternate dates. |
| 2.7 | **Rental dates can't be changed, and disputed actual dates can't be corrected.** | Ops will cancel and recreate rentals, which breaks history, billing and logsheets. | Build tickets j and the dispute resolution before go-live. |
| 2.8 | **Optional fields can be corrected but not cleared.** This covers rental terms, transport and machine chassis number and year. | A wrong value can't be removed, only replaced. | Decide per field whether clearing is allowed, then accept `null` in the update schemas. |

## 3. Security and tenant isolation

| # | Risk | Why it matters | Action |
|---|---|---|---|
| 3.1 | **Cross-tenant leaks through "shared" views.** The requirement detail page has a separate Rental Company branch so it never shows other companies' responses. | Any new screen built on a Renter-scoped endpoint for a Rental Company, or the reverse, can leak competitors' prices. | Rule: every view uses the endpoint for its own side (`*.manage` vs `*.respond`). Review every new cross-party screen for this. |
| 3.2 | **Tenant scoping depends on every repository query filtering on `organization_id`.** | One missed `where` clause exposes another tenant's data. | Keep the service tests that assert another org's record returns 404, and add one for every new endpoint. |
| 3.3 | **Password-reset timing.** A request for a known email does a few extra writes. | Response time can hint that an account exists. | Low risk. It goes away once sending moves onto the SQS queue. |
| 3.4 | **Sessions.** Suspending a user now deletes their sessions, and suspending an organization blocks every permission check. Changing a password (through reset) signs the user out everywhere. There's no sign-out-everywhere or "change password while signed in". | A stolen cookie stays valid for 30 days unless the account is reset or suspended. | Add a signed-in password change plus a session list with revoke. |
| 3.5 | **Platform Admin uses its own client and error type** (`AdminApiError`), and its routes are gated only by the staff session. | It's easy to add an admin route and forget the staff gate. | Keep `getAuthenticatedStaffId` as the first line of every `/admin/*` handler. Consider a route prefix hook that enforces it. |

## 4. Performance and scale

| # | Risk | Why it matters | Action |
|---|---|---|---|
| 4.1 | **No server-side filtering, sorting or paging.** Every list loads everything and filters in the browser (ticket l). | Fine for a demo. Slow and memory-heavy past a few thousand machines, rentals or invoices. | Add paging and filters to the list endpoints before onboarding a large fleet. |
| 4.2 | **One API call per item in several places:** availability per machine, and the response and auction lookups per requirement on the Open market. (Invoice balances are being moved into the list.) | Page load grows with the data. | Use batch endpoints, or add the fields to the list endpoints. |
| 4.3 | **Notifications and reminders.** There's no scheduler (ticket i). Attention items are worked out only when a page loads. | Nobody is told when a rental ends or an invoice becomes overdue. | Add scheduled jobs, which the planned SQS work can share. |

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
| 5.8 | `apiClient.listProducts()` includes disabled products by default, so existing machines keep resolving their names. | Any **picker** must pass `includeDisabled = false`. |
| 5.9 | There are no web tests (Vitest runs only in apps/api). | Decide on Vitest for `apps/web/lib/*` (format, status, form, errors). They're pure and cheap to test. |

## 6. Operations

| # | Risk | Action |
|---|---|---|
| 6.1 | Never edit a migration that has already been applied. Kysely tracks migrations by name. 0030 and 0031 are applied only on this machine. | Add new migrations. Run `pnpm migrate` in every environment as part of deploy. |
| 6.2 | The demo seed isn't idempotent. A second run stops with "account already exists". | Make it skip existing records, or add a reset script for local use. |
| 6.3 | Local Postgres is on port **5433**, because 5432 is taken by another project. | Keep `.env` files in sync. |
| 6.4 | Decisions aren't recorded in matha: `matha after` is interactive-only, and the MCP tool isn't connected. | Run `matha after` after each work session, or connect the matha MCP server. |

## 7. Waiting on a product decision

- The storage design (1.3) and the full list of emails (1.2).
- Whether categories and subcategories can be disabled. It needs cascade rules for their products and for requirements filed against them.
- Designer review of the redesigned screens: the plan's "done" definition still needs sign-off.
- The "parked" and "dropped" backend lists aren't written down anywhere yet.
