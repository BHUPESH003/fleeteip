# FleetIP manual test plan

This is what to click through by hand after the redesign (Kiro), the
contracts changes and the backend build of 2026-09. Automated checks already
pass: typecheck, lint, 604 API tests, 49 web tests, the build, and a
screen-by-screen walk at 1180px and 760px. What those can't judge is whether
each flow *works for a person*, so that's what this list covers.

`docs/go-live-checklist.md` covers production readiness (secrets, backups,
monitoring). This file covers behaviour.

## How to use it

- **Accounts** (password `DemoPass123!`):
  - **RC**: `owner@apex-demo.fleetip.local`, a Rental Company owner.
  - **RN**: `owner@metro-demo.fleetip.local`, a Renter owner.
  - **Limited**: invite a member with a custom role in Settings, then sign in as them.
- Keep **two browsers** open, one RC and one RN. Many flows need the other side to react.
- Tick each line only when it behaves as written. Write down anything odd next
  to the line, even if it's "just wording".
- Where a line says *error under the field*, the message must be a sentence a
  person understands, sit under that field, and clear when you edit it.

---

## 0. Every form: the shared rules (spot-check in at least 5 forms)

- [ ] **Empty submit:** each required field shows its own message and focus jumps to the first one.
- [ ] **Messages appear on blur,** not while you're still typing.
- [ ] **Date range:** type `1926-05-01` into any date field and leave it.
  - "Enter a date between 1976 and 2076." shows at once, and nothing is saved.
  - Same for `2080-01-01`.
  - The date picker won't go outside those years.
- [ ] **Duplicates show under their field:** machine asset code, role name, member email, catalogue code.
- [ ] **Offline:** turn off the network (DevTools → Offline).
  - The offline banner shows and Save is disabled.
  - Nothing reports success.
  - Turn the network back on and the save works.
- [ ] **Double-click Save** creates one record, not two.
- [ ] **Unsaved changes:** close a dialog after editing. It closes, and reopening shows the saved values, not your edits.
- [ ] **Server errors land in the right place:** on a field when they're about one, in the banner at the top of the form otherwise. No raw codes like `validation_error` or `409`.

## 1. Sign-in, session and account

