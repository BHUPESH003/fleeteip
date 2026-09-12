"use client";

import type { PermissionCode } from "@fleetip/contracts/organization";
import { PERMISSION_ORGANIZATION_TYPES } from "@fleetip/contracts/organization";
import { Alert, Badge, Card, EmptyState, Table, Tbody, Td, Th, Thead, Tr } from "@fleetip/ui";
import { useState } from "react";

/**
 * FleetIP Platform Admin — target UI only, per docs/frontend-backend-gap-report.md
 * (Platform Admin, severity: architecture-level). There is NO authorization
 * tier above the Rental Company/Renter organization model anywhere in the
 * backend — no third org type, no super-admin/staff concept, no cross-tenant
 * query capability (confirmed by reading every module: no organizations,
 * permissions, or audit routes.ts exists at all). This route is:
 *  - never linked from the tenant Sidebar/MobileNav/navigation.ts,
 *  - not gated by a client-side "admin mode" (there is nothing real to gate —
 *    every number below is a hardcoded sample, not a fetch),
 *  - visually distinct from the tenant shell on purpose (dark operational
 *    chrome vs. the tenant's light surface-page), reusing the SAME design
 *    tokens (ink/rail/status colors) rather than inventing a new palette.
 * Access & Roles is the one exception with real data — the permission list
 * is genuinely static, defined in packages/contracts, not mock.
 */

const SECTIONS = [
  "Overview",
  "Organizations",
  "Users",
  "Access & roles",
  "Catalogue",
  "Audit & activity",
  "System settings",
] as const;
type Section = (typeof SECTIONS)[number];

function SampleTag() {
  return (
    <span className="rounded-xs bg-warning-bg px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-warning">
      Sample
    </span>
  );
}

function RealTag() {
  return (
    <span className="rounded-xs bg-success-bg px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-success">
      Real, static
    </span>
  );
}

const KPI_MOCK: { label: string; value: string }[] = [
  { label: "Organizations", value: "—" },
  { label: "Rental companies", value: "—" },
  { label: "Renters", value: "—" },
  { label: "Machines", value: "—" },
  { label: "Products", value: "—" },
  { label: "Active rentals", value: "—" },
  { label: "Open requirements", value: "—" },
  { label: "Quotations", value: "—" },
  { label: "Auctions", value: "—" },
];

const ORG_DIRECTORY_MOCK = [
  { name: "Apex Equipment Co.", type: "Rental company", members: "—", machines: "—", rentals: "—" },
  { name: "Metro Builders", type: "Renter", members: "—", machines: "—", rentals: "—" },
];

const USER_DIRECTORY_MOCK = [
  { name: "—", org: "—", role: "—", state: "—" },
  { name: "—", org: "—", role: "—", state: "—" },
];

const AUDIT_MOCK = [
  "Organization created",
  "User added to organization",
  "Membership role changed",
  "Product created in catalogue",
  "Machine registered",
];

const PERMISSION_GROUPS: { label: string; codes: PermissionCode[] }[] = [
  { label: "Organization", codes: ["organization.manage", "membership.manage"] },
  { label: "Equipment", codes: ["equipment.manage"] },
  { label: "Requirements (RFQ)", codes: ["rfq.manage", "rfq.respond"] },
  { label: "Quotations", codes: ["quotation.manage", "quotation.respond"] },
  { label: "Auctions", codes: ["auction.manage", "auction.participate"] },
  { label: "Rentals", codes: ["rental.manage", "rental.respond"] },
  { label: "Operations", codes: ["maintenance.manage", "transport.manage", "logsheet.manage"] },
  { label: "Billing", codes: ["billing.manage", "billing.respond"] },
];

