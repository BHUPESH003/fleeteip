# Decisions Log

Short-form record of what was decided and why. Full rationale for each also lives in matha (`matha before`, or `matha_brief`/`matha_match` over MCP) — this file is the human-readable summary.

## Architecture (locked, Stage 5)

- **Modular monolith**: Next.js web + Fastify API, one shared PostgreSQL database, no microservices until a measured workload justifies one.
- **MVP org scope**: Rental Company + Renter only. Transport/OEM/logistics and the legacy news-CMS/admin panel are explicitly out of scope, not deferred-but-scaffolded.
- **One identity model**: single `users` table; authorization via Organization + Membership + Role + Permission, never org-type string checks.
- **Repository pattern, no ORM**: Kysely (a query builder, not an ORM) confined to each module's `infrastructure/` layer. Application/domain code depends on hand-written `*RepositoryPort` interfaces, never on Kysely types — verified by grep, zero exceptions.
- **Auction/RFQ in Postgres**, never Mongo — both need explicit state transitions and a persisted, auditable result (the legacy app has neither; that gap is what the new design must close).
- **Two distinct quotation concepts**: a marketplace quotation _response_ vs. a formal commercial quotation _document_ — never merged, even though the legacy app uses one word for both.
- **Auth redesigned freely**: hashed passwords, DB-backed cookie sessions — the legacy OTP/plaintext-password/plaintext-cookie flow was a liability, not a UX to preserve.
- **No `packages/validation`**: Zod schemas in `packages/contracts` are the single source of truth; a schema is never defined twice.

## Technology choices (with the "why not X")

| Choice                                       | Not                   | Why                                                                                                                                                                                                 |
| -------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kysely + `pg`                                | Prisma / a custom ORM | Contract explicitly permits "SQL / query builder / driver," rejects an ORM. Kysely gives compile-time-checked SQL with no active-record models, no separate schema DSL competing with Zod.          |
| Node `crypto.scrypt`                         | `argon2`              | Same security properties (salted, slow KDF, timing-safe compare) with zero native-binding install risk. Deviation from the originally-approved "Argon2" line item — deliberate, documented in code. |
| pnpm workspaces                              | Turborepo/Nx          | Two apps + a few packages don't need build-graph orchestration yet.                                                                                                                                 |
| esbuild bundling for `apps/api`'s prod build | Plain `tsc` emit      | `@fleetip/contracts` ships TS source with no dist; plain `node dist/index.js` can't resolve it without a bundler inlining it. tsx/Next/Vitest all transpile on the fly and never hit this.          |

## Corrections made mid-build (also recorded in matha as decisions)

