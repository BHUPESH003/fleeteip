"use client";

import {
  InviteStatus,
  type CreateInviteResponse,
  type OrganizationInvite,
  type OrganizationMember,
  type PermissionCode,
  type RoleWithPermissions,
} from "@fleetip/contracts/organization";
import {
  Alert,
  Button,
  CellStack,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  FormBanner,
  Icon,
  Input,
  Pagination,
  Panel,
  Select,
  Table,
  TableFooter,
  TableSkeleton,
  TableToolbar,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
  type SortDirection,
} from "@fleetip/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { apiClient } from "../../../lib/api-client";
import { OFFLINE_HINT, describeError, errorStatus } from "../../../lib/errors";
import { useAction, useForm } from "../../../lib/form";
import { formatDate, formatDateTime, formatNumber, plural } from "../../../lib/format";
import { Status } from "../../../lib/status";
import { useUrlSearch, useUrlState } from "../../../lib/url-state";
import type { LoadState } from "../../../lib/use-load";
import { permissionDiff, permissionLabel } from "./permissions";

const PAGE_SIZE = 25;

/**
 * Why roles might not be pickable: listing roles needs organization.manage
 * while inviting/moving members needs membership.manage (a known split,
 * docs/decisions.md). Only the built-in owner holds both today.
 */
export const ROLES_NEED_ORGANIZATION =
  "Choosing a role needs the Organization and roles permission, which your role doesn't have. Ask an owner to do this, or to add it to your role.";