export default function PlatformAdminPage() {
  const [section, setSection] = useState<Section>("Overview");

  return (
    <div className="min-h-screen bg-ink-strong text-white">
      <div className="border-b border-white/10 bg-ink-strong px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-5 w-5 rounded-xs bg-warning" />
            <span className="text-[15px] font-bold tracking-wide">FleetIP · Platform Admin</span>
          </div>
          <Badge tone="warning">Preview — not live</Badge>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-6">
        <Alert tone="warning" title="This authorization tier does not exist server-side yet">
          There is no platform-admin/staff concept, no third organization type, and no cross-tenant
          query capability anywhere in apps/api today — only the Rental Company / Renter
          organization model exists. Every screen below is a target-UI design; every number is a
          hardcoded sample, not a fetch. Nothing here is reachable by, or reachable from, the
          tenant application. See docs/frontend-backend-gap-report.md (Platform Admin, severity:
          architecture-level).
        </Alert>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[200px_1fr]">
          <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {SECTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSection(s)}
                className={[
                  "shrink-0 rounded-control px-3 py-2 text-left text-sm font-medium",
                  section === s ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white",
                ].join(" ")}
              >
                {s}
              </button>
            ))}
          </nav>

          <div className="min-w-0 rounded-panel bg-surface p-5 text-ink">
            {section === "Overview" && <OverviewSection />}
            {section === "Organizations" && <OrganizationsSection />}
            {section === "Users" && <UsersSection />}
            {section === "Access & roles" && <AccessRolesSection />}
            {section === "Catalogue" && <CatalogueSection />}
            {section === "Audit & activity" && <AuditSection />}
            {section === "System settings" && <SystemSettingsSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewSection() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink">Platform overview</h2>
        <SampleTag />
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {KPI_MOCK.map((kpi) => (
          <Card key={kpi.label} padding="sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-meta">{kpi.label}</p>
            <p className="mt-1 font-mono text-2xl font-medium text-ink">{kpi.value}</p>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {[
          "Recent organizations",
          "Recent catalogue changes",
          "Recent platform activity",
          "Items requiring admin attention",
        ].map((title) => (
          <Card key={title}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-meta">{title}</h3>
            <EmptyState title="No live data" description="Unreachable today — see the gap report." />
          </Card>
        ))}
      </div>
    </div>
  );
}

function OrganizationsSection() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink">Organization directory</h2>
        <SampleTag />
      </div>
      <Table>
        <Thead>
          <Tr>
            <Th>Organization</Th>
            <Th>Type</Th>
            <Th>Members</Th>
            <Th>Machines</Th>
            <Th>Rentals</Th>
            <Th>Status</Th>
          </Tr>
        </Thead>
        <Tbody>
          {ORG_DIRECTORY_MOCK.map((org) => (
            <Tr key={org.name}>
              <Td className="font-medium text-ink">{org.name}</Td>
              <Td>{org.type}</Td>
              <Td>{org.members}</Td>
              <Td>{org.machines}</Td>
              <Td>{org.rentals}</Td>
              <Td>
                <Badge tone="neutral">sample</Badge>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      <Card>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-meta">
          Example organization detail (target layout)
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {["Organization", "Type", "Contact", "Members", "Fleet", "Rentals", "Activity"].map((label) => (
            <div key={label} className="flex flex-col gap-0.5 border-b border-border pb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-meta">{label}</span>
              <span className="text-sm text-meta-light">—</span>
            </div>
          ))}
        </div>
      </Card>
      <p className="text-xs text-meta-light">
        Cross-tenant organization data (contact details, another org&apos;s members/fleet/rentals)
        is never exposed to another organization anywhere in the real product — this mock exists
        purely to design the layout, not to imply the data is reachable.
      </p>
    </div>
  );
}

function UsersSection() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink">User directory</h2>
        <SampleTag />
      </div>
      <Table>
        <Thead>
          <Tr>
            <Th>User</Th>
            <Th>Organization</Th>
            <Th>Role</Th>
            <Th>Account state</Th>
          </Tr>
        </Thead>
        <Tbody>
          {USER_DIRECTORY_MOCK.map((user, i) => (
            <Tr key={i}>
              <Td>{user.name}</Td>
              <Td>{user.org}</Td>
              <Td>{user.role}</Td>
              <Td>{user.state}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      <Card>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-meta">
          Example user detail (target layout)
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {["Identity", "Memberships", "Roles", "Account state", "Created", "Last activity"].map((label) => (
            <div key={label} className="flex flex-col gap-0.5 border-b border-border pb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-meta">{label}</span>
              <span className="text-sm text-meta-light">—</span>
            </div>
          ))}
        </div>
      </Card>
      <p className="text-xs text-meta-light">
        Passwords, credentials and session tokens are never shown on any real or designed screen in
        this product.
      </p>
    </div>
  );
}

function AccessRolesSection() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink">Roles → permissions</h2>
        <RealTag />
      </div>
      <p className="text-sm text-meta">
        FleetIP&apos;s fixed, static permission list from{" "}
        <code className="rounded-xs bg-surface-sunk px-1 py-0.5 font-mono text-xs">packages/contracts</code> — real
        data, not administration UI for a new permission system. There is no live "list all roles
        across every organization" endpoint yet (only <code className="font-mono text-xs">/auth/me</code> returns
        a caller&apos;s own role/permissions), so this is the enumerable reference, not a query
        result.
      </p>
      <div className="flex flex-col gap-3">
        {PERMISSION_GROUPS.map((group) => (
          <Card key={group.label} padding="sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-meta">{group.label}</p>
            <div className="flex flex-col gap-1.5">
              {group.codes.map((code) => (
                <div key={code} className="flex flex-wrap items-center gap-2 text-sm">
                  <code className="rounded-xs bg-surface-sunk px-1.5 py-0.5 font-mono text-xs text-ink">{code}</code>
                  <span className="text-xs text-meta">
                    {PERMISSION_ORGANIZATION_TYPES[code].map((t) => (t === "rental_company" ? "Rental company" : "Renter")).join(", ")}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CatalogueSection() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-ink">Catalogue administration</h2>
      <Alert tone="info">
        Catalogue create/edit flows are designed under the tenant-reachable <code>/catalogue</code>{" "}
        section today (the only reachable shell that exists), not duplicated here. Open question,
        recorded in the gap report: with no platform-admin tier, who should actually be authorized
        to manage the shared platform catalogue — every rental company, or a future
        platform-admin-only capability? Not guessed at here.
      </Alert>
    </div>
  );
}

function AuditSection() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink">Audit &amp; activity</h2>
        <SampleTag />
      </div>
      <p className="text-sm text-meta">
        No generalized audit backend exists — the only genuinely real cross-domain feed today is
        the <code className="font-mono text-xs">notifications</code> table (marketplace/negotiation
        events only, scoped per-organization, already used on the tenant dashboard&apos;s "recent
        activity"). It has no platform-wide/cross-tenant query capability, so it can&apos;t power
        this screen either. The rows below illustrate the kind of event a future audit trail would
        record.
      </p>
      <Card padding="none">
        <ul className="divide-y divide-border">
          {AUDIT_MOCK.map((event) => (
            <li key={event} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="text-ink">{event}</span>
              <span className="text-xs text-meta-light">—</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function SystemSettingsSection() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink">System settings</h2>
        <SampleTag />
      </div>
      <EmptyState
        title="No platform-level configuration exists"
        description="There is no platform-settings concept in the backend today (no feature flags, maintenance-mode switch, or platform-wide defaults). Nothing to design a working form against yet — recorded in the gap report."
      />
    </div>
  );
}