- **Kysely `Generated<ColumnType<...>>` nesting breaks selects.** A `created_at` column typed as `Generated<Timestamp>` where `Timestamp` was already a `ColumnType` produced a doubly-wrapped type Kysely never flattens. Fix: one plain `ColumnType<Date, InsertType, UpdateType>` per column, never `Generated` wrapping an existing `ColumnType`.
- **`packages/ui` needed `moduleResolution: "Bundler"`, not `NodeNext`.** Webpack (Next's bundler) doesn't understand TS's NodeNext convention that a `./Button.js` import refers to `./Button.tsx` — only `packages/contracts` (consumed by Node/tsx too) keeps NodeNext.
- **`apps/api/tsconfig.json` needed a build-only variant.** With `include: ["src","test"]` and no explicit `rootDir`, TS built to `dist/src/index.js` instead of `dist/index.js`. Added `tsconfig.build.json` (src-only) for the real build; kept the broader config for typecheck.
- **ESLint flat-config ignores need a `**/` prefix.** `"dist/**"` only matched a root-level `dist/`, not `apps/*/dist` — every ignore glob had to become `"**/dist/**"` etc.
- **Repository _interfaces_, not concrete classes, as the application-layer dependency.** First pass had `AuthService`/`PermissionService` depend on concrete `UserRepository`/`MembershipRepository` classes directly — refactored to `domain/ports.ts` interfaces per module, per the architecture contract's explicit repository-interface requirement.
- **matha's markdown parser truncates line-wrapped bullets.** A manually word-wrapped `requirements.md` silently cut rules off mid-sentence in `.matha/hippocampus/rules.json`. Fixed by re-authoring with one unwrapped line per bullet and re-running `matha init`.
- **matha's `mcp-config.json` output isn't portable.** It embeds an absolute, machine-local path. The committed `.mcp.json` uses `npx -y @10kdevs/matha@1 serve --project .` instead.
- **`matha after` can't be driven over a non-TTY pipe.** It reliably fails on the second prompt outside a real terminal. For batch-recording from an agent session without MCP tools loaded yet, the reliable path is calling `Engine`/`mathaRecord` directly from the package's own `dist/` output — the same function `matha_record` (MCP) and `matha after` (CLI) both call.
- **Docker Postgres on port 5433, not 5432** — another project's container already holds 5432 on this machine.
- **`pnpm` needed `onlyBuiltDependencies: ["esbuild"]`** in root `package.json` — its default policy silently blocks native postinstall scripts, and the interactive approval prompt can't run non-interactively.
- **`tsx`'s `watch` subcommand must come immediately after `tsx`, before any flags.** `apps/api`'s `dev` script was `tsx --env-file-if-exists=.env watch src/index.ts` — tsx never recognized `watch` as its subcommand in that position and instead tried to run a script literally named `watch`, failing with `ERR_MODULE_NOT_FOUND`. Fixed to `tsx watch --env-file-if-exists=.env src/index.ts`. Never caught earlier because Stage 5 verification only exercised the built production path (`pnpm build && pnpm start`), never `pnpm dev` itself.

## Project / Work Order / Platform Admin pass

Full report: `docs/project-workorder-platform-admin-report.md`.

- **Project is now a first-class entity** (reverses the earlier locked call that a Project module
  was "exactly the premature module the working rules forbid") — client validated it's required.
  Requirement's `project_id` is a real `NOT NULL` FK, backfilled for pre-existing rows.
- **Work Order is now a first-class entity** — the finalized commercial order, auto-created inside
  `awardQuotation` (never hand-entered), never a separate Contract entity for this scope.
- **Platform Admin is a separate `staff_users`/`staff_sessions` principal, not a third organization
  type** — reuses the same password/session primitives as tenant auth but its own login/cookie.
  Deliberately keeps `organizationTypeCodeSchema` untouched (still locked to
  `rental_company`/`renter`), preserving a clean path to add real future tenant types
  (Transport, OEM) without ever conflating them with FleetIP's own staff.
- **Category-specific commercial responsibilities are a structured collection
  (`quotation_scope_items`: item + responsible party + notes), not a growing set of `*Scope`
  columns** — `fuelScope`/`accommodationScope`/`operatorScope` stay dedicated columns because
  they're common enough to search/filter/compare on; wire rope scope, ground prep, support crane
  etc. are rows instead.
- **Notifications now cover Work Order issuance, Rental active/completed, Transport dispatch/
  delivery, and Billing invoice/payment events** — reverses the earlier documented decision to skip
  transport/mobilization notifications as lowest-priority; still deliberately skips bare Requirement
  creation (no single recipient in a broadcast-discovery marketplace) and a time-based "rental ending
  soon" reminder (needs a scheduler that doesn't exist yet).

## Invite-link redesign (replaces `OrganizationService.inviteMember`)

The old "invite" was an email lookup: `POST /organizations/:id/members` created a `memberships`
row with status `"invited"` for an email that had to already belong to a FleetIP user — and nothing
ever transitioned that row to `"active"`. `findActiveMembership`'s status filter meant the invitee's
UI showed the organization (via the unfiltered `listWithOrganizationByUserId`) but every permission
check silently 403'd forever. Root cause of the "how does the aftermath work?" question — there was
no real aftermath; it was a dead end.

Replaced with a link-based flow, no email delivery required yet:

- **`organization_invites` table**: `token_hash` (sha256, same primitive as session tokens —
  `hashSessionToken` is generic, not session-specific), `role_id`, `status`
  (`pending`/`accepted`/`revoked`), 7-day `expires_at`. The raw token is returned exactly once, at
  creation (`POST /organizations/:id/invites`, `membership.manage`-gated), embedded in a shareable
  link (`{WEB_ORIGIN}/invite/{token}`) — copy/paste today, automated email delivery is a future
  addition on the *same* token, not a different mechanism.
- **Public preview** (`GET /invites/:token`, no auth): organization name/type + role, and whether the
  invite is expired/already used — safe for an anonymous visitor to see before deciding to sign up.
- **Accept** (`POST /invites/:token/accept`): branches on the caller's own session, never a
  client-supplied identity. Logged in already → no body, joins with the existing account. Not logged
  in → `email`/`password`/`displayName` body, calls a new `AuthService.createAccountAndSession`
  (extracted from `signup`) that creates **only** a user, deliberately no organization and no
  membership of its own — the invite is what puts them in an organization, so an invitee never ends
  up owning a redundant org. Either path creates the membership as `"active"` immediately (no
  `"invited"` limbo state) and marks the invite `"accepted"`. Verified live: an existing owner of one
  organization can accept an invite into a second organization and keeps both active memberships.
- **`OrganizationService.inviteMember` removed entirely**, not deprecated alongside — one mechanism,
  not two answering the same question differently. `OrganizationService`'s constructor dropped
  `UserRepositoryPort` (no longer needed once the email-lookup path was gone).

**Organization-name collisions**: `organizations.name` has no uniqueness constraint (verified via
`\d organizations`) — only the server-generated `code` is unique, and it's already documented
elsewhere as never used for auth/tenancy/ownership. Two organizations named identically is allowed by
design; every tenant-scoped query and permission check keys on `organization_id` (a UUID), never on
name. This was a deliberate original decision, not a gap this pass introduced or needed to close.

## Per-organization custom roles (replaces the fixed global owner/member split)

Client feedback, verified in the running app: an invited "member" had a role picker and a status
badge, but literally nothing to do — `member` had zero permissions seeded, ever, across every
migration, and there was no endpoint or UI anywhere to grant it any. "Owner or nothing" was the real
authorization model despite the UI implying `member` was a usable, lesser role.

- **`roles.organization_id`** is now nullable: `NULL` marks a built-in, global role (only `"owner"` —
  always full access, never created/edited/deleted through the API); a real organization id scopes a
  role, and everything it grants, to exactly one organization. Enforced with a composite unique
  constraint (`organization_id`, `name`) plus a partial unique index so two builtin roles can never
  share a name (Postgres treats every `NULL` as distinct, so the composite constraint alone doesn't
  cover that case).
- **The old global `"member"` role is retired**, not kept alongside the new model: migration `0027`
  gives every existing organization its own `"member"` role (empty permissions — no behavior change
  for existing tenants), repoints every membership and pending invite that referenced the old row,
  then deletes it outright. `AuthService.signup` does the same for every new organization from now
  on — one mechanism, not two.
- **Full CRUD on an organization's own roles** (`organization.manage`): create with a name +
  permission set, edit both together (always a full replace, never a partial patch), delete (blocked
  with `409` if a member or a pending invite still references it — the same `ON DELETE RESTRICT`
  foreign keys as before, translated to a friendly error instead of a raw DB failure). The built-in
  `"owner"` role rejects edit/delete with `400`, independent of and in addition to the FK protection.
- **Moving a member between roles** (`membership.manage`, `PATCH /organizations/:id/members/:id`) is
  how a member is promoted to `"owner"` or onto a custom role — this is the direct fix for "give
  access to the invited member." Refuses to leave an organization with zero active owners (verified
  live: demoting an organization's sole owner correctly `409`s; demoting one of *two* owners
  correctly succeeds).
