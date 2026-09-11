# FleetIP Autonomous MVP Build Mission

## 1. Mission

You are acting as the **senior architect, lead backend engineer, lead frontend engineer, QA engineer, security reviewer, database engineer, and UI/UX reviewer** for the FleetIP project.

Your mission is to take the **existing FleetIP repository from its current state to a production-ready MVP**.

You are expected to work autonomously and iteratively.

Do not stop after implementing features.

You must:

```text
Understand
→ Inspect
→ Plan
→ Implement
→ Run
→ Test
→ Debug
→ Review
→ Screenshot
→ Visually inspect
→ Improve
→ Regression test
→ Continue
```

Continue this loop until the complete MVP satisfies the acceptance criteria in this document.

The goal is not to produce the maximum amount of code.

The goal is to produce a **coherent, maintainable, secure, tested, responsive, production-ready FleetIP application**.

---

# 2. First Rule: Inspect Before Changing

Before writing code:

1. Inspect the entire repository.
2. Read the existing architecture documentation.
3. Inspect existing modules.
4. Inspect existing database migrations.
5. Inspect existing frontend routes/components.
6. Inspect existing tests.
7. Inspect package configuration.
8. Inspect existing implementation of:

   - Identity
   - Organizations
   - Memberships
   - Permissions
   - Product Catalogue
   - Equipment
   - Rental

9. Determine what is actually implemented versus what documentation merely describes.
10. Run the existing test/typecheck/lint/build commands.

Create an internal implementation plan based on the **actual repository**, not assumptions.

Do not recreate completed functionality.

Do not replace working architecture merely because you prefer another approach.

---

# 3. Authority Hierarchy

When making decisions, follow this order:

```text
1. Existing FleetIP architecture contract
2. Existing working implementation
3. Locked FleetIP business decisions
4. Existing domain designs
5. MVP scope in this document
6. Engineering judgment
```

If two existing documents conflict:

- inspect the implementation,
- identify the conflict,
- choose the least destructive interpretation,
- document the decision.

Do not silently introduce a new architecture.

If a genuinely unresolved **business decision** blocks implementation, stop and ask.

Do NOT stop for routine engineering decisions.

---

# 4. Existing FleetIP Architecture

FleetIP is an equipment rental/fleet platform.

The central business object is the **physical Machine**.

The long-term lifecycle is:

```text
Manufactured
    ↓
Sold
    ↓
Registered
    ↓
Added to FleetIP
    ↓
Verified
    ↓
Available
    ↓
RFQ / Inquiry
    ↓
Quoted
    ↓
Awarded
    ↓
Reserved
    ↓
Transport Planned
    ↓
Mobilized
    ↓
Delivered
    ↓
On Rent
    ↓
Operator Assigned
    ↓
Daily Logsheet
    ↓
Utilization
    ↓
Maintenance
    ↓
Billing
    ↓
Payment
    ↓
Extension / Off Rent
    ↓
Demobilization
    ↓
Available Again
```

The MVP focuses on the equipment rental workflow around this lifecycle.

---

# 5. Technology Architecture

Use the existing stack.

### Frontend

- Next.js
- App Router
- TypeScript
- existing UI/design system
- Tailwind where already established

### Backend

- Fastify
- TypeScript
- modular monolith

### Database

- PostgreSQL
- Kysely
- `pg`

### Validation / Contracts

- Zod
- shared contracts package

### Storage

- S3-compatible object storage where required

### Optional infrastructure

- Redis only where there is an actual requirement
- Do not introduce Redis merely because it may be useful later

### Monorepo

Preserve the existing structure:

```text
fleetip/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── contracts/
│   ├── ui/
│   └── config/
├── infrastructure/
│   ├── database/
│   └── docker/
└── docs/
```

Do not turn this into microservices.

---

# 6. Backend Architecture Rules

Use:

```text
Presentation
    ↓
Application
    ↓
Domain
    ↓
Interfaces / Ports
    ↓
Infrastructure
```

