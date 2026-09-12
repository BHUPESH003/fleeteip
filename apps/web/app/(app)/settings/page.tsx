"use client";

import type { PermissionCode } from "@fleetip/contracts/organization";
import { Badge, Button, Card, EmptyState, PageHeader, Table, Tabs, Tbody, Td, Th, Thead, Tr } from "@fleetip/ui";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { formatDate } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";

const TABS = [
  { key: "organization", label: "Organization" },
  { key: "members", label: "Members" },
  { key: "roles", label: "Roles & access" },
  { key: "preferences", label: "Preferences" },
];

// Grouping purely for readability — same fixed list as
// packages/contracts/src/organization/index.ts's permissionCodeSchema, not
// a new permission model.
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

export default function SettingsPage() {
  const { session, currentMembership } = useSession();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "organization");

  if (!session || !currentMembership) return null;
  const { organization, roleName, permissions, status, createdAt } = currentMembership;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Settings" description="Your organization and account." />
      <Tabs items={TABS} active={tab} onChange={setTab} />

      {tab === "organization" && (
        <div className="flex flex-col gap-3.5">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Organization profile</h2>
              <Button
                variant="secondary"
                size="sm"
                disabled
                title="Organization profile editing isn't available yet — no update endpoint exists (see the frontend/backend gap report)"
              >
                Edit
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Name" value={organization.name} />
              <Field label="Code" value={organization.code} mono />
              <Field
                label="Type"
                value={organization.organizationTypeCode === "rental_company" ? "Rental company" : "Renter"}
              />
              <Field label="Created" value={formatDate(organization.createdAt)} mono />
            </div>
          </Card>
          <p className="text-xs text-meta-light">
            Contact details and address aren&apos;t shown — the organizations table has no such
            columns today (see the frontend/backend gap report).
          </p>
        </div>
      )}

      {tab === "members" && (
        <div className="flex flex-col gap-3.5">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Members</h2>
              <Button
                size="sm"
                disabled
                title="Inviting members isn't available yet — the only membership-creation path today is signup itself (see the frontend/backend gap report)"
              >
                Invite member
              </Button>
            </div>
            <Table>
              <Thead>
                <Tr>
                  <Th>User</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th>Member since</Th>
                </Tr>
              </Thead>
              <Tbody>
                <Tr>
                  <Td>
                    <div className="flex flex-col">
                      <span className="font-medium text-ink">{session.user.displayName}</span>
                      <span className="text-xs text-meta">{session.user.email}</span>
                    </div>
                  </Td>
                  <Td className="capitalize">{roleName}</Td>
                  <Td>
                    <Badge tone={status === "active" ? "success" : status === "suspended" ? "danger" : "neutral"}>
                      {status}
                    </Badge>
                  </Td>
                  <Td className="font-mono">{formatDate(createdAt)}</Td>
                </Tr>
              </Tbody>
            </Table>
          </Card>
          <p className="text-xs text-meta-light">
            Only your own membership is shown — there is no list-all-members endpoint yet. See the
            frontend/backend gap report.
          </p>
        </div>
      )}

      {tab === "roles" && (
        <div className="flex flex-col gap-3.5">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-ink">Your role</h2>
            <div className="flex items-center gap-2">
              <Badge tone="info">{roleName}</Badge>
              <span className="text-sm text-meta">in {organization.name}</span>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-ink">Your permissions</h2>
            <div className="flex flex-col gap-3">
              {PERMISSION_GROUPS.filter((group) => group.codes.some((c) => permissions.includes(c))).map((group) => (
                <div key={group.label}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-meta">{group.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.codes
                      .filter((code) => permissions.includes(code))
                      .map((code) => (
                        <Badge key={code} tone="neutral">
                          {code}
                        </Badge>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="mb-2 text-sm font-semibold text-ink">All roles in this organization</h2>
            <EmptyState
              title="Not available yet"
              description="There is no list-all-roles endpoint for an organization today — only your own role/permissions (via /auth/me) are real data. FleetIP has a fixed two-role model (owner/member) shared across organizations, not custom per-organization roles. See the frontend/backend gap report."
            />
          </Card>
        </div>
      )}

      {tab === "preferences" && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-ink">Account</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Name" value={session.user.displayName} />
            <Field label="Email" value={session.user.email} />
            <Field label="Member since" value={formatDate(session.user.createdAt)} mono />
          </div>
          <p className="mt-4 text-xs text-meta-light">
            No organization-level preferences (notification settings, locale, etc.) exist in the
            backend today — nothing to show here yet beyond your own account.
          </p>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border pb-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-meta">{label}</span>
      <span className={["text-sm text-ink", mono && "font-mono"].filter(Boolean).join(" ")}>{value}</span>
    </div>
  );
}