- **A permission code is only ever valid for the organization types `PERMISSION_ORGANIZATION_TYPES`
  says it applies to** — creating or editing a role with an inapplicable code (e.g. `equipment.manage`,
  rental_company-only, for a Renter's custom role) is rejected at role-save time with `400`, not
  silently granted and never enforced.
- **Invites now carry a `roleId`, not a `roleName` enum** — `createInviteRequestSchema`/
  `RoleName` changed from a fixed `z.enum(["owner","member"])` to a validated free-form string, since
  role names are no longer fixed. Verified live end-to-end: an owner creates a custom role with real
  permissions, invites a brand-new visitor straight into it, and the accepted account has that access
  immediately — no separate promotion step required.
- **Known limitation, deliberately not addressed here**: listing/creating/editing roles is gated on
  `organization.manage`, while inviting and moving members between roles is gated on
  `membership.manage` — a custom role holding `membership.manage` but not `organization.manage` could
  invite/reassign members but couldn't see which roles exist to pick from (the client-side dropdown
  degrades to disabled). Today only the built-in `"owner"` role ever holds both, so this doesn't yet
  bite in practice; revisit if a real "team admin without org admin" role is ever needed.

## Custom roles exposed a systemic gap: ancillary permissions blocking whole pages

Client-reported, with screenshots: a member whose custom role held real, meaningful permissions
(`quotation.manage`, `rental.manage`, `rfq.respond`, `auction.participate`) still hit
`403`s and a page-blocking "You do not have permission to perform this action" banner on Quotations,
plus a silently-broken notification bell everywhere. Root cause was two independent, real bugs that
custom roles made visible for the first time — previously every real user was either "owner" (every
permission, nothing ever missing) or entirely absent, so "has permission A but not B" had no live
path to hit:

- **Notifications required `organization.manage`.** A member's own organization's notifications are
  a personal/team inbox, not admin configuration — requiring the broadest admin permission just to
  see them meant no one but an owner (or a custom role deliberately granted the whole org) ever could.
  Fixed with a new, weaker `PermissionService.requireActiveMembership` (any active member, any role,
  still respects org suspension) used by `NotificationService.list`/`markRead`/`markAllRead` instead
  of `requirePermission(..., "organization.manage")`.
- **`RentalService.getRental` had no Renter branch at all** — it always required `rental.manage`,
  which is `rental_company`-only per `PERMISSION_ORGANIZATION_TYPES`, so it was literally impossible
  for any Renter to ever succeed, regardless of role or permissions. This wasn't a custom-role edge
  case — every Renter viewing `/transport/:id` or `/logsheets/:id` for their own rental hit it. Fixed
  to branch by the caller's own organization type, mirroring `listRentals`'s existing branch: a
  rental_company caller needs `rental.manage`, a renter caller needs `rental.respond` and gets the
  machine/rental-company names resolved server-side (same "look up server-side, don't grant the
  underlying permission" shape `listRentals` already used).

Beyond those two, a broader frontend pattern was audited and fixed across 16 pages: several pages
fetch multiple resources via `Promise.all`, where one resource requires a **different** backend
permission than the page's actual purpose. Previously this was invisible (the caller was always
either fully-permissioned or fully absent); with custom roles it's now a first-class scenario. A
role with `quotation.manage` but not `equipment.manage` would have the *whole* Quotations page's
`Promise.all` reject on the ancillary `listMachines` call, setting a page-level error and blocking
everything — including the parts the role genuinely has permission for.

