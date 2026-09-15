"use client";

import type {
  CreateInviteResponse,
  OrganizationMember,
  PermissionCode,
  RoleWithPermissions,
} from "@fleetip/contracts/organization";
import { PERMISSION_ORGANIZATION_TYPES } from "@fleetip/contracts/organization";
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

const MEMBER_STATUS_MAP: StatusMap = {
  active: { label: "active", tone: "success" },
  invited: { label: "invited", tone: "warning" },
  suspended: { label: "suspended", tone: "danger" },
};

export default function SettingsPage() {
  const { session, currentMembership, hasPermission } = useSession();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState(tabParam ?? "organization");

  // The sidebar's "Organization"/"Settings" links reach this page via
  // router.push with only the query string changing — the App Router
  // doesn't remount the page for that, so the useState initializer above
  // never re-runs on its own. Mirrors OpenMarket.tsx's respondingId effect.
  useEffect(() => {
    if (tabParam) setTab(tabParam);
  }, [tabParam]);

  const organizationId = currentMembership?.organizationId;
  const organizationTypeCode = currentMembership?.organization.organizationTypeCode;
  const canManageMembers = hasPermission("membership.manage");
  const canManageOrganization = hasPermission("organization.manage");

  const [members, setMembers] = useState<OrganizationMember[] | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [memberRoleError, setMemberRoleError] = useState<string | null>(null);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  const [roles, setRoles] = useState<RoleWithPermissions[] | null>(null);
  const [rolesError, setRolesError] = useState<string | null>(null);

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleWithPermissions | null>(null);
  const [roleDialogError, setRoleDialogError] = useState<string | null>(null);
  const [roleDialogSubmitting, setRoleDialogSubmitting] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<PermissionCode>>(new Set());

  async function loadMembers(orgId: string) {
    try {
      setMembers((await apiClient.listOrganizationMembers(orgId)) as OrganizationMember[]);
    } catch (err) {
      setMembersError(err instanceof Error ? err.message : "Failed to load members");
    }
  }

  async function loadRoles(orgId: string) {
    try {
      setRoles((await apiClient.listRolesAndPermissions(orgId)) as RoleWithPermissions[]);
    } catch (err) {
      setRolesError(err instanceof Error ? err.message : "Failed to load roles");
    }
  }

  useEffect(() => {
    if (!organizationId || tab !== "members" || !canManageMembers || members || membersError)
      return;
    void loadMembers(organizationId);
  }, [organizationId, tab, canManageMembers, members, membersError]);

  // Both the Members tab (role picker per member) and the Roles & access
  // tab need the role list — fetched once, shared by both. Only an
  // organization.manage holder can list it; a membership.manage-only role
  // (a custom role could exist without organization.manage) simply won't
  // get a role picker — see docs/decisions.md.
  useEffect(() => {
    if (
      !organizationId ||
      (tab !== "members" && tab !== "roles") ||
      !canManageOrganization ||
      roles ||
      rolesError
    )
      return;
    void loadRoles(organizationId);
  }, [organizationId, tab, canManageOrganization, roles, rolesError]);

  async function handleMemberRoleChange(membershipId: string, roleId: string) {
    if (!organizationId) return;
    setMemberRoleError(null);
    setUpdatingMemberId(membershipId);
    try {
      const updated = (await apiClient.updateMemberRole(
        organizationId,
        membershipId,
        roleId,
      )) as OrganizationMember;
      setMembers(
        (current) => current?.map((m) => (m.id === membershipId ? updated : m)) ?? current,
      );
    } catch (err) {
      setMemberRoleError(err instanceof Error ? err.message : "Failed to change this member's role");
    } finally {
      setUpdatingMemberId(null);
    }
  }

  async function handleInviteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    setInviteError(null);
    const form = new FormData(event.currentTarget);
    setInviteSubmitting(true);
    try {
      const roleId = String(form.get("roleId") ?? "");
      const result = (await apiClient.createInvite(organizationId, roleId)) as CreateInviteResponse;
      setInviteLink(result.link);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to create invite link");
    } finally {
      setInviteSubmitting(false);
    }
  }

  async function handleCopyInviteLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      // ponytail: clipboard access can be denied by the browser; the link
      // text is still visible and selectable, so this is a soft failure.
    }
  }

  function closeInviteDialog() {
    setInviteOpen(false);
    setInviteError(null);
    setInviteLink(null);
    setInviteCopied(false);
  }

  function openCreateRoleDialog() {
    setEditingRole(null);
    setSelectedPermissions(new Set());
    setRoleDialogError(null);
    setRoleDialogOpen(true);
  }

  function openEditRoleDialog(role: RoleWithPermissions) {
    setEditingRole(role);
    setSelectedPermissions(new Set(role.permissions));
    setRoleDialogError(null);
    setRoleDialogOpen(true);
  }

  function closeRoleDialog() {
    setRoleDialogOpen(false);
    setEditingRole(null);
    setRoleDialogError(null);
  }

  function togglePermission(code: PermissionCode) {
    setSelectedPermissions((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function handleRoleDialogSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    setRoleDialogError(null);
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const permissions = Array.from(selectedPermissions);
    setRoleDialogSubmitting(true);
    try {
      if (editingRole) {
        await apiClient.updateRole(organizationId, editingRole.id, { name, permissions });
      } else {
        await apiClient.createRole(organizationId, { name, permissions });
      }
      setRoles(null);
      setRolesError(null);
      await loadRoles(organizationId);
      closeRoleDialog();
    } catch (err) {
      setRoleDialogError(err instanceof Error ? err.message : "Failed to save this role");
    } finally {
      setRoleDialogSubmitting(false);
    }
  }

  async function handleDeleteRole(role: RoleWithPermissions) {
    if (!organizationId) return;
    if (!window.confirm(`Delete the "${role.roleName}" role? This can't be undone.`)) return;
    try {
      await apiClient.deleteRole(organizationId, role.id);
      setRoles((current) => current?.filter((r) => r.id !== role.id) ?? current);
    } catch (err) {
      setRolesError(err instanceof Error ? err.message : "Failed to delete this role");
    }
  }

  if (!session || !currentMembership) return null;
  const { organization, roleName, permissions } = currentMembership;

  // A permission only ever applies to certain organization types (see
  // PERMISSION_ORGANIZATION_TYPES) — a custom role for a Renter offering
  // equipment.manage (rental_company-only) could never do anything with it.
  const assignablePermissionGroups = PERMISSION_GROUPS.map((group) => ({
    ...group,
    codes: group.codes.filter((code) =>
      organizationTypeCode ? PERMISSION_ORGANIZATION_TYPES[code].includes(organizationTypeCode) : false,
    ),
  })).filter((group) => group.codes.length > 0);

  const inviteRoleOptions = (roles ?? []).map((role) => ({ value: role.id, label: role.roleName }));

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
                value={
                  organization.organizationTypeCode === "rental_company"
                    ? "Rental company"
                    : "Renter"
                }
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
              <>
                {memberRoleError && <p className="mb-2 text-sm text-danger">{memberRoleError}</p>}
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
                        <Td className="capitalize">
                          {roles ? (
                            <Select
                              aria-label={`Role for ${member.displayName}`}
                              options={inviteRoleOptions}
                              value={member.roleId}
                              disabled={updatingMemberId === member.id}
                              onChange={(e) => void handleMemberRoleChange(member.id, e.target.value)}
                            />
                          ) : (
                            member.roleName
                          )}
                        </Td>
                        <Td>
                          <StatusBadge status={member.status} map={MEMBER_STATUS_MAP} />
                        </Td>
                        <Td className="font-mono">{formatDate(member.createdAt)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </>
            )}
          </Card>
          {canManageMembers && (
            <p className="text-xs text-meta-light">
              Generate a link and share it with whoever you want to invite — they don&apos;t need a
              FleetIP account first. Sharing by email isn&apos;t automated yet, so send the link
              yourself for now. Changing a member&apos;s role here takes effect immediately.
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
              {PERMISSION_GROUPS.filter((group) =>
                group.codes.some((c) => permissions.includes(c)),
              ).map((group) => (
                <div key={group.label}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-meta">
                    {group.label}
                  </p>
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
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">All roles in this organization</h2>
              {canManageOrganization && (
                <Button size="sm" variant="secondary" onClick={openCreateRoleDialog}>
                  New role
                </Button>
              )}
            </div>
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
                  <div
                    key={role.id}
                    className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0"
                  >
                    <div>
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <Badge tone="neutral">{role.roleName}</Badge>
                        {role.isBuiltin && <Badge tone="info">built-in</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {role.permissions.length === 0 ? (
                          <span className="text-xs text-meta-light">No permissions granted</span>
                        ) : (
                          role.permissions.map((code) => (
                            <Badge key={code} tone="neutral">
                              {code}
                            </Badge>
                          ))
                        )}
                      </div>
                    </div>
                    {!role.isBuiltin && (
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" variant="secondary" onClick={() => openEditRoleDialog(role)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => void handleDeleteRole(role)}>
                          Delete
                        </Button>
                      </div>
                    )}
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

      <Dialog open={inviteOpen} onClose={closeInviteDialog} title="Invite member">
        {inviteLink ? (
          <div className="flex flex-col gap-4 text-left">
            <p className="text-xs text-meta">
              Share this link with the person you&apos;re inviting. It works whether or not they
              already have a FleetIP account, and expires in 7 days.
            </p>
            <div className="flex items-center gap-2">
              <Input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="secondary" onClick={() => void handleCopyInviteLink()}>
                {inviteCopied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" onClick={closeInviteDialog}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleInviteSubmit} className="flex flex-col gap-4 text-left">
            {inviteError && <p className="text-sm text-danger">{inviteError}</p>}
            <p className="text-xs text-meta">
              Generates a one-time link for this role. Anyone with the link can join your
              organization — share it only with who you intend to invite.
            </p>
            {inviteRoleOptions.length === 0 ? (
              <p className="text-sm text-meta-light">
                No roles are available to invite into yet — visit Roles &amp; access to create one
                (requires organization.manage).
              </p>
            ) : (
              <Select label="Role" name="roleId" options={inviteRoleOptions} />
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={closeInviteDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={inviteSubmitting || inviteRoleOptions.length === 0}>
                {inviteSubmitting ? "Generating…" : "Generate invite link"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog
        open={roleDialogOpen}
        onClose={closeRoleDialog}
        title={editingRole ? `Edit "${editingRole.roleName}"` : "New role"}
      >
        <form onSubmit={handleRoleDialogSubmit} className="flex flex-col gap-4 text-left">
          {roleDialogError && <p className="text-sm text-danger">{roleDialogError}</p>}
          <Input label="Role name" name="name" defaultValue={editingRole?.roleName} required />
          <div>
            <span className="mb-1.5 block text-xs font-medium text-ink-muted">Permissions</span>
            <div className="flex max-h-72 flex-col gap-3 overflow-y-auto rounded-control border border-border-strong p-3">
              {assignablePermissionGroups.map((group) => (
                <div key={group.label}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-meta">
                    {group.label}
                  </p>
                  <div className="flex flex-col gap-1">
                    {group.codes.map((code) => (
                      <label key={code} className="flex items-center gap-2 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={selectedPermissions.has(code)}
                          onChange={() => togglePermission(code)}
                          className="h-3.5 w-3.5 rounded-xs border-border-strong accent-accent"
                        />
                        {code}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={closeRoleDialog}>
              Cancel
            </Button>
            <Button type="submit" disabled={roleDialogSubmitting}>
              {roleDialogSubmitting ? "Saving…" : editingRole ? "Save changes" : "Create role"}
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
      <span className={["text-sm text-ink", mono && "font-mono"].filter(Boolean).join(" ")}>
        {value}
      </span>
    </div>
  );
}
