# Security review

Status: complete for this pass. A systematic audit (not a formal certification) of authorization,
injection, session/auth, input validation, error handling, and cross-tenant isolation across the
full backend — 14 application services, 12 route files, every repository's SQL usage, and the
identity/session/password modules. No Critical, High, or Medium findings. Two Low findings fixed;
three Informational items reviewed and either fixed or explicitly accepted.

## Fixed

1. **Login timing side-channel (user enumeration).** `AuthService.login` used to short-circuit on
   `!user`, so a nonexistent email returned near-instantly while a real email with a wrong password
   took a full scrypt computation — an attacker measuring response time could enumerate valid
   accounts even though the error message is identical. Fixed by always running `verifyPassword`
   (against a fixed `DUMMY_PASSWORD_HASH` when no user exists), so the timing profile no longer
   depends on account existence.
2. **No rate limiting on `/auth/login` / `/auth/signup`.** Added `@fastify/rate-limit`, registered
   globally disabled (`global: false`) and opted into only by these two routes (10 requests/minute,
   keyed by IP) — the rest of the API is unaffected. Verified live: the 11th rapid attempt in a
   minute returns `429` with a plain retry-after message, no internal detail leaked.
3. **Machine asset-code create/insert had no unique-violation translation.** Unlike
   `RentalRepository`/`TransportRepository`, `MachineRepository.create` didn't catch SQLSTATE `23505`
   on the rare race where two requests pass the `assetCodeExists` pre-check together — it would have
   surfaced as a generic 500 instead of a clean `409 Conflict`. Not a security hole (no leakage,
   `app.ts`'s handler already keeps raw driver errors server-side-only), but a correctness/robustness
   gap fixed for consistency with the rest of the codebase's constraint-violation pattern.

## Reviewed and accepted as-is (no code change)

- **RFQ/Auction discovery endpoints skip ownership scoping by design.**
  `RequirementService.discoverRequirements`/`getRequirementForDiscovery` and
  `AuctionService.getActiveAuctionForRequirement` return full records to any Rental Company holding
  the relevant permission, with no per-organization filter — this is the intended behavior for a
  broadcast marketplace (docs/marketplace-core-loop-design.md §4), not an oversight. Confirmed the
  free-text `notes` field on a Requirement is genuinely meant to be visible to every competing Rental
  Company, matching how a real RFQ works.
- **Two permission codes (`organization.manage`, `membership.manage`) are declared but unused** — no
  service currently checks them (there's no membership-invite flow yet). Dead/reserved surface, not
  an escalation path; left as-is since removing them would just have to be re-added the moment that
  flow is built.

## Confirmed safe (what was checked, not just what was wrong)

- **Authorization/IDOR** — every application-service method that accepts a resource id was checked
  and verifies the resource's actual owning organization against the caller's claimed
  organizationId, on top of the permission check — never permission alone. Dual-party resources
  (CommercialQuotation, Auction) verified correct on both sides, including that a _third_,
  unrelated organization is excluded, not just the non-caller party.
- **SQL injection** — all 9 raw `sql` tagged-template call sites use `${}` parameterization; zero use
  of `sql.raw()` or string-built queries anywhere in the codebase.
- **Auth/session** — scrypt with a random salt + `timingSafeEqual` compare; 256-bit session tokens,
  SHA-256 hashed at rest, never logged or stored in plaintext; httpOnly + signed + `sameSite: lax` (+
  `secure` in production) cookies; logout invalidates the session row server-side; the app refuses to
  boot without a real `SESSION_COOKIE_SECRET`.
- **Input validation boundary** — every route handler accepting a body validates it through a Zod
  schema before it reaches a service; the only unauthenticated, unvalidated routes are the three
  intentionally-public catalogue reference-data endpoints.
- **Error leakage** — the global error handler never returns a raw driver error, stack trace, or file
  path to a client; unrecognized errors always collapse to a fixed `internal_error` message.
- **Cross-tenant leakage in list/aggregate endpoints** — every `listBy*`/utilization/aggregate query
  filters by an organization or resource id the service layer derived from the authenticated caller,
  never a raw client-supplied filter.

## Known, accepted gap

No CAPTCHA or progressive backoff beyond the flat per-IP rate limit above — acceptable for an MVP;
worth revisiting if abuse is ever actually observed in production.