export function MembersTab({
  organizationId,
  members,
  invites,
  roles,
  rolesProblem,
  currentUserId,
  online,
  onMemberChanged,
}: {
  organizationId: string;
  members: LoadState<OrganizationMember[]>;
  invites: LoadState<OrganizationInvite[]>;
  /** null while unavailable (no permission, loading or failed) — see rolesProblem. */
  roles: RoleWithPermissions[] | null;
  /** Why roles can't be picked right now, or null when they can. */
  rolesProblem: string | null;
  currentUserId: string;
  online: boolean;
  onMemberChanged: (member: OrganizationMember) => void;
}) {
  const { get, set } = useUrlState();
  const search = useUrlSearch("q", get, set);
  // Search starts at 2 characters (table rules: debounced, minimum 2).
  const rawQuery = get("q").trim().toLowerCase();
  const query = rawQuery.length >= 2 ? rawQuery : "";
  const roleFilter = get("role");
  const sortKey = get("sort") || "name";
  const sortDir: "asc" | "desc" = get("dir") === "desc" ? "desc" : "asc";
  const page = Math.max(1, Math.floor(Number(get("page", "1"))) || 1);
  const [changing, setChanging] = useState<OrganizationMember | null>(null);

  const list = members.data ?? [];
  const roleNames = useMemo(() => [...new Set(list.map((m) => m.roleName))].sort(), [list]);
  const filtered = useMemo(() => {
    const rows = list.filter((member) => {
      if (roleFilter && member.roleName !== roleFilter) return false;
      return !query || `${member.displayName} ${member.email}`.toLowerCase().includes(query);
    });
    const factor = sortDir === "desc" ? -1 : 1;
    return rows.sort((a, b) => {
      const cmp =
        sortKey === "role"
          ? a.roleName.localeCompare(b.roleName) || a.displayName.localeCompare(b.displayName)
          : sortKey === "joined"
            ? a.createdAt.localeCompare(b.createdAt)
            : a.displayName.localeCompare(b.displayName);
      return cmp * factor;
    });
  }, [list, roleFilter, query, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const shown = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const filtersActive = Boolean(query || roleFilter);

  function sortProps(key: string, defaultDir: "asc" | "desc" = "asc") {
    const active = sortKey === key;
    return {
      sortDirection: (active ? sortDir : null) as SortDirection,
      onSort: () => set({ sort: key, dir: active ? (sortDir === "asc" ? "desc" : "asc") : defaultDir }),
    };
  }

  const changeBlocked = !online ? OFFLINE_HINT : rolesProblem;

  return (
    <>
      <Panel title="Members" count={members.data ? members.data.length : undefined} icon="user" padding="none">
        <TableToolbar>
          <Input
            size="sm"
            aria-label="Search members by name or email"
            placeholder="Search name or email"
            className="w-full max-w-[280px]"
            value={search.value}
            onChange={(event) => search.setValue(event.target.value)}
            suffix={search.pending ? "Searching…" : undefined}
            hideOptional
          />
          <Select
            size="sm"
            aria-label="Role"
            className="w-[180px]"
            value={roleFilter}
            onChange={(event) => set({ role: event.target.value || null })}
            options={[{ value: "", label: "All roles" }, ...roleNames.map((name) => ({ value: name, label: name }))]}
            hideOptional
          />
          {filtersActive && (
            <Button
              variant="tertiary"
              size="sm"
              icon="close"
              onClick={() => {
                search.setValue("");
                set({ q: null, role: null });
              }}
            >
              Clear filters
            </Button>
          )}
          {members.data && (
            <span className="ml-auto text-xs text-meta" aria-live="polite">
              <span className="font-mono">{formatNumber(filtered.length, 0)}</span> {filtered.length === 1 ? "member" : "members"}
              {filtersActive ? " match" : ""}
            </span>
          )}
        </TableToolbar>
        {members.error ? (
          <div className="p-4">
            <ErrorState
              title="Members didn't load"
              message={describeError(members.error).body}
              action={
                <Button variant="secondary" size="sm" icon="refresh" onClick={() => void members.reload()}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : members.loading || !members.data ? (
          <Table bare minWidth={680} caption="Loading members">
            <MembersHead />
            <TableSkeleton columns={5} rows={4} label="Loading members" />
          </Table>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={filtersActive ? `No members match ${[query && `“${get("q")}”`, roleFilter].filter(Boolean).join(" · ")}` : "No members yet"}
            description={filtersActive ? "Check the spelling, or clear the filters to see everyone." : "Invite people with a link to add them."}
            action={
              filtersActive ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    search.setValue("");
                    set({ q: null, role: null });
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table bare minWidth={680} caption="Members of this organization">
            <MembersHead sortProps={sortProps} />
            <Tbody>
              {shown.map((member) => {
                const isSelf = member.userId === currentUserId;
                return (
                  <Tr key={member.id}>
                    <Td>
                      <CellStack title={`${member.displayName}${isSelf ? " (you)" : ""}`} sub={member.email} />
                    </Td>
                    <Td>{member.roleName}</Td>
                    <Td>
                      <Status domain="membership" value={member.status} size="sm" />
                    </Td>
                    <Td className="whitespace-nowrap font-mono text-xs">{formatDate(member.createdAt)}</Td>
                    <Td align="right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setChanging(member)}
                        disabled={Boolean(changeBlocked)}
                        title={changeBlocked ?? undefined}
                        aria-label={`Change role for ${member.displayName}`}
                      >
                        Change role
                      </Button>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
        {members.data && filtered.length > PAGE_SIZE && (
          <TableFooter>
            <Pagination
              page={currentPage}
              pageCount={pageCount}
              onPageChange={(next) => set({ page: next > 1 ? next : null })}
              total={filtered.length}
              pageSize={PAGE_SIZE}
              noun="members"
            />
          </TableFooter>
        )}
      </Panel>
      <PendingInvitesPanel organizationId={organizationId} invites={invites} online={online} />
      <p className="m-0 px-1 text-[11px] leading-[1.5] text-meta-light">
        Each invite link works once and stops working after it expires or is revoked. Emailing the link isn&apos;t
        automated — send it yourself.
      </p>
      {changing && roles && (
        <ChangeRoleDialog
          open
          member={changing}
          roles={roles}
          organizationId={organizationId}
          isSelf={changing.userId === currentUserId}
          online={online}
          onClose={() => setChanging(null)}
          onChanged={onMemberChanged}
        />
      )}
    </>
  );
}

function MembersHead({
  sortProps,
}: {
  sortProps?: (key: string, defaultDir?: "asc" | "desc") => { sortDirection: SortDirection; onSort: () => void };
}) {
  return (
    <Thead>
      <Tr>
        <Th {...(sortProps?.("name") ?? {})}>Member</Th>
        <Th {...(sortProps?.("role") ?? {})}>Role</Th>
        <Th>Status</Th>
        <Th {...(sortProps?.("joined", "desc") ?? {})}>Joined</Th>
        <Th className="w-[1%]">
          <span className="sr-only">Actions</span>
        </Th>
      </Tr>
    </Thead>
  );
}

// ------------------------------------------------------------------ pending invites

function PendingInvitesPanel({
  organizationId,
  invites,
  online,
}: {
  organizationId: string;
  invites: LoadState<OrganizationInvite[]>;
  online: boolean;
}) {
  const [revoking, setRevoking] = useState<OrganizationInvite | null>(null);
  const action = useAction();
  const problem = action.banner;
  // Accepted/revoked invites are history, not actions — only pending ones show.
  const pending = (invites.data ?? []).filter((invite) => invite.status === InviteStatus.pending);

  const confirmRevoke = async () => {
    if (!revoking) return;
    await action.run(() => apiClient.revokeInvite(organizationId, revoking.id), {
      failTitle: "The invite wasn't revoked",
      // The revoke endpoint's only conflict (no field): someone used or revoked it first — re-read so the row reflects that.
      statusCopy: { 409: { title: "This invite isn't pending any more", body: "It was accepted or revoked in the meantime." } },
      onFailed: (error) => {
        if (errorStatus(error) === 409) void invites.reload();
      },
      success: () => ({ title: "Invite revoked", body: `The ${revoking.roleName} link no longer works.` }),
      onDone: (revoked) => {
        invites.setData(
          (list) => list?.map((i) => (i.id === revoking.id ? (revoked ?? { ...i, status: InviteStatus.revoked }) : i)) ?? list,
        );
        setRevoking(null);
      },
    });
  };

  return (
    <Panel title="Pending invites" count={invites.data ? pending.length : undefined} icon="clock" padding="none">
      {invites.error ? (
        <div className="p-4">
          <ErrorState
            title="Invites didn't load"
            message={describeError(invites.error).body}
            action={
              <Button variant="secondary" size="sm" icon="refresh" onClick={() => void invites.reload()}>
                Try again
              </Button>
            }
          />
        </div>
      ) : invites.loading || !invites.data ? (
        <Table bare minWidth={560} caption="Loading invites">
          <InvitesHead />
          <TableSkeleton columns={4} rows={2} label="Loading invites" />
        </Table>
      ) : pending.length === 0 ? (
        <EmptyState title="No pending invites" description="Links you create show here until they're used, expire or are revoked." />
      ) : (
        <Table bare minWidth={560} caption="Pending invite links">
          <InvitesHead />
          <Tbody>
            {pending.map((invite) => (
              <Tr key={invite.id}>
                <Td>{invite.roleName}</Td>
                <Td className="whitespace-nowrap font-mono text-xs">{formatDateTime(invite.createdAt)}</Td>
                <Td className="whitespace-nowrap font-mono text-xs">
                  {invite.expired ? <span className="text-attention">Expired</span> : formatDateTime(invite.expiresAt)}
                </Td>
                <Td align="right">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      action.clear();
                      setRevoking(invite);
                    }}
                    disabled={!online}
                    title={!online ? OFFLINE_HINT : undefined}
                    aria-label={`Revoke ${invite.roleName} invite created ${formatDateTime(invite.createdAt)}`}
                  >
                    Revoke
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
      {revoking && (
        <ConfirmDialog
          open
          onClose={() => setRevoking(null)}
          onConfirm={confirmRevoke}
          title="Revoke this invite link?"
          description={`Anyone opening the ${revoking.roleName} link will be told it's no longer valid.`}
          icon="close"
          tone="danger"
          consequences={["People who already joined with other links aren't affected.", "This can't be undone — create a new link if you change your mind."]}
          confirmLabel="Revoke invite"
          busyLabel="Revoking…"
          cancelLabel="Keep invite"
          confirmVariant="danger"
          busy={action.busy}
          confirmDisabled={!online}
        >
          {problem && (
            <FormBanner tone="error" title={problem.title}>
              {problem.body}
            </FormBanner>
          )}
        </ConfirmDialog>
      )}
    </Panel>
  );
}

function InvitesHead() {
  return (
    <Thead>
      <Tr>
        <Th>Joins as</Th>
        <Th>Created</Th>
        <Th>Expires</Th>
        <Th className="w-[1%]">
          <span className="sr-only">Actions</span>
        </Th>
      </Tr>
    </Thead>
  );
}

// ------------------------------------------------------------------ change role

export function AccessDiff({ gained, lost }: { gained: PermissionCode[]; lost: PermissionCode[] }) {
  if (gained.length === 0 && lost.length === 0) {
    return <p className="m-0 text-xs leading-[1.5] text-ink-soft">Same permissions — only the role name changes.</p>;
  }
  return (
    <div className="flex flex-col gap-2 rounded-control border border-border bg-surface-sunk px-3 py-2.5">
      {gained.length > 0 && (
        <div className="flex items-start gap-2">
          <Icon name="plus" size={14} className="mt-0.5 text-available" />
          <p className="m-0 text-xs leading-[1.5] text-ink-body">
            <span className="font-semibold text-ink">Gains: </span>
            {gained.map(permissionLabel).join(", ")}
          </p>
        </div>
      )}
      {lost.length > 0 && (
        <div className="flex items-start gap-2">
          <Icon name="close" size={14} className="mt-0.5 text-destructive" />
          <p className="m-0 text-xs leading-[1.5] text-ink-body">
            <span className="font-semibold text-ink">Loses: </span>
            {lost.map(permissionLabel).join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}

function ChangeRoleDialog({
  open,
  member,
  roles,
  organizationId,
  isSelf,
  online,
  onClose,
  onChanged,
}: {
  open: boolean;
  member: OrganizationMember;
  roles: RoleWithPermissions[];
  organizationId: string;
  isSelf: boolean;
  online: boolean;
  onClose: () => void;
  onChanged: (member: OrganizationMember) => void;
}) {
  const [roleId, setRoleId] = useState("");
  const action = useAction();
  const { clear } = action;

  useEffect(() => {
    if (!open) return;
    setRoleId("");
    clear();
  }, [open, member.id, clear]);

  const current = roles.find((role) => role.id === member.roleId) ?? null;
  const next = roles.find((role) => role.id === roleId) ?? null;
  const diff = next ? permissionDiff(current?.permissions ?? [], next.permissions) : null;
  const who = isSelf ? "You" : member.displayName;
  const selfLosesAdmin =
    isSelf && diff !== null && (diff.lost.includes("membership.manage") || diff.lost.includes("organization.manage"));
  const problem = action.banner;

  const confirm = async () => {
    if (!next) return;
    await action.run(() => apiClient.updateMemberRole(organizationId, member.id, next.id), {
      failTitle: "The role wasn't changed",
      // updateMemberRole's only conflict (no field): it won't leave the organization without an active owner.
      statusCopy: {
        409: {
          title: `${isSelf ? "You're" : `${member.displayName} is`} the last owner`,
          body: "An organization always needs at least one active owner. Make someone else an owner first, then change this role.",
        },
      },
      success: () => ({
        title: isSelf ? `You're now ${next.roleName}` : `${member.displayName} is now ${next.roleName}`,
        body: `Was ${current?.roleName ?? member.roleName}. The new access applies straight away.`,
      }),
      onDone: (updated) => {
        onChanged(updated ?? { ...member, roleId: next.id, roleName: next.roleName });
        onClose();
      },
    });
  };

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={confirm}
      title={isSelf ? "Change your own role?" : `Change ${member.displayName}'s role?`}
      description={`${who} ${isSelf ? "are" : "is"} ${current?.roleName ?? member.roleName} now.`}
      icon="user"
      tone="info"
      consequences={[
        `${isSelf ? "Your" : "Their"} access changes straight away — the next page ${isSelf ? "you open uses" : "they open uses"} the new role.`,
        "An organization always needs at least one active owner; FleetIP won't move the last one.",
      ]}
      confirmLabel="Change role"
      busyLabel="Changing…"
      cancelLabel="Keep current role"
      busy={action.busy}
      confirmDisabled={!next || !online}
    >
      {problem && (
        <FormBanner tone="error" title={problem.title}>
          {problem.body}
        </FormBanner>
      )}
      <Select
        label="New role"
        required
        placeholder="Choose a role"
        value={roleId}
        onChange={(event) => {
          setRoleId(event.target.value);
          action.clear();
        }}
        options={roles
          .filter((role) => role.id !== member.roleId)
          .map((role) => ({ value: role.id, label: role.isBuiltin ? `${role.roleName} (full access)` : role.roleName }))}
        data-autofocus=""
      />
      {next && diff && <AccessDiff gained={diff.gained} lost={diff.lost} />}
      {selfLosesAdmin && (
        <Alert tone="warning" title="You'll lose access to this page's tools">
          After this change you can&apos;t change roles or invite people yourself. Someone else with that access would have
          to change it back.
        </Alert>
      )}
      {!online && <p className="m-0 text-xs text-attention">{OFFLINE_HINT}</p>}
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------------ invite

const inviteSchema = z.object({ roleId: z.string().min(1, "Choose the role the person joins with.") });

export function InviteDialog({
  open,
  onClose,
  organizationId,
  organizationName,
  roles,
  online,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  organizationName: string;
  roles: RoleWithPermissions[];
  online: boolean;
  onCreated?: (invite: OrganizationInvite) => void;
}) {
  const toast = useToast();
  const linkRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<CreateInviteResponse | null>(null);

  // A custom role by default, never the full-access owner role.
  const defaultRoleId = roles.find((role) => !role.isBuiltin && role.roleName === "member")?.id ?? roles.find((role) => !role.isBuiltin)?.id ?? "";
  const form = useForm({ schema: inviteSchema, initial: { roleId: defaultRoleId }, failTitle: "The invite link wasn't created" });
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    reset({ roleId: defaultRoleId });
    setResult(null);
    // Only on opening: roles re-reading while it's open mustn't reset the pick.
  }, [open]);

  const role = roles.find((r) => r.id === form.values.roleId) ?? null;

  const handleSubmit = form.submit(async ({ roleId }) => {
    const created = await apiClient.createInvite(organizationId, roleId);
    if (!created) throw new Error("Empty invite response");
    setResult(created);
    onCreated?.(created.invite);
    toast.success({
      title: `Invite link created for ${created.invite.roleName}`,
      body: `It works once and expires ${formatDate(created.invite.expiresAt)}.`,
    });
  });

  async function copyLink() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.link);
      toast.success({ title: "Invite link copied", body: `Send it to the person joining as ${result.invite.roleName}.` });
    } catch {
      // Clipboard access can be denied by the browser; the link stays visible and selectable.
      linkRef.current?.select();
      toast.error({
        title: "The link wasn't copied",
        body: "Your browser blocked the clipboard. The link is selected — copy it with your keyboard.",
      });
    }
  }

  if (result) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title="Share this invite link"
        description={`Anyone with the link can join ${organizationName} as ${result.invite.roleName} until it's used or expires. Share it only with the person you're inviting.`}
        icon="success"
        tone="success"
        size="md"
        footer={
          <>
            <Button variant="tertiary" onClick={() => setResult(null)}>
              Create another
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        }
      >
        <div className="flex items-end gap-2">
          <Input
            ref={linkRef}
            label="Invite link"
            hideOptional
            readOnly
            mono
            value={result.link}
            className="min-w-0 flex-1"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button variant="secondary" onClick={() => void copyLink()} data-autofocus="">
            Copy link
          </Button>
        </div>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-xs leading-[1.5] text-ink-body">
          <li className="flex items-start gap-2">
            <Icon name="clock" size={14} className="mt-px text-meta" />
            Expires {formatDateTime(result.invite.expiresAt)}, and works for one person only.
          </li>
          <li className="flex items-start gap-2">
            <Icon name="user" size={14} className="mt-px text-meta" />
            Someone new to FleetIP creates an account from the link; someone who already has one signs in and joins with a
            click. Their other organizations aren&apos;t affected.
          </li>
          <li className="flex items-start gap-2">
            <Icon name="lock" size={14} className="mt-px text-meta" />
            Copy it now — FleetIP can&apos;t show this link again.
          </li>
        </ul>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Invite someone to ${organizationName}`}
      description="FleetIP creates a one-time link for the role you choose. Nothing is emailed — you send the link yourself."
      icon="user"
      size="md"
      dismissible={!form.busy}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose} disabled={form.busy}>
            Cancel
          </Button>
          <Button type="submit" busy={form.busy} busyLabel="Creating…" disabled={!online} title={!online ? OFFLINE_HINT : undefined}>
            Create invite link
          </Button>
        </>
      }
    >
      {!online && (
        <FormBanner tone="warning" title="You're offline">
          The link can&apos;t be created until the connection is back.
        </FormBanner>
      )}
      {form.banner && (
        <FormBanner tone="error" title={form.banner.title}>
          {form.banner.body}
        </FormBanner>
      )}
      <Select
        label="They join as"
        required
        placeholder="Choose a role"
        {...form.field("roleId")}
        options={roles.map((r) => ({ value: r.id, label: r.isBuiltin ? `${r.roleName} (full access)` : r.roleName }))}
        hint={
          role && !role.isBuiltin
            ? role.permissions.length === 0
              ? "This role has no permissions yet: they'd see only the dashboard and notifications."
              : `${plural(role.permissions.length, "permission")}: ${role.permissions.map(permissionLabel).join(", ")}.`
            : undefined
        }
        warning={role?.isBuiltin ? "Owners have full access, including members, invites and roles." : undefined}
      />
    </Dialog>
  );
}