Fix applied uniformly: each ancillary call is gated behind the actual `hasPermission(...)` check for
the permission it needs (never assumed from the page's own primary permission), defaulting to an
empty result (`Promise.resolve([])` / `null`) when absent, with the render already tolerant (or made
tolerant) of that absence — `?? "—"` placeholders, omitted KPI tiles/cards rather than misleading
zeros, matching the pattern already established in this codebase for missing machine-asset-code
lookups. Files fixed: `quotations/page.tsx`, `quotations/[id]/page.tsx`, `maintenance/page.tsx`,
`maintenance/[id]/page.tsx`, `transport/page.tsx`, `transport/[id]/page.tsx`, `logsheets/page.tsx`,
`logsheets/[id]/page.tsx`, `catalogue/page.tsx`, `catalogue/products/[id]/page.tsx`,
`machines/page.tsx`, `machines/[id]/page.tsx`, `billing/page.tsx`, `rentals/[id]/page.tsx`,
`requirements/[id]/page.tsx`, `requirements/OpenMarket.tsx`, `auctions/page.tsx`,
`dashboard/RentalCompanyDashboard.tsx`, `dashboard/RenterDashboard.tsx`. The two dashboards (the
app's home pages) needed the most care: each aggregates 5+ independently-permissioned sections with
no single "primary" permission, so KPI tiles and cards for a section the caller can't see are
**omitted**, not zeroed — "Machines: 0" would misreport "no permission" as "no fleet."

Two agent-caught regressions along the way, worth naming: (1) `transport/[id]/page.tsx` and
`logsheets/[id]/page.tsx` originally gated loading on `if (!record || !rental)` — with `rental`
permission-gated to always `null`, that would have hung on "Loading…" forever instead of rendering;
fixed to gate only on the page's own primary resource. (2) `auctions/page.tsx`'s rental-company
participant panel doesn't `return` early on its ancillary-call error, so the old code would have
shown a spurious error banner *alongside* an otherwise fully-working, already-rendered auction detail
— fixed the same way as the others (gate the call, don't let it throw) rather than suppressing the
error display, which would have hidden a genuine failure elsewhere.

**Lesson for future pages** (recorded in matha as a danger zone): before writing `Promise.all([...])`
across multiple `apiClient` calls, check whether every call requires the *same* backend permission as
the page's own primary purpose. If not, gate the mismatched one behind its own `hasPermission(...)`
check with a graceful empty/null fallback — never assume a page's own permission covers every
resource it happens to also fetch.

## Post Requirement asked for the project's name/location twice

Client-reported, with a screenshot: "Post a requirement" has a Project dropdown (a real Project,
already carrying its own name and location) directly above free-text "Project name"/"Project
location" inputs asking for the same two things again. Root cause confirmed from the codebase's own
comment in `packages/contracts/src/project/index.ts`: "A Project ... replaces the free-text
projectName/projectLocation strings previously repeated on every Requirement/Rental." When the
Project entity and `Requirement.projectId` were added (an earlier phase this session), the *old*
free-text fields were never actually removed — an unfinished migration, not a design choice.

Scoped, on request, to Requirement only (Rental carries the identical leftover fields but has no
`projectId` at all — a separate, bigger job, left alone here):

- Removed the "Project name"/"Project location" inputs from `PostRequirementDialog.tsx` and
  `EditRequirementDialog.tsx` — nothing to type, the selection already carries both.
- `createRequirementRequestSchema` no longer accepts `projectName`/`projectLocation` as caller input
  at all — `projectId` is the only way to say what project a requirement belongs to.
- Requirement's own `project_name`/`project_location` columns stay (removing them is the bigger,
  declined "full migration" option) and still matter: they're how a Rental Company sees project
  context in the cross-tenant Open Market view, which has no access to a Renter's own Project records
  (tenant isolation). `RequirementService.createRequirement` already resolved the real Project record
  to validate `projectId` — it just wasn't using the name/location already in hand. Fixed to snapshot
  `project.project_name`/`project.site_location` onto the requirement automatically, instead of
  trusting (now-removed) free text the caller would otherwise have had to retype accurately by hand.
  `seed-demo-data.ts`'s two `createRequirement` calls dropped their now-redundant explicit
  `projectName`/`projectLocation` (which already exactly matched the real project's own fields —
  further evidence this was leftover duplication, not divergent data).

Verified live: posting a requirement with no `projectName`/`projectLocation` in the request body at
all comes back with both correctly populated from the selected project.

## No date validation anywhere — past dates, and nonsensical date pairs, were all accepted

Client-reported, with a screenshot: "Post a requirement" let a past `requestedStartDate` through, and
its `validityDate` could be set to a date already in the past relative to today — nothing anywhere
stopped either. Investigating turned up the same gap everywhere in the app, not just here: every
`z.string().date()` field across Rental, Project, Maintenance, Billing, Commercial Quotation, and
Transport had zero validation, front or back — no `min` on any date `<input>`, no cross-field
ordering check anywhere except Auction's existing `endsAt > startsAt` refine. User chose the widest
scope on offer: fix every date-pair field with a real, confirmed gap, not just Requirement.

The rules aren't uniform across entities — each was decided from the entity's own actual semantics,
confirmed against `seed-demo-data.ts` and `acceptance-flows.test.ts` (both drive real services
in-process, bypassing Zod entirely, so they were useless as a red-flag but essential as a sanity check
for which "obvious" rule would have broken a deliberately-valid real scenario):

- **Requirement** (`requestedStartDate`/`validityDate`): neither may be in the past, and
  `validityDate <= requestedStartDate` — the doc comment says validityDate is when the RFQ "stops
  accepting new responses," which makes no sense after the equipment is already due on site.
- **Rental**/**Commercial Quotation** (`startDate`/`endDate`/`validityDate`): `startDate` can't be in
  the past (`docs/rental-domain-design.md`: "may be today or a future date"), `endDate >= startDate`,
  and for Quotation, `validityDate` follows the same not-in-past + `<= startDate` rule as Requirement's.
  **Deliberately NOT applied** to `createQuotationOfferRequestSchema`'s `startDate` — the counter-offer
  UI carries the quotation's existing `startDate` forward unchanged with no date picker of its own; a
  negotiation that runs long enough for that date to lapse must still be able to counter-offer. Only
  the `endDate >= startDate` ordering survives there.
- **Project**/**Maintenance** (`startDate`/`endDate`): ordering only (`endDate >= startDate`) — no
  "not in the past" rule, because backfilling a project already underway, or logging a maintenance
  window that already happened, is the normal case, not a bug. Confirmed by
  `seed-demo-data.ts` itself, which logs a maintenance record with both dates in the past.
- **Billing** (`billingPeriodStart`/`billingPeriodEnd`/`dueDate`/`paidDate`): `billingPeriodEnd >=
  billingPeriodStart` and `dueDate >= billingPeriodEnd`. No past/future restriction on any of these —
  invoicing a period that already happened is the normal case, and `seed-demo-data.ts`'s own
  `paidDate` is deliberately *ahead* of "today" (its whole demo journey is scheduled to start in the
  future), which ruled out a tempting "paidDate can't be in the future" rule.
- **Transport** (`plannedDate`/`actualDate`): no ordering rule between them at all — real dispatch can
  legitimately happen earlier or later than planned. Only `actualDate` gets a rule: can't be in the
  future (you can't record that a truck "actually" left tomorrow).
- **Auction** (`startsAt`/`endsAt`): left alone beyond its existing `endsAt > startsAt` refine. A
  tempting `startsAt` not-in-the-past addition was dropped after finding both `seed-demo-data.ts` and
  `acceptance-flows.test.ts` deliberately create an auction that started two minutes ago, to
  demonstrate immediate bidding — an intentional, real capability, not a gap.

Cross-field ordering on a *partial update* schema can't be a Zod refine (either date may be absent
from the payload) — `RequirementService.updateRequirement` and `ProjectService.updateProject` check
the merged final values (`update.field ?? existing.field`) instead, throwing `ValidationError`. Single-
field "not in the past/future" checks don't have this problem and stay in the Zod schema even for
partial updates (`updateRequirementRequestSchema`, `updateTransportRequestSchema`).

One more edit-form trap, caught before shipping: `EditRequirementDialog`'s `requestedStartDate` input
got a naive `min={today}` at first — which silently made the form **unsubmittable** for any requirement
whose start date had already organically drifted into the past while still open (the browser blocks
submission of an out-of-range value before `onSubmit` even fires, even to save an unrelated field like
quantity). Fixed to `min` = the *earlier* of today and the requirement's current value, so an unchanged
stale date stays submittable while picking a new one still can't go into the past.

Shared date-comparison helpers live at `packages/contracts/src/shared/dates.ts` (`todayIsoDate`,
`isPastIsoDate`, `isFutureIsoDate` — plain string comparison, since every date here is already
`YYYY-MM-DD`) and `apps/web/lib/format.ts` (`todayIsoDate`, for `min`/`max` attributes).

Verified live against the exact reported screenshot's values (`requestedStartDate: 2026-09-30`,
`validityDate: 2026-09-04`, with "today" being 2026-09-15) — now rejected with "Validity date cannot
be in the past."

## Open Market's "Respond" form: misaligned fields, and anchored below the whole table

Client-reported with a screenshot: the "Interested"/"Not interested" radios in the inline response
form didn't line up with the Rate/Unit/Notes fields next to them. Root cause: `Input`/`Select` each
carry their own `mb-3` on their label wrapper (meant for vertically-stacked fields), but the plain
radio `<label>`s and `<Button>`s in this *horizontal* `items-end` row didn't have it — so their
visible bottoms landed 12px below the input boxes' bottoms instead of level with them, since
`align-items` aligns the margin box, not the rendered content box.

While fixing that, a second, bigger UX problem surfaced (client-flagged): the form was rendered once,
appended after the *entire* table, regardless of which row's "Respond" was clicked — with more than a
couple of open requirements, responding to an early row meant scrolling all the way down to reach the
form that just appeared at the bottom.

Fixed both by replacing the inline `<Card>` with a `<Dialog>` (the same modal every other
create/edit form in the app already uses) instead of patching the margin mismatch in place — a modal
overlays the page regardless of scroll position, so the scroll problem doesn't exist, and its fields
stack vertically (`flex-col`), which is what `Input`/`Select`'s `mb-3` was already meant for — the
misalignment doesn't exist there either. `Card` import was dropped as no longer used in this file.

## Open Market response: rate unit could float freely, quantity vs. stock had no signal

Client raised two questions from a screenshot of the response dialog:

**"Do we allow the user to change the unit of rate while responding — is this a good approach?"**
No — checked, and it was a live bug, not just a design smell. The Requirement detail page's "Lowest
indicative"/"Rate spread"/"Lowest" badge all compared `indicativeRate` as a raw number across every
Rental Company's response, with zero unit normalization: one company quoting 6000/day and another
quoting 150000/month would show the 150000 as "not lowest" even though its per-day equivalent is
actually cheaper. Client chose to lock the response's unit to the requirement's own
`expectedDurationUnit` rather than normalize the comparison math. Implemented in
`QuotationResponseService.submitResponse`: when the requirement specifies a duration unit, that value
is used unconditionally, server-side, ignoring whatever the caller submitted — never trusting the
client for it, even though the frontend also hides the picker and shows the locked unit as read-only
in that case. Falls back to the caller's own choice only when the requirement never specified a unit
(so responses to that kind of requirement can still land in different units) — the requirement
detail page's comparison stats account for this residual case by refusing to compute "lowest"/"spread"
across a mixed-unit response set, showing "Mixed units" instead of a misleading number.

**"The renter is asking for 3 machines but the rental company only has one — isn't there supposed to
be a warning?"** Confirmed: no check existed, and more fundamentally `Requirement.quantity` isn't
wired to anything downstream at all — `Rental`/`CommercialQuotation` are both single-machine records
with no quantity concept, so there's no defined answer today for how a quantity > 1 requirement
actually gets fulfilled (one quotation covering all of them vs. several separate ones). Client chose
the lightweight fix, not designing real fulfillment tracking: the response dialog now shows the
responding Rental Company their own registered machine count for that subcategory next to the form
("You have 1 matching machine registered — this requirement needs 3") whenever it's short of the
requirement's quantity — informational only, doesn't block submission. Gated behind
`equipment.manage` like the existing "only equipment I stock" filter on this same page, for the same
reason: a role that can't see the org's fleet gets no false "0" reading.

**"Why do we need a 'Not interested' button — if a Rental Company isn't interested, they just won't
respond?"** Answered, no code change: it does two real things today — it moves the requirement out of
*that* company's own "Needs response" queue (`hasResponse` on the Open Market filters doesn't
distinguish interested from not_interested), and it gives the Renter an explicit "seen and declined"
signal in their response list, distinct from "no one's discovered it yet" — genuine market feedback a
silent non-response can't provide. Left as-is; flagged as a legitimate simplification to cut later if
wanted, not a bug.

