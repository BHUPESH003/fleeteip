# FleetIP go-live checklist

Work through this top to bottom before the first real customer signs in. Tick
each box only once you've checked it yourself; "the code does it" isn't
enough. Anything left unticked is either a blocker or a risk you accept
knowingly, so write down which next to it.

Related: `docs/risk-register.md` (why each item matters),
`docs/frontend-backend-gap-report.md` (what's missing),
`docs/frontend-conventions.md`.

---

## 1. Blockers (must all be ticked)

- [ ] **All work is committed, reviewed and merged.** No uncommitted changes.
  `refs/kiro-snapshot` can be deleted once you've merged.
- [ ] **Real email delivery.** SES + SQS (or another provider) replaces
  `LogMailer`. Password reset works end to end with a real inbox.
  Reset links no longer appear in the logs.
- [ ] **Every email the product needs is listed and built,** or deliberately
  skipped: invite, password reset, reminders (rental ending, overdue invoice,
  missing logsheet), and quotation/rental events.
- [ ] **File and document storage** is designed and built, or you've decided
  explicitly to launch without it and ops knows where documents go instead.
  If built: S3 presigned uploads, tenant-scoped keys, a type allow-list, a size
  cap and a virus scan.
- [ ] **Production secrets** are set in the host's secret store, never in the repo:
  - `DATABASE_URL`: the production database, with TLS on (`?sslmode=require`).
  - `SESSION_COOKIE_SECRET`: at least 32 random characters, unique to
    production, and not the example value.
  - `NODE_ENV=production`, which turns on `secure` cookies.
  - `WEB_ORIGIN`: the exact production web URL. It's the only CORS origin.
  - `NEXT_PUBLIC_API_URL`: the production API URL, set at build time.
  - `BUSINESS_TIME_ZONE`: leave unset for Asia/Kolkata, or set it
    deliberately.
  - `REMINDERS_ENABLED`: on in exactly the process(es) you intend. The job
    is idempotent, but decide where it runs.
- [ ] **HTTPS everywhere.** Web and API sit on the same site (or a subdomain)
  so the `SameSite=Lax` session cookie works. HTTP redirects to HTTPS.
- [ ] **Demo data isn't in production.** Don't run `seed:demo` there, and
  the `@apex-demo` / `@metro-demo` accounts don't exist.
- [ ] **Platform Admin staff account(s)** are created with
  `seed:staff-admin` using strong, unique passwords. No shared logins.

## 2. Database

- [ ] `pnpm migrate` has run against production, and every migration up to
  the latest (currently 0037) is listed in `kysely_migration`.
- [ ] No applied migration file has been edited since it ran. Compare with git.
- [ ] Automated backups are on, with point-in-time recovery if available.
  **A restore has actually been tested** into a scratch database.
- [ ] The database user the API connects with isn't a superuser. It has only
  the rights the app needs.
- [ ] Connection limits suit the host, pool size included.
- [ ] Timezone: date-only business rules use Asia/Kolkata (`shared/business-date.ts`),
  whatever the server clock's zone.

## 3. Security

- [ ] The rate limits are on: global, plus stricter ones on sign-in, sign-up
  and password reset. Check that a burst returns 429.
- [ ] Every `/admin/*` route returns 401 without a staff session. Check a few.
- [ ] **Tenant isolation spot check:** signed in as org A, request org B's
  machine, rental, invoice, quotation and requirement ids. Every one returns
  404 or 403.
- [ ] A Rental Company viewing a Renter's requirement never sees other
  companies' responses or prices.
- [ ] Suspending a user signs them out at once. Suspending an organization
  blocks its members.
- [ ] Password change and password reset sign out other sessions. The
  sessions list and "sign out everywhere else" work.
- [ ] No secrets or tokens appear in the logs (session tokens, reset links, invite
  tokens). Read a sample of production logs.
- [ ] Dependencies are audited (`pnpm audit`), with no known critical
  vulnerabilities left unresolved.
- [ ] Security headers on the web app: HSTS, `X-Content-Type-Options`,
  `Referrer-Policy`, and a CSP at least in report-only mode.

## 4. Data integrity (spot-check with real-looking data)

- [ ] A machine in the workshop can't be booked. The API refuses it, not just the UI.
- [ ] A machine with active rentals or open workshop jobs can't be retired.
- [ ] "Send to workshop" and "Log maintenance as already done" leave no half
  state if they fail (single transaction).
- [ ] Invoice totals, balances and "paid" status are right to the paisa with
  partial payments. Try amounts like 0.10 + 0.20.
- [ ] Overdue flags and the "today" figures are right around midnight IST.
- [ ] Quotation terms can't be edited after sending. Changes only go through
  offers and alternate dates.
- [ ] Rental date changes and corrections to disputed actual dates need the
  Renter's approval. Both sides get notified.
- [ ] Disabling a catalogue product, subcategory or category hides it from
  pickers. Existing machines, requirements and quotations still show their names.

## 5. Every screen, both roles (manual walkthrough)

Sign in as a Rental Company owner, then as a Renter owner, then as a member
with a limited role. Check each at a desktop width (1280px), at 1180px and at
760px, plus one phone width.

- [ ] Dashboard, Machines (list and detail), Catalogue, Open market or
  Requirements, Quotations, Auctions, Rentals (list and detail), Work orders,
  Transport, Logsheets, Maintenance, Billing, Projects, Settings (Organization,
  Members, Roles, Security), Platform Admin.
- [ ] No horizontal page scroll. Sidebar text and icons are readable.
- [ ] Each form: an empty submit shows messages under the fields, a server
  error lands under the right field, and a duplicate (asset code, role name,
  email) shows under its field.
- [ ] Offline: turn off the network. The banner shows, saves are blocked, and
  nothing reports success.
- [ ] Deep links from notifications and dashboard tiles open the exact record
  (`?invoiceId=`, `?tab=transport`, `?create=1&rentalId=`, and so on).
- [ ] Sign-out, session expiry and `next=` redirects return to the same page
  with its query string.
- [ ] Reminders appear once per day per record, not repeated on restart.
- [ ] Designer sign-off on the redesigned screens (plan §5 "done" definition).

## 6. Build, deploy and operate

- [ ] CI runs `pnpm typecheck && pnpm lint && pnpm test && pnpm build` on
  every merge, and a red CI blocks deploys.
- [ ] The production build comes from a clean checkout, not a dev machine's `.next`.
- [ ] Health check: `/health` is monitored, and the host restarts the API when it fails.
- [ ] Error monitoring (e.g. Sentry) for API and web, with alerts sent to a
  person rather than an unwatched inbox.
- [ ] Logs are structured (pino) and kept long enough, with access restricted.
- [ ] Uptime monitor on the web and API URLs.
- [ ] Rollback plan: how to redeploy the previous build, and how to handle a
  migration that has to be reversed (prefer a forward fix).
- [ ] Load sanity check: one organization with realistic volumes (hundreds of
  machines, thousands of rentals and invoices) keeps list pages usable. If
  not, switch those screens to the paged API endpoints (`list…Page`).

## 7. Business and legal

- [ ] Terms of service and privacy policy are published and linked from sign-up.
- [ ] Invoice format meets GST requirements (GSTIN, HSN/SAC, tax breakdown)
  if invoices are sent to customers from FleetIP.
- [ ] Support contact is shown in the app, and someone owns the inbox.
- [ ] Data retention and deletion policy decided (what happens when an
  organization leaves).

## 8. After launch (first week)

- [ ] Watch error monitoring and 429 counts daily.
- [ ] Confirm backups are completing.
- [ ] Record decisions and surprises in matha (`matha after`).
- [ ] Review the "parked" items in `docs/frontend-backend-gap-report.md` against real usage.