Business logic must not depend directly on:

- Fastify
- Kysely
- PostgreSQL
- HTTP request objects

Repositories belong behind interfaces/ports.

Routes should be thin.

Services/use cases should contain application orchestration.

Domain logic should remain independently testable.

Kysely belongs in infrastructure.

Do not create a giant generic repository abstraction.

Prefer business-relevant repositories.

---

# 7. Identity and Authorization

The identity model is:

```text
User
  ↓
Membership
  ↓
Organization
  ↓
Role
  ↓
Permission
```

A User can belong to multiple Organizations.

An Organization represents a company.

MVP organization types:

```text
rental_company
renter
```

Do not use:

- company prefix
- username
- organization code

as identity or tenant isolation.

Use immutable IDs.

Tenant isolation must be enforced server-side.

Frontend permission checks are UX only.

Backend authorization is authoritative.

Authorization must check:

```text
User
→ Membership
→ Organization
→ Organization type
→ Permission applicability
→ Role permission
→ Resource ownership
→ Domain rules
```

Do not rely solely on `role_permissions`.

Organization-type applicability must be enforced centrally.

---

# 8. Existing Product Catalogue Model

FleetIP does NOT have company-level Machine Models.

The platform has a shared catalogue:

```text
ProductCategory
    ↓
ProductSubcategory
    ↓
Product
    ↓
Machine
```

### Product

Product is a platform-level model/catalogue definition.

Conceptually:

```text
id
productCategoryId
productSubcategoryId
manufacturer
name
capacity
capacityUnit
specifications JSONB
createdAt
```

Product owns model-level information.

### Machine

Machine is a serialized physical asset owned by an organization.

Conceptually:

```text
id
organizationId
productId
assetCode
chassisNumber
registrationNumber
yearOfManufacture
status
createdAt
```

Machine status:

```text
active
under_maintenance
retired
```

Do not move rental availability onto Machine.

Do not duplicate Product specifications onto Machine without a concrete requirement.

Machine references Product.

Product is not owned by a rental company.

---

# 9. Rental Is Already Completed

Do not rebuild Rental unless your inspection reveals a genuine defect.

Rental is the agreed rental engagement.

The relationship is:

```text
Rental Company
      ↓
    Rental
      ↓
    Machine
      ↓
   Product
```

Customer can be:

```text
FleetIP Renter Organization
```

OR:

```text
External Client Snapshot
```

Exactly one must be present.

Rental uses a real `machineId`.

Do not use free-text machine references.

Rental availability is derived from Rental records.

Do not store availability directly on Machine.

Rental dates are:

- calendar dates
- no time component
- inclusive start/end dates
- `endDate = null` means open-ended

Committed statuses currently include:

```text
confirmed
active
off_rent
```

These block overlapping rentals.

Completed/cancelled do not.

No two committed Rentals may overlap for the same Machine.

Use:

1. application-level conflict check
2. PostgreSQL-level enforcement

Translate database conflicts into application-level conflict errors.

Rental lifecycle:

```text
confirmed
    ↓
active
    ↓
off_rent
    ↓
completed
```

Cancellation can occur from:

```text
confirmed
active
off_rent
```

Terms can be changed while confirmed.

Once active, terms become immutable.

`extended` is not a Rental status.

Do not introduce a separate Contract entity for MVP.

---

# 10. MVP Scope

You must implement the following complete MVP.

```text
FOUNDATION                 ✅
PRODUCT CATALOGUE          ✅
EQUIPMENT / MACHINES       ✅
RENTAL                     ✅

RFQ / REQUIREMENTS         ← build
QUOTATIONS                 ← build
NEGOTIATION                ← build
AUCTIONS                   ← build
RENTAL EXECUTION           ← build
LOGSHEETS                  ← build
UTILIZATION                ← build
BILLING                    ← build
PAYMENTS / RECEIVABLES     ← build
BASIC MAINTENANCE          ← build
TRANSPORT / MOBILIZATION   ← build
```

