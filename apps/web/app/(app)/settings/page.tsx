"use client";

import type { RoleWithPermissions } from "@fleetip/contracts/organization";
import { Button, Card, EmptyState, PageBody, PageHeader, TabPanel, Tabs } from "@fleetip/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { useConnection } from "../../../lib/connection";
import { OFFLINE_HINT } from "../../../lib/errors";
import { useSession } from "../../../lib/session-context";
import { useLoad } from "../../../lib/use-load";
import { InviteDialog, MembersTab, ROLES_NEED_ORGANIZATION } from "./MembersTab";
import { OrganizationTab } from "./OrganizationTab";
import { ORGANIZATION_TYPE_LABEL } from "./permissions";
import { RoleDialog, RolesTab } from "./RolesTab";
import { SecurityTab } from "./SecurityTab";

type SettingsTab = "organization" | "members" | "roles" | "security";
const TAB_KEYS: SettingsTab[] = ["organization", "members", "roles", "security"];
// The old Preferences tab only showed your own account, which now lives on
// the Organization tab — keep its deep link working.
const LEGACY_TABS: Record<string, SettingsTab> = { preferences: "organization" };

export default function SettingsPage() {
  const { session, currentMembership, hasPermission, refresh } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { online } = useConnection();

  // ?tab= is read from the URL on every render, never copied into useState:
  // the sidebar and account-menu links reach this page with only the query
  // string changing, and the App Router doesn't remount the page for that,
  // so a state initializer would keep showing the old tab (docs/decisions.md).
  const tabParam = searchParams.get("tab") ?? "organization";
  const tab: SettingsTab = (TAB_KEYS as string[]).includes(tabParam)
    ? (tabParam as SettingsTab)
    : (LEGACY_TABS[tabParam] ?? "organization");
  const setTab = useCallback(
    (next: string) => {
      // Tab-specific filters (search, role, sort) don't carry across tabs.
      const qs = next === "organization" ? "" : `?tab=${next}`;
      router.replace(`${pathname}${qs}`, { scroll: false });
    },
    [router, pathname],
  );

  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  const canManageMembers = hasPermission("membership.manage");
  const canManageOrganization = hasPermission("organization.manage");

  const members = useLoad(
    () => apiClient.listOrganizationMembers(organizationId!).then((list) => list ?? []),
    [organizationId],
    Boolean(organizationId) && canManageMembers,
  );
  const invites = useLoad(
    () => apiClient.listInvites(organizationId!).then((list) => list ?? []),
    [organizationId],
    Boolean(organizationId) && canManageMembers,
  );
  // Both the Members tab (role picker, invite) and the Roles tab need the
  // role list — fetched once, shared by both. Only an organization.manage
  // holder can list it; a membership.manage-only role simply can't pick a
  // role (see docs/decisions.md's known limitation).
  const roles = useLoad(
    () => apiClient.listRolesAndPermissions(organizationId!).then((list) => list ?? []),
    [organizationId],
    Boolean(organizationId) && canManageOrganization,
  );

  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleDialog, setRoleDialog] = useState<{ role: RoleWithPermissions | null } | null>(null);

  if (!session || !currentMembership || !organizationId || !organizationType) {
    return (
      <div className="flex min-w-0 flex-col">
        <PageHeader title="Organization & team" />
        <PageBody>
          <NoAccess
            title="Your account isn't part of an organization yet"
            body="Open the invite link an organization admin sent you to join one."
          />
        </PageBody>
      </div>
    );
  }
  const { organization } = currentMembership;

  const roleList = canManageOrganization && roles.data ? roles.data : null;
  const rolesProblem = !canManageOrganization
    ? ROLES_NEED_ORGANIZATION
    : roles.error
      ? "Roles didn't load, so a role can't be picked. Open Roles and permissions to try again."
      : !roles.data
        ? "Roles are still loading."
        : null;

  const primary =
    tab === "members" && canManageMembers ? (
      <Button
        icon="plus"
        onClick={() => setInviteOpen(true)}
        disabled={!online || Boolean(rolesProblem)}
        title={!online ? OFFLINE_HINT : (rolesProblem ?? undefined)}
      >
        Invite member
      </Button>
    ) : tab === "roles" && canManageOrganization ? (
      <Button
        icon="plus"
        onClick={() => setRoleDialog({ role: null })}
        disabled={!online || !roles.data}
        title={!online ? OFFLINE_HINT : !roles.data ? "Roles are still loading." : undefined}
      >
        New role
      </Button>
    ) : null;

  const tabs = [
    { key: "organization", label: "Organization" },
    { key: "members", label: "Members", count: canManageMembers ? members.data?.length : undefined },
    { key: "roles", label: "Roles and permissions", count: canManageOrganization ? roles.data?.length : undefined },
    { key: "security", label: "Security" },
  ];

  /** Any change that may alter the signed-in member's own access re-reads the session. */
  function refreshIfMine(roleName: string | undefined) {
    if (roleName && roleName === currentMembership?.roleName) void refresh();
  }

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title="Organization & team"
        description={`${organization.name} · ${ORGANIZATION_TYPE_LABEL[organizationType]} · you're ${currentMembership.roleName}`}
        actions={primary ?? undefined}
      />
      <PageBody>
        <Tabs items={tabs} active={tab} onChange={setTab} label="Organization settings" idBase="settings" />
        <TabPanel idBase="settings" tabKey={tab} className="flex flex-col gap-3.5">
          {tab === "organization" && (
            <OrganizationTab
              membership={currentMembership}
              session={session}
              canEdit={canManageOrganization}
              online={online}
              onSaved={() => void refresh()}
            />
          )}
          {tab === "members" &&
            (canManageMembers ? (
              <MembersTab
                organizationId={organizationId}
                members={members}
                invites={invites}
                roles={roleList}
                rolesProblem={rolesProblem}
                currentUserId={session.user.id}
                online={online}
                onMemberChanged={(updated) => {
                  members.setData((list) => list?.map((m) => (m.id === updated.id ? updated : m)) ?? list);
                  if (updated.userId === session.user.id) void refresh();
                }}
              />
            ) : (
              <NoAccess
                title="Your role can't see the member list"
                body="Seeing members, inviting people and changing roles needs the Members and invites permission. Ask an organization admin if you need it."
              />
            ))}
          {tab === "roles" && (
            <RolesTab
              organizationId={organizationId}
              organizationType={organizationType}
              membership={currentMembership}
              roles={canManageOrganization ? roles : null}
              members={canManageMembers ? members.data : null}
              online={online}
              onEdit={(role) => setRoleDialog({ role })}
              onDeleted={() => void roles.reload()}
            />
          )}
          {tab === "security" && <SecurityTab online={online} />}
        </TabPanel>
      </PageBody>

      {inviteOpen && roleList && (
        <InviteDialog
          open
          onClose={() => setInviteOpen(false)}
          organizationId={organizationId}
          organizationName={organization.name}
          roles={roleList}
          online={online}
          onCreated={(invite) => invites.setData((list) => [invite, ...(list ?? [])])}
        />
      )}
      {roleDialog && roles.data && (
        <RoleDialog
          open
          onClose={() => setRoleDialog(null)}
          organizationId={organizationId}
          organizationType={organizationType}
          role={roleDialog.role}
          roles={roles.data}
          online={online}
          onSaved={(saved, previous) => {
            void roles.reload();
            // Member rows show role names; a rename needs them re-read.
            if (previous && previous.roleName !== saved.roleName && canManageMembers) void members.reload();
            refreshIfMine(previous?.roleName);
          }}
        />
      )}
    </div>
  );
}

function NoAccess({ title, body }: { title: string; body: string }) {
  return (
    <Card padding="none">
      <EmptyState title={title} description={body} />
    </Card>
  );
}
