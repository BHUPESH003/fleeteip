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

## Tooling: matha (persisted AI memory)

Wired up as the project's memory layer: `.matha/` holds intent, business rules, and scope boundaries (seeded once from a throwaway `requirements.md`, now removed); `.mcp.json` registers it as a project MCP server; the Claude Code `SessionStart` hook (`.claude/settings.json`) auto-injects the brief; `CLAUDE.md` carries the `matha_brief()`/`matha_record()` convention for future sessions. Machine-specific/regenerable output (`.matha/mcp-config.json`, `cortex/analysis.json`, `cortex/stability.json`, `cortex/co-changes.json`) is gitignored.