## Notifications and dashboard "Waiting on you" links landed on list pages, not the item itself

Client-reported, portal-wide: clicking a notification, or an item in a dashboard's "Waiting on
you" panel, opened the base list route (`/requirements`, `/quotations`, `/billing`, `/machines`,
`/rentals`) instead of the specific record it was about. Audited every source of these links:

- `NotificationBell.tsx`'s `ROUTE_BY_RESOURCE_TYPE` had a comment claiming "No per-id detail route
  exists for these resources yet" for `requirement`/`quotation`/`auction` — stale; `/requirements/[id]`
  and `/quotations/[id]` detail pages both exist now (added earlier this session/phase). Fixed those
  three, and found the map was also silently missing three resource types real `notify()` calls
  actually emit — `invoice`, `work_order`, `transport` — which meant clicking those notifications did
  *nothing at all* (not even a wrong page), since a missing map entry short-circuits navigation
  entirely. Added all three.
- `RenterDashboard.tsx`/`RentalCompanyDashboard.tsx`'s "Waiting on you" (`attention`) items had the
  identical bug for quotations, invoices, requirements, machines, and rentals — only the two
  auction-related items (added later) were already correctly parametrized. Fixed all of them to the
  specific record's own link.

Two resource types have no `[id]` detail page at all, so "the exact same bug" isn't fixable the same
way for them:

- **Auction** — no detail route; `/auctions` already supports selecting one via
  `?auctionId=`/`?requirementId=` query params (used correctly by the auction-related attention
  items already). Notification links now use the same convention.
- **Invoice/Billing** — no detail route *and* no existing query-param convention at all (a flat list
  with expand-in-place rows, `InvoiceRow`). Added one: `billing/page.tsx` now reads `?invoiceId=`,
  auto-expands the matching row and highlights it — the closest equivalent an expand-in-place list
  can offer to a real detail page.

**Transport was a deeper gap, not just a wrong href**: its `[id]` page required a `rentalId` query
param to load at all (`listTransportForRental` + client-side filter by id — there was no
get-transport-by-id capability, an explicitly documented limitation in the page's own dead-end
`EmptyState` for exactly this case). A notification only carries the transport record's own id, so
this class of link could never work without fixing that underlying gap first. Added it properly, the
same shape every other single-resource lookup in this codebase already has:
`TransportRepositoryPort.findById`, `TransportService.getTransportById` (branches by organization
type — rental_company via `transport.manage`/ownership, renter via `transport.respond`/counterparty,
mirroring `listByRental`), and `GET /organizations/:organizationId/transport-records/:id`. The detail
page now resolves its own `rentalId` from the record when the query param is absent, instead of
refusing to load.

**Bonus bug caught in the same file while fixing that**: `transport/[id]/page.tsx`'s own permission
gate was `hasPermission("transport.manage")` unconditionally — `transport.manage` is
rental_company-only per `PERMISSION_ORGANIZATION_TYPES`, so this page was already unconditionally
unreachable for every Renter regardless of role, the identical "wrong org-type's permission checked"
bug class as the `getRental`/notifications fixes earlier this session. Fixed to branch by organization
type like `canGetRental` right next to it already did.

Given that, audited every other `[id]` page's own top-level `hasPermission(...)` gate (not just its
ancillary-data gates, which had already been swept earlier) for the same single-org-type mistake.
Found one more, structurally identical down to the same dead-end `EmptyState` wording:
`logsheets/[id]/page.tsx` — `canView` was hardcoded to `hasPermission("logsheet.manage")`
(rental_company-only), unconditionally blocking every Renter, even though `LogsheetService.listByRental`
already correctly branches (`logsheet.respond` for a renter counterparty). Fixed the same way as
Transport: `LogsheetRepositoryPort.findById`, `LogsheetService.getLogsheetById`, a new
`GET /organizations/:organizationId/logsheets/:id` route, and the frontend gate + rentalId resolution
fixed to match. `maintenance/[id]/page.tsx`'s equivalent gate was checked too and found correct as-is —
every `MaintenanceService` method requires `maintenance.manage` with no renter-facing counterpart at
all (no `maintenance.respond` permission exists), so Maintenance is genuinely rental-company-internal
by design, not a bug.

## "Request quotation" didn't request anything