Do not assume that completing the individual modules means the MVP is complete.

The workflows between modules are part of the MVP.

---

# 11. RFQ / Requirements

Build the requirement/RFQ workflow based on the existing FleetIP business model.

Legacy concepts include:

```text
req_by_epc
notinterested_rental
closed_requirement_epc_latest
```

These represent requirements/RFQs.

The new system must NOT reproduce the legacy table structure.

A Requirement should represent:

- who requested it
- equipment category/subcategory/product requirements
- capacity where applicable
- quantity
- project information
- location
- rental duration
- shift requirements
- requested start date
- validity
- status
- timestamps

Define appropriate statuses based on actual workflow.

A renter should be able to create a requirement.

Rental companies should be able to discover eligible requirements.

Rental companies should be able to:

- respond
- decline/not interested
- provide an offer

Closing a requirement must not destroy historical data.

Do not reproduce the legacy pattern of moving records into separate "closed" tables.

---

# 12. Quotations

The MVP must support two real business paths.

### Path A

```text
Renter
 ↓
RFQ
 ↓
Rental Company Response
 ↓
Quotation
 ↓
Award
 ↓
Rental
```

### Path B

```text
Known Customer
 ↓
Quotation
 ↓
Award
 ↓
Rental
```

Direct Rental creation remains technically possible where appropriate.

Quotation must support commercial terms such as:

- machine
- rate
- rate unit
- rental period
- mobilization
- demobilization
- payment terms
- shift
- overtime
- fuel terms
- operator scope
- validity
- commercial notes
- terms/conditions

Do not copy the old quotation tables directly.

Quotation history must be preserved.

---

# 13. Negotiation

Support the MVP's practical negotiation workflow.

Do not build a complicated chat platform.

The minimum useful model should support:

```text
Offer
 ↓
Counter offer
 ↓
Counter offer
 ↓
Accepted / Rejected / Expired
```

Preserve historical versions.

Do not overwrite the original commercial offer in a way that destroys history.

Make the final accepted commercial terms explicit.

---

# 14. Auctions

Auctions are **MVP**, not future scope.

Use PostgreSQL as the source of truth.

Core conceptual model:

```text
AUCTION
    |
    +── AUCTION_PARTICIPANT
    |
    +── BID
    |
    +── AUCTION_EVENT
    |
    +── AUCTION_RESULT
```

Auction implementation must provide:

- auction creation
- eligibility
- participants
- start/end
- bidding
- authoritative server time
- bid validation
- bid ordering
- auction closing
- winner/result
- audit history
- duplicate/idempotent request protection
- authorization
- tenant isolation

Never trust client timestamps for auction ordering.

Never trust client authorization.

Do not use Redis as the source of truth.

Redis may later support realtime updates if actually required.

The database remains authoritative.

Test:

- simultaneous bids
- invalid bids
- unauthorized bids
- bids after close
- duplicate requests
- closing race conditions
- participant isolation
- winner calculation

If auction UI requires realtime updates, implement a sensible MVP solution without compromising database correctness.

---

# 15. Rental Execution

After a Rental is awarded/confirmed, support execution.

Execution should represent the operational life of the machine on rent.

Minimum workflow:

```text
Rental
 ↓
Mobilization
 ↓
Delivered
 ↓
Active / On Rent
 ↓
Daily Operations
 ↓
Off Rent
 ↓
Demobilization
 ↓
Completed
```

Do not put all execution data back onto Machine.

Keep operational records separate.

---

# 16. Logsheets

Build a practical daily logsheet model.

A logsheet should be associated with:

```text
Rental
Machine
Date
```

Support appropriate operational information such as:

- operating hours
- shift
- overtime
- idle hours where relevant
- operator information when available
- fuel information where applicable
- remarks
- customer/project confirmation if required

Do not over-generalize every possible machine's telemetry into the first version.

Use structured fields where the concept is universal.

Use flexible fields where equipment-specific details genuinely vary.

Logsheets must support historical records.

---

# 17. Utilization

