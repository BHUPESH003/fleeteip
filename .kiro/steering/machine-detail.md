---
inclusion: fileMatch
fileMatchPattern: "apps/web/app/(app)/machines/**,packages/ui/src/**,apps/web/lib/status.ts"
---
Machine Detail v2 follows #[[file:docs/machine-detail-v2-plan.md]].
Visual reference: #[[file:design/design_handoff_machine_detail/README.md]].
Where they disagree, the plan wins (its section 1 lists verified backend facts).
Never add endpoints, fields or statuses not in packages/contracts. Section 7 items are tickets; don't stub them.
packages/ui must not import @fleetip/contracts.