Client-reported, with a screenshot: on a Renter's Requirement detail page, a Rental Company that
responded "interested" but hasn't yet formalized a `CommercialQuotation` shows a "Request quotation"
link — it just navigated to `/quotations?requirementId=...`, the Renter's own Quotations page. Checked
what that actually does for a Renter: `CreateQuotationDialog` (the thing that `requirementId` query
param is meant to open) only renders when `organizationType === "rental_company"` — for a Renter it's a
complete no-op, landing on a plain list with nothing pre-filled and no way to act on it. Renters can't
create quotations at all (`quotation.manage` is rental_company-only); the button's entire premise was
navigating the wrong party to a screen only the *other* party can use.

The real ask, per the button's own label and the client's report: tell the Rental Company the Renter
wants a formal quotation. Added the actual action instead of a broken redirect:
- New notification type `requirement.quotation_requested`.
- `QuotationResponseService.requestQuotation(userId, renterOrganizationId, requirementId,
  rentalCompanyOrganizationId)` — `rfq.manage` (Renter-only), requires the target company's own
  response to exist and be `"interested"` (`ConflictError` otherwise), then notifies that company.
  Deliberately **not** wrapped in the "swallow notification failures" try/catch every other caller in
  this codebase uses — those calls have already done their real DB write and the notification is a
  side effect; here, notifying the Rental Company *is* the entire business action, so a failure has to
  surface to the Renter rather than silently doing nothing while returning success.
- `POST /organizations/:organizationId/requirements/:requirementId/responses/:rentalCompanyOrganizationId/request-quotation`.
- The Rental Company's notification needs its own `relatedResourceType` (`quotation_request`, not
  `requirement`) — `/requirements/[id]` is Renter-only, so a Rental Company clicking a plain
  `requirement`-typed notification would hit a permission wall. Routes to
  `/quotations?requirementId=...` instead — the create-quotation flow that param shape was always
  meant for.
- Frontend: the link is now a button that calls the endpoint and swaps to "Requested" in place,
  instead of navigating the Renter anywhere — the whole point was to notify someone else, not to send
  the Renter to a different page.

Verified live end-to-end: submitted an interested response as a Rental Company, called
"Request quotation" as the Renter, confirmed the notification actually landed in the Rental Company's
own notification list with the right type/message/link. Also verified the guard rails: a Rental
Company calling this on itself gets 403 (`rfq.manage` is Renter-only), and requesting from a company
that never responded (or responded not-interested) gets a 409 `ConflictError`.

## Clicking "Quotation requested" landed on Quotations but never opened the form

Client-reported, right after the previous fix shipped: clicking the new "Quotation requested"
notification navigated to `/quotations?requirementId=...` correctly, but `CreateQuotationDialog` never
opened — no pre-filled form, just the plain list.

Root cause: `const [createOpen, setCreateOpen] = useState(Boolean(requirementIdParam ||
sourceAuctionIdParam))` — a `useState` **initializer**, which only runs once, at first mount. The
notification bell navigates with `router.push(...)`, a same-route, query-only transition — the App
Router doesn't remount the page for that, only re-renders it with the new `searchParams`. So if
`QuotationsPage` was already mounted (which it very often is — the sidebar nav, prior visits, or
simply having the tab open), `createOpen`'s initializer never re-runs and silently stays `false`
forever, no matter what the URL says. The tell was sitting two lines below it the whole time: the
`quotationIdParam` redirect already does this correctly, as a `useEffect` that re-runs whenever the
param actually changes — proof this is a real bug, not a design choice, and exactly what the fix
should mirror. Added the matching effect: `useEffect(() => { if (requirementIdParam ||
sourceAuctionIdParam) setCreateOpen(true) }, [requirementIdParam, sourceAuctionIdParam])`.

**Caught the identical bug in my own prior commit before it was even reported**: `billing/page.tsx`'s
`InvoiceRow` had `const [expanded, setExpanded] = useState(Boolean(highlighted))` — same
initializer-vs-query-only-navigation mismatch, meaning the `?invoiceId=` deep link I'd just built would
correctly fetch the invoice's detail (that part *was* a reactive `useEffect`) but never actually expand
the row to show it, for the exact same reason. Fixed by moving `setExpanded(true)` into the existing
reactive effect instead of the state initializer.

**Not chased further, flagged instead**: the same `useState(Boolean(...))`/`useState(searchParams.get(...))`
pattern also exists for tab state in `settings/page.tsx`, `machines/[id]/page.tsx`, and
`rentals/[id]/page.tsx` (e.g. the sidebar's "Organization" link to `/settings?tab=organization`, clicked
while already on `/settings` in a different tab). Plausibly the same bug, but unverified and unreported
— left alone rather than speculatively rewritten; worth a look if a similar "link doesn't do what it
says" report comes in for those.

## Full sweep of the useState-from-searchParams bug, plus three Create Quotation gaps

Client asked to check every screen for the same bug class just fixed on Quotations/Billing, and
separately flagged three more issues on the "Create a quotation" form from a screenshot. Handled
together since they touched the same two files.

**The searchParams sweep** (dispatched to an agent, since it needed checking every `<Link>`/
`router.push` across the app against every `useState` seeded from `useSearchParams()`, not just
grep hits): confirmed the App Router remounts a page for neither a query-only change **nor a
changed `[id]` dynamic segment** (verified: no `key={id}` anywhere, no `template.tsx` files) — so
the bug applies to cross-record navigation too, not just query-only. Found and fixed three more real
instances:
- `settings/page.tsx`'s `tab` state — the sidebar's "Organization"/"Settings" links do nothing while
  already on Settings in a different tab. Fixed with the same `useEffect(() => { if (tabParam)
  setTab(tabParam) }, [tabParam])` idiom.