Use logsheets/execution records to provide useful utilization information.

At minimum support:

- total rental days
- operating hours
- utilization where calculable
- overtime
- machine-level history

Do not build an enterprise analytics platform.

Build the operational MVP needed by rental companies.

---

# 18. Billing

Build billing around the actual Rental and execution data.

Billing should be capable of representing:

```text
Rental
 ↓
Billable usage / rental period
 ↓
Invoice
 ↓
Receivable
 ↓
Payment
```

Support appropriate:

- invoice number
- customer
- rental
- billing period
- line items
- quantity
- rate
- taxes where applicable
- adjustments
- total
- due date
- status
- payment records

Do not hard-code one country's tax system unless already specified by the project.

Keep taxation extensible.

Do not allow billing to silently change historical Rental terms.

---

# 19. Maintenance

Implement basic maintenance.

At minimum:

```text
Machine
 ↓
Maintenance Record / Work Order
 ↓
Maintenance period
 ↓
Machine unavailable
```

Support:

- maintenance creation
- type/reason
- start/end
- status
- notes
- machine relationship

Maintenance must integrate with availability.

A machine under maintenance should not become available for a conflicting rental.

Do not build a complete CMMS in MVP.

---

# 20. Transport / Mobilization

Implement the MVP transport/mobilization workflow.

At minimum:

```text
Rental
 ↓
Mobilization
 ↓
Transport
 ↓
Delivery
 ↓
Demobilization
```

Support useful information such as:

- machine
- rental
- pickup
- destination
- planned date
- actual date
- status
- transport details
- charges
- notes

Do not build a complete logistics marketplace.

Keep the domain extensible.

---

# 21. Legacy Data

Legacy FleetIP data contains concepts such as:

- `fleet1`
- `fleet`
- `oem_fleet`
- `linked_equipment`
- `rentallinkedequipment`
- `req_by_epc`
- `notinterested_rental`
- `closed_requirement_epc_latest`
- `requirement_price_byrental`
- `quotation_generated`
- `quotation_status`
- `workorder`
- `logsheet`
- `logsheetnew`

Treat these as **business evidence**, not as the target database schema.

The legacy system mixes:

- machines
- rental state
- work orders
- operators
- compliance
- customer information
- execution information

into large tables.

Do not reproduce that design.

Normalize the new system around proper domain boundaries.

---

# 22. Frontend Product Quality

The frontend is not considered complete simply because the pages function.

The final application must look and behave like a serious commercial product.

Use the existing FleetIP design system.

Improve it where necessary.

Maintain consistency across:

- typography
- spacing
- forms
- buttons
- tables
- cards
- navigation
- dialogs
- alerts
- badges
- empty states
- loading states
- error states
- confirmations

Avoid visual clutter.

Do not make every page look like a generic admin template.

The UI should make the FleetIP workflows obvious.

---

# 23. Responsive Requirements

Every major workflow must work on:

```text
Desktop
Tablet
Mobile
```

Test at representative viewport sizes.

Pay particular attention to:

- navigation
- tables
- filters
- forms
- modals
- auction bidding
- quotation comparison
- rental creation
- logsheets
- billing
- cards
- action buttons

Do not solve mobile responsiveness by simply allowing horizontal overflow everywhere.

Where appropriate:

```text
desktop table
→
mobile cards / stacked records
```

Forms must remain usable on small screens.

---

# 24. Screenshot-Based UI Review

This is mandatory.

For important screens:

1. Open the application.
2. Authenticate using test accounts.
3. Navigate to the screen.
4. Capture screenshot at desktop size.
5. Capture screenshot at tablet size.
6. Capture screenshot at mobile size.
7. Inspect the screenshots.
8. Identify visual/UX problems.
9. Fix them.
10. Capture screenshots again.
11. Repeat until the screen is genuinely polished.

Review for:

- alignment
- spacing
- hierarchy
- readability
- overflow
- clipping
- inconsistent controls
- awkward empty space
- poor mobile layouts
- broken tables
- poor loading states
- unclear actions
- inconsistent terminology

