"use client";

import type { OrganizationMember, PermissionCode, RoleWithPermissions } from "@fleetip/contracts/organization";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Select,
  StatusBadge,
  Table,
  Tabs,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  type StatusMap,
} from "@fleetip/ui";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";
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
  {
    label: "Operations",
    codes: [
      "maintenance.manage",
      "transport.manage",
      "transport.respond",
      "logsheet.manage",
      "logsheet.respond",
    ],
  },
  { label: "Billing", codes: ["billing.manage", "billing.respond"] },
];

const ROLE_OPTIONS = [
  { value: "member", label: "Member" },
  { value: "owner", label: "Owner" },
];

const MEMBER_STATUS_MAP: StatusMap = {
  active: { label: "active", tone: "success" },
  invited: { label: "invited", tone: "warning" },
  suspended: { label: "suspended", tone: "danger" },
};

export default function SettingsPage() {
  const { session, currentMembership, hasPermission } = useSession();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "organization");

  const organizationId = currentMembership?.organizationId;
  const canManageMembers = hasPermission("membership.manage");
  const canManageOrganization = hasPermission("organization.manage");

  const [members, setMembers] = useState<OrganizationMember[] | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  const [roles, setRoles] = useState<RoleWithPermissions[] | null>(null);
  const [rolesError, setRolesError] = useState<string | null>(null);

  async function loadMembers(orgId: string) {
    try {
      setMembers((await apiClient.listOrganizationMembers(orgId)) as OrganizationMember[]);
    } catch (err) {
      setMembersError(err instanceof Error ? err.message : "Failed to load members");
    }
  }

  useEffect(() => {
    if (!organizationId || tab !== "members" || !canManageMembers || members || membersError) return;
    void loadMembers(organizationId);
  }, [organizationId, tab, canManageMembers, members, membersError]);

  useEffect(() => {
    if (!organizationId || tab !== "roles" || !canManageOrganization || roles || rolesError) return;
    void (async () => {
      try {
        setRoles((await apiClient.listRolesAndPermissions(organizationId)) as RoleWithPermissions[]);
      } catch (err) {
        setRolesError(err instanceof Error ? err.message : "Failed to load roles");
      }
    })();
  }, [organizationId, tab, canManageOrganization, roles, rolesError]);

  async function handleInviteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    setInviteError(null);
    const form = new FormData(event.currentTarget);
    setInviteSubmitting(true);
    try {
      await apiClient.inviteMember(organizationId, {
        email: String(form.get("email") ?? ""),
        roleName: String(form.get("roleName") ?? "member") as "owner" | "member",
      });
      setInviteOpen(false);
      await loadMembers(organizationId);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to invite member");
    } finally {
      setInviteSubmitting(false);
    }
  }

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
                onClick={() => setInviteOpen(true)}
                disabled={!canManageMembers}
                title={canManageMembers ? undefined : "Requires membership.manage"}
              >
                Invite member
              </Button>
            </div>
            {!canManageMembers ? (
              <EmptyState
                title="Not available to your role"
                description="Listing and inviting members requires the membership.manage permission."
              />
            ) : membersError ? (
              <ErrorState message={membersError} />
            ) : !members ? (
              <LoadingState label="Loading members…" />
            ) : (
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
                  {members.map((member) => (
                    <Tr key={member.id}>
                      <Td>
                        <div className="flex flex-col">
                          <span className="font-medium text-ink">{member.displayName}</span>
                          <span className="text-xs text-meta">{member.email}</span>
                        </div>
                      </Td>
                      <Td className="capitalize">{member.roleName}</Td>
                      <Td>
                        <StatusBadge status={member.status} map={MEMBER_STATUS_MAP} />
                      </Td>
                      <Td className="font-mono">{formatDate(member.createdAt)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Card>
          {canManageMembers && (
            <p className="text-xs text-meta-light">
              Inviting requires the invitee to already have a FleetIP account (looked up by
              email) — there is no email-delivery/signup-invite flow yet. See the frontend/backend
              gap report.
            </p>
          )}
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
            {!canManageOrganization ? (
              <EmptyState
                title="Not available to your role"
                description="Listing every role's permissions requires the organization.manage permission."
              />
            ) : rolesError ? (
              <ErrorState message={rolesError} />
            ) : !roles ? (
              <LoadingState label="Loading roles…" />
            ) : (
              <div className="flex flex-col gap-3">
                {roles.map((role) => (
                  <div key={role.roleName} className="border-b border-border pb-3 last:border-0">
                    <Badge tone="neutral" className="mb-1.5 capitalize">
                      {role.roleName}
                    </Badge>
                    <div className="flex flex-wrap gap-1.5">
                      {role.permissions.map((code) => (
                        <Badge key={code} tone="neutral">
                          {code}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
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

      <Dialog
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          setInviteError(null);
        }}
        title="Invite member"
      >
        <form onSubmit={handleInviteSubmit} className="flex flex-col gap-4 text-left">
          {inviteError && <p className="text-sm text-danger">{inviteError}</p>}
          <p className="text-xs text-meta">
            The invitee must already have a FleetIP account — invites aren&apos;t sent by email
            yet, this adds an existing user to your organization directly.
          </p>
          <Input label="Email" name="email" type="email" required />
          <Select label="Role" name="roleName" options={ROLE_OPTIONS} defaultValue="member" />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={inviteSubmitting}>
              {inviteSubmitting ? "Inviting…" : "Invite member"}
            </Button>
          </div>
        </form>
      </Dialog>
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