- `machines/[id]/page.tsx` and `rentals/[id]/page.tsx`'s `tab` state — opening a notification/search
  hit for a *different* machine or rental lands on the new record's page still showing whatever tab
  was selected for the previous one, since a changed `[id]` doesn't remount either. Fixed with
  `useEffect(() => { setTab(searchParams.get("tab") ?? "overview") }, [id])` — unconditional and
  keyed on `id`, so a fresh id with no tab param correctly resets to "overview" instead of staying
  wherever it was.
- `CreateQuotationDialog.tsx`'s `loadingContext`/`loadingAuctionPrefill` — the dialog stays mounted
  (only `open` toggles), so a second notification for a *different* requirement arriving after these
  flags already settled to `false` never flips them back to `true`; the form briefly rendered as a
  manual quotation (no requirement banner, no locked renter, no pre-filled rate) for the duration of
  the re-fetch. Fixed by setting them `true` at the start of each effect, not just relying on the
  mount-time initializer.

Checked and confirmed **not** live bugs, left alone: `auctions/page.tsx`'s `selectedRequirementId`
(every path to `/auctions?requirementId=...` crosses a different route first, always a fresh mount),
`transport/[id]/page.tsx`'s `rentalId` (self-healing — the data-loading effect already unconditionally
calls `setRentalId` on every relevant param change), and `CreateQuotationDialog`'s `customerMode`
initializer (masked by `isFromRequirement`, itself a correctly-recomputed plain `const`, not stateful —
no observable symptom).

**Three more issues on Create Quotation, all client-reported from one screenshot:**

1. **"The rate unit lets you change it instead of keeping what was requested."** Same fix as
   `QuotationResponseService.submitResponse`'s `indicativeRateUnit` from a few commits earlier:
   `CommercialQuotationService.createQuotation` now locks `rateUnit` to the requirement's own
   `expectedDurationUnit` when it has one, server-side and unconditional. The dialog hides the picker
   and shows the locked unit read-only in that case, same UI pattern as the Open Market response
   dialog.
2. **"If the requirement needs more than one machine, we only let the user pick one."** Confirmed
   the data model already supports it — `commercial_quotations` has no unique constraint on
   `requirementId` alone, so multiple quotations against the same requirement (one per machine) were
   always possible, the dialog just never let you pick more than one. Changed the Machine field from
   a single `<Select>` to a checkbox list; submitting now creates one `CommercialQuotation` per
   selected machine, all with the same terms (the Renter asked for N of the same equipment type, not
   N different deals) — partial failures are reported by asset code rather than silently dropped, and
   the dialog only closes once every selected machine succeeded.
3. **Client asked for a "Requested" filter + count on the Quotations page**, so a Rental Company
   doesn't have to rely on still having the notification to find what's waiting on them. This needed
   real persistence, not just reading notifications: added `quotation_responses.quotation_requested_at`
   (migration `0028`), set by `QuotationResponseService.requestQuotation` (persisted *before* the
   notification send — it's the durable record of the ask, independent of whether the notification
   itself is ever delivered/read/kept) alongside a new `listRequestedQuotations` method/route,
   `GET .../requested-quotations`. The Quotations page fetches this list (rental_company only) and
   cross-references it against existing quotations' `quotationResponseId` to drop off ones already
   formalized, rendering a distinct table (no CommercialQuotation exists yet for these) with a
   "Create quotation" action per row that opens the same dialog, prefilled.

   **That cross-reference exposed a real, separate, pre-existing bug while building it**:
   `CreateQuotationDialog` never actually sent `quotationResponseId` when creating a quotation from a
   requirement — the field exists on the contract and the backend already validates it correctly (see
   the "Path A" test `commercial-quotation-service.test.ts` had all along), the frontend just never
   populated it. This meant every commercial quotation ever formalized from a response was silently
   unlinked from that response — which is also why the Renter's requirement detail page's "Open
   {reference}" link next to an interested response has likely never actually resolved
   (`quotationByResponseId` had nothing to match against). Fixed by having the dialog also fetch the
   Rental Company's own response for the requirement (best-effort — creating straight from Open
   Market with no prior response is still valid) and include its id in the create payload.

Verified live end-to-end: created a requirement with `expectedDurationUnit: month`, submitted a
response with `day`, requested a quotation, confirmed it appears in `GET .../requested-quotations`;
created a quotation for it with `rateUnit: day` in the payload and confirmed it came back `month`;
created a second quotation against the same requirement for a different machine (no unique-constraint
conflict, confirming the multi-machine fan-out is safe); created a third quotation explicitly passing
`quotationResponseId` and confirmed it round-trips correctly linked.

## Tooling: matha (persisted AI memory)

Wired up as the project's memory layer: `.matha/` holds intent, business rules, and scope boundaries (seeded once from a throwaway `requirements.md`, now removed); `.mcp.json` registers it as a project MCP server; the Claude Code `SessionStart` hook (`.claude/settings.json`) auto-injects the brief; `CLAUDE.md` carries the `matha_brief()`/`matha_record()` convention for future sessions. Machine-specific/regenerable output (`.matha/mcp-config.json`, `cortex/analysis.json`, `cortex/stability.json`, `cortex/co-changes.json`) is gitignored.