Do not merely report that screenshots were taken.

Use them to improve the product.

---

# 25. End-to-End Testing

Create realistic end-to-end scenarios.

At minimum:

### Scenario 1: Machine

```text
Rental Company
→ login
→ create/select catalogue product
→ create machine
→ view machine
→ edit machine
```

### Scenario 2: RFQ

```text
Renter
→ create requirement
→ Rental Company sees requirement
→ Rental Company responds
```

### Scenario 3: Quotation

```text
Rental Company
→ create quotation
→ renter views quotation
→ negotiation
→ acceptance
```

### Scenario 4: Rental

```text
Award
→ Rental
→ confirm
→ activate
→ execution
→ off rent
→ complete
```

### Scenario 5: Auction

```text
Create auction
→ add participants
→ participants bid
→ invalid bid rejected
→ unauthorized bid rejected
→ auction closes
→ winner determined
```

### Scenario 6: Execution

```text
Rental
→ mobilization
→ delivery
→ logsheet
→ utilization
```

### Scenario 7: Billing

```text
Rental
→ billable period
→ invoice
→ receivable
→ payment
```

### Scenario 8: Maintenance

```text
Machine
→ maintenance
→ unavailable
→ maintenance completed
→ available
```

### Scenario 9: Transport

```text
Rental
→ transport planned
→ dispatched
→ delivered
→ demobilization
```

---

# 26. Authorization Tests

Explicitly test cross-organization access.

Examples:

```text
Rental Company A
cannot access Rental Company B machines.

Rental Company A
cannot access another company's rentals.

Renter A
cannot access Renter B data.

Renter
cannot call rental-company-only endpoints.

Unauthorized users
cannot manipulate auction bids.

Frontend hiding a button
must never be treated as authorization.
```

Test both:

- UI behavior
- direct API requests

---

# 27. Database Quality

For every domain verify:

- primary keys
- foreign keys
- unique constraints
- check constraints
- indexes
- appropriate nullability
- timestamps
- transaction boundaries
- historical integrity

Avoid unnecessary denormalization.

Do not add indexes blindly.

Do not create JSONB fields as an excuse to avoid modeling important relationships.

Use JSONB where data is genuinely flexible.

---

# 28. Error Handling

Errors must be consistent.

Never expose:

- raw PostgreSQL errors
- stack traces
- internal implementation details
- sensitive information

to normal users.

Application errors should have clear semantics.

Examples:

```text
NotFound
Unauthorized
Forbidden
ValidationError
Conflict
InvalidStateTransition
```

Database constraint failures must be translated appropriately.

---

# 29. Security Review

Before declaring completion, perform a security review.

Check:

- authentication
- password handling
- sessions
- cookies
- authorization
- tenant isolation
- object-level authorization
- input validation
- SQL injection
- XSS
- CSRF considerations
- file upload handling
- sensitive error leakage
- auction manipulation
- duplicate requests
- race conditions
- insecure direct object references

Do not claim a formal security certification.

Identify remaining risks honestly.

---

# 30. Performance Review

Do a practical MVP performance review.

Look for:

- N+1 queries
- unnecessary database calls
- missing indexes
- huge API responses
- unnecessary frontend requests
- expensive repeated queries
- inefficient list pages
- unbounded data loading

Do not prematurely optimize.

Fix demonstrated or obvious problems.

---

# 31. Testing Standards

The final repository must have meaningful tests.

Include appropriate:

```text
Unit tests
Integration tests
API tests
Database tests
Frontend tests
End-to-end tests
Authorization tests
Regression tests
```

Do not inflate coverage with meaningless tests.

Test business rules.

Especially test:

- state transitions
- ownership
- permissions
- availability
- double booking
- auction bidding
- auction closing
- quotation negotiation
- billing calculations
- maintenance availability

---

# 32. Migration Quality

A clean database must be able to reach the current schema from migrations.

Verify:

```text
empty database
→ all migrations
→ application starts
→ seed/test data
→ workflows work
```

Do not rely on a developer's manually modified local database.

---

# 33. Seed / Demo Data

Create sensible development/demo data where useful.

Include at least:

- Rental Companies
- Renters
- Users
- Products
- Machines
- Rentals
- Requirements
- Quotations
- Auctions
- Logsheets
- Invoices
- Maintenance records
- Transport records

Do not use unrealistic random data everywhere.

The demo environment should make it possible to demonstrate FleetIP to a business owner/investor.

---

# 34. Investor / Business Demonstration Flow

At the end, there must be a coherent demo journey.

A business owner should be able to see:

```text
Catalogue
 ↓
Fleet
 ↓
Requirement
 ↓
Supply response
 ↓
Quotation
 ↓
Auction / Award
 ↓
Rental
 ↓
Mobilization
 ↓
Execution
 ↓
Logsheet
 ↓
Billing
 ↓
Payment
 ↓
Machine history
```

The UI should make this journey understandable.

---

# 35. Documentation

Update documentation as implementation evolves.

At minimum maintain:

```text
Architecture
Domain decisions
Database/domain relationships
API/use cases
Setup instructions
Development commands
Testing instructions
Environment configuration
Known limitations
```

Do not write documentation that claims functionality which does not exist.

---

# 36. Git Discipline

Use meaningful commits.

Prefer:

```text
feat(rfq): ...
feat(quotation): ...
feat(auction): ...
fix(rental): ...
test(auction): ...
refactor(permissions): ...
```

Do not create one giant meaningless commit containing the entire application if the repository workflow allows incremental commits.

Before final completion:

```text
git status
```

must be clean unless there is a deliberate documented reason otherwise.

---

# 37. Autonomous Loop

For each domain, execute:

```text
PHASE A
Inspect existing implementation

PHASE B
Define implementation plan

PHASE C
Implement database

PHASE D
Implement domain

PHASE E
Implement application services

PHASE F
Implement repositories

PHASE G
Implement API

PHASE H
Implement authorization

PHASE I
Implement frontend

PHASE J
Write tests

PHASE K
Run tests

PHASE L
Run application

PHASE M
Perform browser workflow

PHASE N
Take screenshots

PHASE O
Review screenshots

PHASE P
Improve UI

PHASE Q
Run regression suite

PHASE R
Review architecture

PHASE S
Move to next domain
```

Never skip directly from implementation to "done."

---

# 38. Self-Review Before Completion

Before declaring any feature complete, ask yourself:

### Architecture

- Does this belong in the correct module?
- Is business logic in the correct layer?
- Did I introduce coupling?
- Did I bypass repository boundaries?
- Did I violate existing architecture?

### Database

- Are relationships correct?
- Are constraints sufficient?
- Are indexes appropriate?
- Can invalid states exist?

### Security

- Can another organization access this?
- Can a user bypass the UI and call the API directly?
- Is authorization checked at the resource level?

### Business logic

- Can invalid state transitions happen?
- Can records be duplicated?
- Can historical data be lost?
- Can machines be double-booked?
- Can auctions be manipulated?

### Frontend

- Does the workflow make sense?
- What happens when there is no data?
- What happens when the API fails?
- What happens while loading?
- Does it work on mobile?
- Does it look polished?

### Testing

- What can break?
- Is that behavior tested?
- Did I test the failure path?
- Did I test authorization?

---

# 39. Do Not Overengineer

Do not introduce these unless the implementation proves they are required:

- microservices
- MongoDB
- Kafka
- Kubernetes
- complex event sourcing
- elaborate CQRS
- unnecessary Redis infrastructure
- generic workflow engines
- generic specification-definition engines
- enterprise permission builders
- complicated plugin systems

The architecture should be capable of growing, but the MVP should remain understandable.

---

# 40. Future Architecture

Keep future extraction possible.

Potential future domains include:

```text
Operators
GPS / Telematics
OEM
Used Equipment
Parts
Services
Financing
Insurance
Advanced Analytics
AI
Transport Marketplace
```

