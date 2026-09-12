# Backend Hardening Report

Living document, updated as each frontend-revamp phase (see `feat/frontend-revamp`)
surfaces backend behavior that appears too permissive while wiring up real
screens against real data. These are observations only — nothing here is
fixed on the frontend branch; it is input for a later backend-hardening pass.

Format per entry: current behavior, expected business rule, why it matters,
affected domain, recommended enforcement, validation location.

---

No entries yet. Phase 1 (design system + application shell) touched only
chrome around existing pages — layout, navigation, header — and did not
exercise domain read/write paths, so no business-rule permissiveness was
observed. Entries will accumulate as later phases (dashboards, machines,
marketplace, quotations, auctions, rentals/operations, billing) integrate
against real data and real user flows.

## Template for new entries

```
### Current behavior


### Expected business rule


### Why it matters


### Affected domain


### Recommended backend enforcement


### Validation location

```