- [ ] **Sign in** with the correct password, then with a wrong one. The wrong one shows a clear message and doesn't say which part was wrong.
- [ ] **Deep link:** open `/rentals?status=active` while signed out. After sign-in you land on exactly that URL, filter included.
- [ ] **Sign-up** creates an organization and signs you in.
- [ ] **Forgot password:**
  - Request a reset for a known and an unknown email. The page says the same thing both times.
  - The reset link appears in the API log (email isn't built yet).
  - Open the link, set a password, and sign in with it. Other sessions are signed out.
- [ ] **Reset link reuse:** the same link fails the second time, and an expired link fails too.
- [ ] **Settings → Security:**
  - Change the password while signed in. A wrong current password gives an error under that field.
  - The session list shows this browser and the other one.
  - "Sign out other sessions" signs out the second browser. Its next click goes to sign-in.
- [ ] **A server hiccup doesn't sign you out.** With the API stopped for about 10 s, the app shows "couldn't reach" or offline messages but no sign-in page. Once the API is back, it carries on.
- [ ] **Rate limit:** 11 wrong sign-ins in a minute shows a "too many attempts" message, not a crash.
- [ ] **Suspension (Platform Admin):**
  - Suspending a user signs them out at once.
  - Suspending an organization blocks its members.
- [ ] **Invites:** invite a member, see them under Pending invites, revoke. The revoked link no longer works.
- [ ] **Organization name:** edit it in Settings → Organization. The new name shows in the sidebar.

## 2. Navigation, layout and look

- [ ] Check at 1280px, 1180px, 760px and a phone width:
  - there's no sideways page scroll;
  - the sidebar text and icons are readable;
  - tables scroll inside their card.
- [ ] Every page title, breadcrumb and Back link returns you to the list with the filters and page you left it on.
- [ ] **Notifications:** the bell opens the exact record for every type you can trigger, including rental date change, actual dates, quotation, invoice and reminders.
- [ ] **Dashboard tiles** open the list already filtered, for both RC and RN dashboards.
- [ ] **Status badges:** the same status has the same label and colour on every screen, lists and detail pages alike.
- [ ] **Empty states:**
  - With no records at all, the page says how to start.
  - With no filter matches, it names the filters and offers Clear filters.
- [ ] **Limited role:** pages the role can't use show a "you don't have access" page. Buttons the role can't use are hidden or disabled with a reason.

## 3. Lists (every list screen)

Machines, Rentals, Billing, Maintenance, Logsheets, Transport, Work orders,
Quotations, Requirements / Open market, Auctions, Projects, Members,
Catalogue, and Platform Admin lists.

- [ ] **Search** starts at 2 characters. It shows "Searching…", and the results match.
- [ ] **Each sortable column** sorts both ways, and records with no value go last.
- [ ] **Filters** and filter chips narrow the list. A chip's ✕ removes just that filter, and Clear filters removes all of them.
- [ ] **Paging:** Prev and Next work, and the "1–25 of N" count matches.
- [ ] **URL state:** reloading the page keeps search, sort, filter and page. Copying the URL into another tab gives the same view.
- [ ] **Key figures** above the list match what the list shows when you filter by that figure.

## 4. Machines (RC)

- [ ] **Register a machine:**
  - required fields and a duplicate asset code (error under the field);
  - a catalogue product that was just disabled shows a clear banner.
- [ ] **Edit a machine:**
  - only the fields you change are saved;
  - a duplicate asset code shows under the field;
  - it can't be emptied.
- [ ] **"Free between" filter on the list:** pick dates overlapping a booked machine and a machine in the workshop. Both drop out, and the rest stay.
- [ ] **Machine page, "Is it free?":** the answer names the conflicting rental (`RN-…`) or workshop job, with the earliest free date.
- [ ] **Send to workshop:**
  - the machine becomes Under maintenance and the job is In progress, in one step;
  - Undo puts both back.
- [ ] **Send to workshop on an active rental:** "Log it against RN-…" is ticked by default.
- [ ] **Log maintenance, "Planned" and "Already done":**
  - Already done needs an end date that isn't in the future;
  - Breakdown ticks the link to the active rental.
- [ ] **Complete a workshop job:** the machine goes back to Active.
- [ ] **Retire:**
  - refused, with a message naming the rental or job, while a rental is confirmed, active or off rent, or a job is open;
  - allowed when nothing is committed.
- [ ] **Record tabs** (rentals, maintenance, logsheets, documents) show this machine's records only.

## 5. Rentals (RC and RN together)

- [ ] **Create a rental:**
  - dates overlapping another rental or a workshop job give an error under Start date naming the conflict;
  - a free machine books fine.
- [ ] **Start** the rental, then **off rent**, then **complete**. Actual dates default to today and can be changed.
- [ ] **Verify actual dates:**
  - RN sees "Verify / Dispute";
  - verifying marks them verified on both sides.
- [ ] **Dispute** (RN enters a reason):
  - RC sees the reason and "Correct dates";
  - RC corrects them, RN gets a notification, and the status is back to awaiting verification.
- [ ] **Change dates on a confirmed rental** (RC, More → Change dates):
  - RN gets a notification and a banner with Accept and Reject;
  - Accept changes the dates, and Reject leaves them.
- [ ] **Change dates on an active rental:**
  - only the end date can change;
  - an end before the actual start is refused.
- [ ] **One proposal at a time:** while a proposal is pending, a second one is blocked with a reason. RC can withdraw.
- [ ] **Accept after a clash:** RC proposes, another booking then takes those dates, and RN accepts. RN gets a clear refusal that doesn't reveal the other booking.
- [ ] **Cancel with a pending proposal:** cancelling the rental clears the proposal.
- [ ] **Edit terms / transport:** clearing an optional field (emptying it) saves as empty. Rate and rate unit can't be cleared.
- [ ] **Activity card:** every step above appears, with "Your organization" or the other party's name, and no user details.
- [ ] **Workshop tab (RC):** it counts the jobs logged against this rental, and "Log breakdown" links the job.
- [ ] **Invoices tab:** the balance and overdue flag match Billing.
- [ ] **RN view:** RN never sees RC's workshop jobs or other customers' bookings.
- [ ] **Transport tab and logsheets:** plan, dispatch and deliver work. The logsheet date must fall within the rental.

## 6. Requirements, quotations, auctions (marketplace)

- [ ] **RN posts a requirement:** "Needed from" must be today or later, and validity dates are checked.
- [ ] **RC sees it on the Open market:**
  - responds with a rate;
  - RC never sees other companies' responses or prices.
- [ ] **Quotation (RC):**
  - create a draft and edit its terms;
  - **after sending, "Edit terms" is gone**.
- [ ] **RN on a sent quotation:**
  - accept, reject, or counter-offer;
  - the RC accepting a counter changes the rate;
  - an alternate dates proposal (start only) keeps the end date, and a start past the end is refused.
- [ ] **Quotation expiry:** a quotation past its validity date shows as expired on both sides, including around midnight IST.
- [ ] **Auction:**
  - bids, the bidder view and the renter view;
  - close picks the winner, and a closed auction takes no bids.
- [ ] **Rental from an accepted quotation:** the machine, dates and rate carry over.
- [ ] **References:** `REQ-…`, `Q-YYYY-N`, `RN-…` and `WO-…` show consistently everywhere.

## 7. Billing

- [ ] **Raise an invoice** from a rental (`?create=1&rentalId=`):
  - lines entered by hand;
  - the period end can't be before its start.
- [ ] **Paisa checks:**
  - line amounts like 0.10 and 0.20 total exactly 0.30;
  - GST (if any) adds up to the paisa.
- [ ] **Partial payments:**
  - the balance drops each time;
  - paying the exact remainder marks it Paid;
  - overpaying is handled clearly.
- [ ] **Overdue:**
  - an issued invoice past its due date shows Overdue on the list, the dashboard and the rental;
  - "Paid this month" counts by payment date.
- [ ] **Drawer:** it opens from `?invoiceId=`, and the record-payment date field follows the date rules.
- [ ] **RN view:** RN sees only invoices addressed to it and can't record payments.

## 8. Maintenance, logsheets, transport, work orders, projects

- [ ] **Maintenance list and detail:**
  - the detail loads straight from its URL;
  - it shows "Logged against RN-…" when linked;
  - a status change also updates the machine.
- [ ] **Logsheets:**
  - create one from a rental;
  - a date outside the rental gives an error under the date;
  - hours and fuel accept decimals.
- [ ] **Transport:**
  - plan, dispatch, deliver and return legs;
  - the planned date can be changed but not removed;
  - the late flags look right.
- [ ] **Work orders:** the list, detail and reference link to the rental.
- [ ] **Projects (RN):** create one, and a past start date is allowed.

## 9. Catalogue and Platform Admin

- [ ] **Disable a product:**
  - it disappears from pickers (Register machine, Post requirement);
  - existing machines and requirements still show its name.
- [ ] **Disable a subcategory or category:** the same, cascading to its products. Enabling it again brings them back.
- [ ] **Platform Admin:**
  - every `/admin` page needs the staff sign-in;
  - an ended staff session goes to the staff sign-in page;
  - accounts, oversight lists and catalogue edits work.

## 10. Reminders and time

- [ ] With `REMINDERS_ENABLED=true`, restart the API, then check reminders in the bell:
  - rental ending soon;
  - invoice overdue;
  - logsheet missing.
- [ ] Restart it again and confirm no duplicate reminders appear the same day.
- [ ] Between 00:00 and 05:30 IST, compare "today" figures, overdue flags and the default dates in forms. They must use the Indian date, not UTC.

## 11. Things known not to work yet (don't log as bugs)

- **No emails:** reset links and invites appear only in the API log.
- **No file or photo uploads** anywhere.
- **Open market console noise:** 404s in the console for `/response` and `/auction` are expected probes.
- **Lists load everything and page in the browser.** Server paging exists in the API but isn't wired to screens (risk register §4.1).
- **Machine chassis number and year** can be replaced but not cleared.