Do not implement these unless explicitly required by the MVP scope.

---

# 41. Production Readiness Gate

Do not declare FleetIP MVP complete until all of the following are true:

```text
[ ] Foundation works
[ ] Authentication works
[ ] Organization isolation works
[ ] Permissions work
[ ] Catalogue works
[ ] Equipment works
[ ] Rental works
[ ] RFQ works
[ ] Quotation works
[ ] Negotiation works
[ ] Auction works
[ ] Execution works
[ ] Logsheets work
[ ] Utilization works
[ ] Billing works
[ ] Payments/receivables work
[ ] Maintenance works
[ ] Transport works

[ ] Critical workflows work end-to-end
[ ] Clean database migration works
[ ] Typecheck passes
[ ] Lint passes
[ ] Tests pass
[ ] Production build passes
[ ] API tests pass
[ ] Frontend tests pass
[ ] E2E tests pass
[ ] Authorization tests pass
[ ] Tenant isolation tests pass

[ ] Desktop UI reviewed
[ ] Tablet UI reviewed
[ ] Mobile UI reviewed
[ ] Critical screenshots reviewed
[ ] Loading states reviewed
[ ] Empty states reviewed
[ ] Error states reviewed
[ ] Responsive issues fixed
[ ] Accessibility basics reviewed

[ ] Database reviewed
[ ] Security reviewed
[ ] Performance reviewed
[ ] Error handling reviewed
[ ] Architecture reviewed
[ ] Documentation updated
[ ] Demo data available
[ ] Final regression suite passes
```

---

# 42. Final Audit

After all functionality is implemented, **do not immediately finish**.

Perform a separate final audit as if you are taking over an unfamiliar production codebase.

Inspect:

```text
Architecture
Database
Backend
Frontend
Authentication
Authorization
Tenant isolation
Business logic
Auctions
Rental availability
Billing
Testing
Responsive design
UX
Performance
Security
Documentation
Deployment configuration
```

Find weaknesses.

Fix them.

Run the complete test suite again.

Then inspect the major screens again with screenshots.

Fix anything that still looks unfinished.

---

# 43. Final Report

Only after the final audit provide a report containing:

### Completed

What was actually implemented.

### Tests

Exact commands run and their results.

### End-to-end workflows

Which complete business workflows were successfully tested.

### UI review

Which screens were reviewed at desktop/tablet/mobile sizes and what was improved.

### Security

What was checked and any remaining risks.

### Architecture

Any deviations from the FleetIP architecture contract.

### Known limitations

Anything intentionally left incomplete.

### Production readiness

Give a truthful assessment:

```text
READY
READY WITH KNOWN RISKS
NOT READY
```

Do not say "production ready" simply because tests pass.

---

# 44. Most Important Instruction

You are not being asked to demonstrate that you can generate code.

You are being asked to **finish the product**.

If something fails:

```text
Do not stop.
Diagnose it.
Fix it.
Test it.
Continue.
```

If a UI looks poor:

```text
Do not merely describe the problem.
Fix it.
Screenshot it again.
```

If a test exposes a business-rule bug:

```text
Do not weaken the test.
Fix the implementation.
```

If an architecture decision creates a problem:

```text
Do not silently rewrite the architecture.
Evaluate the contract and existing implementation first.
```

If functionality is incomplete:

```text
Do not mark it complete.
Finish it.
```

Continue the autonomous implementation and validation loop until the complete FleetIP MVP passes the final production-readiness gate.

---

## One final constraint

**You are the implementation agent. The human developer remains the owner of the architecture and product decisions.**

Do not make irreversible architectural or business decisions silently.

For routine engineering decisions, proceed autonomously.

For genuinely ambiguous business semantics that cannot reasonably be inferred from the existing FleetIP documentation and implementation, ask one focused question rather than inventing a rule.

**Begin by inspecting the repository and current FleetIP implementation. Do not write code until you have completed that inspection.**
