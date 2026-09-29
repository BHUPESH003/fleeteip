"use client";

import {
  OrganizationTypeCode,
  type MembershipWithOrganization,
  type OrganizationMember,
  type PermissionCode,
  type RoleWithPermissions,
} from "@fleetip/contracts/organization";
import {
  Button,
  CellStack,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  FormBanner,
  FormSection,
  Icon,
  Input,
  Menu,
  Panel,
  Table,
  TableSkeleton,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
} from "@fleetip/ui";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { z } from "zod";
import { useStatusCopy } from "../../../components/status-copy";
import { apiClient } from "../../../lib/api-client";
import { OFFLINE_HINT, describeError } from "../../../lib/errors";
import { useAction, useForm } from "../../../lib/form";
import { formatNumber, plural } from "../../../lib/format";
import type { LoadState } from "../../../lib/use-load";
import { PERMISSION_GROUPS, PERMISSION_INFO, appliesTo, groupsFor, permissionLabel } from "./permissions";

const OWNER_LOCKED = "The built-in owner role always has full access. It can't be edited or deleted.";

export function RolesTab({
  organizationId,
  organizationType,
  membership,
  roles,
  members,
  online,
  onEdit,
  onDeleted,
}: {
  organizationId: string;
  organizationType: OrganizationTypeCode;
  membership: MembershipWithOrganization;
  /** null when the role can't list roles (organization.manage). */
  roles: LoadState<RoleWithPermissions[]> | null;
  /** For "members holding it" counts; null when members aren't visible. */
  members: OrganizationMember[] | null;
  online: boolean;
  onEdit: (role: RoleWithPermissions) => void;
  onDeleted: (role: RoleWithPermissions) => void;
}) {
  const [deleting, setDeleting] = useState<RoleWithPermissions | null>(null);
  const available = groupsFor(organizationType).reduce((sum, group) => sum + group.codes.length, 0);
  const memberCount = (role: RoleWithPermissions) => (members ? members.filter((m) => m.roleId === role.id).length : null);

  return (
    <div className="flex flex-col gap-3.5">
      <YourAccess membership={membership} />

      <Panel title="Roles in this organization" count={roles?.data?.length} icon="organization" padding="none">
        {!roles ? (
          <EmptyState
            title="Your role can't see the organization's roles"
            description="Seeing and editing roles needs the Organization and roles permission. Ask an owner if you need it."
          />
        ) : roles.error ? (
          <div className="p-4">
            <ErrorState
              title="Roles didn't load"
              message={describeError(roles.error).body}
              action={
                <Button variant="secondary" size="sm" icon="refresh" onClick={() => void roles.reload()}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : roles.loading || !roles.data ? (
          <Table bare minWidth={640} caption="Loading roles">
            <RolesHead showMembers={members !== null} />
            <TableSkeleton columns={members !== null ? 4 : 3} rows={3} label="Loading roles" />
          </Table>
        ) : (
          <Table bare minWidth={640} caption="Roles in this organization">
            <RolesHead showMembers={members !== null} />
            <Tbody>
              {roles.data.map((role) => {
                const count = memberCount(role);
                const offline = !online;
                return (
                  <Tr key={role.id}>
                    <Td>
                      <CellStack
                        title={role.roleName}
                        sub={role.isBuiltin ? "Built in · full access" : role.roleName === membership.roleName ? "Custom role · yours" : "Custom role"}
                      />
                    </Td>
                    <Td>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-mono text-xs font-medium text-ink">
                          {role.isBuiltin ? "All" : `${formatNumber(role.permissions.length, 0)} of ${formatNumber(available, 0)}`}
                        </span>
                        <span className="clamp-2 text-[11px] leading-[1.4] text-meta-light">
                          {role.isBuiltin
                            ? "Everything, including members, invites and roles"
                            : role.permissions.length === 0
                              ? "None — sees the dashboard and notifications only"
                              : role.permissions.map(permissionLabel).join(", ")}
                        </span>
                      </div>
                    </Td>
                    {members !== null && (
                      <Td align="right" className="font-mono">
                        {formatNumber(count ?? 0, 0)}
                      </Td>
                    )}
                    <Td align="right">
                      {role.isBuiltin ? (
                        <span title={OWNER_LOCKED} className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-meta">
                          <Icon name="lock" size={13} />
                          Can&apos;t be changed
                        </span>
                      ) : (
                        <span className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            icon="edit"
                            onClick={() => onEdit(role)}
                            disabled={offline}
                            title={offline ? OFFLINE_HINT : undefined}
                            aria-label={`Edit ${role.roleName}`}
                          >
                            Edit
                          </Button>
                          <Menu
                            label={`More actions for ${role.roleName}`}
                            triggerSize="sm"
                            width={300}
                            items={[
                              {
                                key: "delete",
                                label: "Delete role",
                                icon: "retire",
                                danger: true,
                                disabled: offline,
                                hint: offline
                                  ? OFFLINE_HINT
                                  : count
                                    ? `${plural(count, "member")} still ${count === 1 ? "holds" : "hold"} it — move them first.`
                                    : "Only possible while no member or pending invite uses it.",
                                onSelect: () => setDeleting(role),
                              },
                            ]}
                          />
                        </span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
        {roles && (
          <p className="m-0 border-t border-border px-4 py-2.5 text-[11px] leading-[1.45] text-meta-light">
            A role only offers the permissions that apply to a {organizationType === OrganizationTypeCode.renter ? "renter" : "rental company"}.
            Changes to a role apply to everyone who holds it straight away.
          </p>
        )}
      </Panel>

      {deleting && (
        <DeleteRoleDialog
          role={deleting}
          memberCount={memberCount(deleting)}
          organizationId={organizationId}
          online={online}
          onClose={() => setDeleting(null)}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}

function RolesHead({ showMembers }: { showMembers: boolean }) {
  return (
    <Thead>
      <Tr>
        <Th>Role</Th>
        <Th>Permissions</Th>
        {showMembers && <Th align="right">Members</Th>}
        <Th className="w-[1%]">
          <span className="sr-only">Actions</span>
        </Th>
      </Tr>
    </Thead>
  );
}

/** What the signed-in member's own role lets them do, in plain words. */
function YourAccess({ membership }: { membership: MembershipWithOrganization }) {
  const held = new Set(membership.permissions);
  const groups = PERMISSION_GROUPS.map((group) => ({ ...group, codes: group.codes.filter((code) => held.has(code)) })).filter(
    (group) => group.codes.length > 0,
  );
  return (
    <Panel title="Your access" subtitle={`as ${membership.roleName} at ${membership.organization.name}`} icon="user">
      {groups.length === 0 ? (
        <p className="m-0 text-sm leading-[1.5] text-ink-soft">
          Your role has no permissions yet, so you can see the dashboard and your notifications only. Ask an organization admin to
          add what you need.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-3.5 min-[760px]:grid-cols-2">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label} className="flex min-w-0 flex-col gap-1.5">
              <h3 className="m-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-meta">{group.label}</h3>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {group.codes.map((code) => (
                  <li key={code} className="flex items-start gap-2">
                    <Icon name="check" size={14} className="mt-0.5 text-available" />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm font-medium leading-tight text-ink-strong">{PERMISSION_INFO[code].label}</span>
                      <span className="text-[11px] leading-[1.4] text-meta-light">{PERMISSION_INFO[code].description}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------ create / edit

/** Role names: 1–60 characters, unique in the organization (case-insensitive). */
function roleSchema(roles: RoleWithPermissions[], role: RoleWithPermissions | null) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, "Enter a role name, for example Fleet manager.")
      .superRefine((name, ctx) => {
        const clash = roles.find((r) => r.id !== role?.id && r.roleName.trim().toLowerCase() === name.toLowerCase());
        const message =
          name.length > 60
            ? `Role names are up to 60 characters. This one has ${name.length}.`
            : clash
              ? `There's already a role called ${clash.roleName}. Pick another name.`
              : null;
        if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      }),
  });
}

export function RoleDialog({
  open,
  onClose,
  organizationId,
  organizationType,
  role,
  roles,
  online,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  organizationType: OrganizationTypeCode;
  /** Edit this role; null creates one. */
  role: RoleWithPermissions | null;
  /** Every role, for the duplicate-name check. */
  roles: RoleWithPermissions[];
  online: boolean;
  onSaved: (saved: RoleWithPermissions, previous: RoleWithPermissions | null) => void;
}) {
  const toast = useToast();
  const groups = groupsFor(organizationType);
  const offered = new Set(groups.flatMap((group) => group.codes));
  const [selected, setSelected] = useState<Set<PermissionCode>>(new Set());
  const [tried, setTried] = useState(false);
  const schema = useMemo(() => roleSchema(roles, role), [roles, role]);
  // The 409 copy names what was typed; filled in once values are known, read when a 409 comes back.
  const conflicts = { name: "" };
  const form = useForm({
    schema,
    initial: { name: role?.roleName ?? "" },
    failTitle: role ? "The role wasn't saved" : "The role wasn't created",
    conflicts,
  });
  conflicts.name = `There's already a role called ${form.values.name.trim()}. Pick another name.`;
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    reset({ name: role?.roleName ?? "" });
    setTried(false);
    setSelected(new Set((role?.permissions ?? []).filter((code) => offered.has(code))));
    // Keyed on the role's id: a re-read of the same role while open mustn't reset the form.
  }, [open, role?.id]);

  const trimmed = form.values.name.trim();
  const permissions = [...selected];
  const original = new Set(role?.permissions ?? []);
  const dirty = role
    ? trimmed !== role.roleName || permissions.length !== original.size || permissions.some((code) => !original.has(code))
    : true;

  function toggle(code: PermissionCode) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function setGroup(codes: PermissionCode[], on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const code of codes) {
        if (on) next.add(code);
        else next.delete(code);
      }
      return next;
    });
  }

  const save = form.submit(async ({ name }) => {
    if (!dirty) return;
    // Always the complete desired state — the API replaces name and permissions together.
    const input = { name, permissions };
    const saved = role ? await apiClient.updateRole(organizationId, role.id, input) : await apiClient.createRole(organizationId, input);
    const result: RoleWithPermissions = saved ?? { id: role?.id ?? "", roleName: name, isBuiltin: false, permissions };
    toast.success({
      title: role ? `Role ${name} updated` : `Role ${name} created`,
      body: role
        ? `${plural(permissions.length, "permission")}${name !== role.roleName ? `, renamed from ${role.roleName}` : ""}. Everyone holding it has the new access now.`
        : `${plural(permissions.length, "permission")}. Invite people into it from Members.`,
    });
    onSaved(result, role);
    onClose();
  });
  const handleSubmit = (event: FormEvent) => {
    setTried(true);
    void save(event);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={role ? `Edit the ${role.roleName} role` : "New role"}
      description="Pick what people with this role can do. Only permissions that apply to your organization type are offered."
      icon={role ? "edit" : "organization"}
      size="lg"
      dismissible={!form.busy}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose} disabled={form.busy}>
            Cancel
          </Button>
          <Button type="submit" busy={form.busy} busyLabel="Saving…" disabled={!dirty || !online} title={!online ? OFFLINE_HINT : undefined}>
            {role ? "Save role" : "Create role"}
          </Button>
        </>
      }
    >
      {!online && (
        <FormBanner tone="warning" title="You're offline">
          Nothing can be saved until the connection is back. Your choices are kept.
        </FormBanner>
      )}
      {form.banner && (
        <FormBanner tone="error" title={form.banner.title}>
          {form.banner.body}
        </FormBanner>
      )}
      <div data-field="name">
        <Input
          label="Role name"
          required
          maxLength={70}
          placeholder="e.g. Fleet manager"
          {...form.field("name")}
          hint="Up to 60 characters. Members see it next to their name."
        />
      </div>
      <FormSection
        title={`Permissions · ${selected.size} of ${offered.size} selected`}
        description="Each line says what it allows. Leave everything unticked for a role that can only see the dashboard and notifications."
        className="border-t border-border pt-4"
      >
        {selected.size === 0 && (
          <p className="m-0 flex items-start gap-1.5 text-xs leading-[1.45] text-attention">
            <Icon name="warning" size={13} className="mt-px" />
            No permissions ticked: people with this role will only see the dashboard and notifications.
          </p>
        )}
        <div className="flex flex-col gap-3">
          {groups.map((group) => {
            const all = group.codes.every((code) => selected.has(code));
            return (
              <fieldset key={group.key} className="m-0 flex flex-col gap-2.5 rounded-control border border-border-soft p-3">
                <legend className="px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-meta">{group.label}</legend>
                <div className="-mt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setGroup(group.codes, !all)}
                    className="border-0 bg-transparent p-0 text-[11px] font-medium text-accent-text hover:text-accent-text-hover hover:underline"
                  >
                    {all ? "Clear this group" : "Tick all in this group"}
                  </button>
                </div>
                {group.codes.map((code) => (
                  <Checkbox
                    key={code}
                    checked={selected.has(code)}
                    onChange={() => toggle(code)}
                    label={PERMISSION_INFO[code].label}
                    description={
                      <>
                        {PERMISSION_INFO[code].description}
                        <span className="mt-0.5 block text-[10px] text-meta-light">
                          <span className="font-mono">{code}</span> · {appliesTo(code)}
                        </span>
                      </>
                    }
                  />
                ))}
              </fieldset>
            );
          })}
        </div>
      </FormSection>
      {tried && !dirty && <p className="m-0 text-xs text-meta">Nothing has changed yet.</p>}
    </Dialog>
  );
}

// ------------------------------------------------------------------ delete

function DeleteRoleDialog({
  role,
  memberCount,
  organizationId,
  online,
  onClose,
  onDeleted,
}: {
  role: RoleWithPermissions;
  memberCount: number | null;
  organizationId: string;
  online: boolean;
  onClose: () => void;
  onDeleted: (role: RoleWithPermissions) => void;
}) {
  const toast = useToast();
  const action = useAction();
  // The API refuses (409, no field) while a member or a pending invite still references the role.
  const status = useStatusCopy({
    409: {
      title: `${role.roleName} is still in use`,
      body: "A member or a pending invite link still uses this role. Move those members to another role first; an unused invite link keeps blocking it until it expires.",
    },
  });
  const problem = status.banner ?? action.banner;
  const inUse = (memberCount ?? 0) > 0;

  const confirm = async () => {
    await action.run(() => status.guard(() => apiClient.deleteRole(organizationId, role.id)), {
      failTitle: "The role wasn't deleted",
      success: () => ({ title: `Role ${role.roleName} deleted`, body: "It's no longer offered when inviting or moving members." }),
      onDone: () => {
        onDeleted(role);
        onClose();
      },
    });
  };

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={confirm}
      title={`Delete the ${role.roleName} role?`}
      icon="retire"
      tone="danger"
      consequences={[
        memberCount === null
          ? "FleetIP won't delete a role while a member still holds it."
          : inUse
            ? `${plural(memberCount ?? 0, "member")} still ${memberCount === 1 ? "holds" : "hold"} it. Move them to another role first.`
            : "No member holds it.",
        "An invite link created for this role also blocks deleting it until the link is used or expires.",
        "This can't be undone. You can create a role with the same name again later.",
      ]}
      confirmLabel="Delete role"
      busyLabel="Deleting…"
      cancelLabel="Keep role"
      confirmVariant="danger"
      busy={action.busy}
      confirmDisabled={inUse || !online}
    >
      {problem && (
        <FormBanner tone="error" title={problem.title}>
          {problem.body}
        </FormBanner>
      )}
      {!online && <p className="m-0 text-xs text-attention">{OFFLINE_HINT}</p>}
    </ConfirmDialog>
  );
}
