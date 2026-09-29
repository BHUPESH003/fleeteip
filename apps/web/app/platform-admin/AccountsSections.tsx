"use client";

import { AccountStatus, type PlatformOrganization, type PlatformUser } from "@fleetip/contracts/platform-admin";
import {
  Button,
  CellStack,
  ConfirmDialog,
  EmptyState,
  ErrorState,
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
  type SortDirection,
} from "@fleetip/ui";
import { useState } from "react";
import { adminApiClient } from "../../lib/admin-api-client";
import { useConnection } from "../../lib/connection";
import { OFFLINE_HINT, describeError } from "../../lib/errors";
import { formatDate, formatNumber } from "../../lib/format";
import { Status } from "../../lib/status";
import { useUrlSearch, useUrlState } from "../../lib/url-state";
import { isSignedOut, useStaffAction, useStaffLoad } from "./staff-api";

const PAGE_SIZE = 25;

const TYPE_LABEL: Record<string, string> = { rental_company: "Rental company", renter: "Renter" };


function useListParams() {
  const { get, set } = useUrlState();
  const search = useUrlSearch("q", get, set);
  const sortKey = get("sort") || "name";
  const sortDir: "asc" | "desc" = get("dir") === "desc" ? "desc" : "asc";
  const page = Math.max(1, Math.floor(Number(get("page", "1"))) || 1);
  function sortProps(key: string, defaultDir: "asc" | "desc" = "asc") {
    const active = sortKey === key;
    return {
      sortDirection: (active ? sortDir : null) as SortDirection,
      onSort: () => set({ sort: key, dir: active ? (sortDir === "asc" ? "desc" : "asc") : defaultDir }),
    };
  }
  // Search starts at 2 characters (table rules: debounced, minimum 2).
  const rawQuery = get("q").trim().toLowerCase();
  return { get, set, search, sortKey, sortDir, page, sortProps, query: rawQuery.length >= 2 ? rawQuery : "" };
}

function paginate<T>(rows: T[], page: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  return { pageCount, current, shown: rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE) };
}

function LoadError({ what, error, onRetry }: { what: string; error: unknown; onRetry: () => void }) {
  if (isSignedOut(error)) return null;
  return (
    <div className="p-4">
      <ErrorState
        title={`${what} didn't load`}
        message={describeError(error).body}
        action={
          <Button variant="secondary" size="sm" icon="refresh" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    </div>
  );
}

function StatusAction({
  status,
  label,
  onClick,
  online,
}: {
  status: AccountStatus;
  label: string;
  onClick: () => void;
  online: boolean;
}) {
  return (
    <Button
      variant={status === AccountStatus.active ? "danger" : "secondary"}
      size="sm"
      onClick={onClick}
      disabled={!online}
      title={!online ? OFFLINE_HINT : undefined}
      aria-label={`${status === AccountStatus.active ? "Suspend" : "Reactivate"} ${label}`}
    >
      {status === AccountStatus.active ? "Suspend" : "Reactivate"}
    </Button>
  );
}

// ------------------------------------------------------------------ organizations

export function OrganizationsSection() {
  const { online } = useConnection();
  const list = useListParams();
  const typeFilter = list.get("type");
  const statusFilter = list.get("status");
  const load = useStaffLoad(() => adminApiClient.listOrganizations().then((rows) => rows ?? []), []);
  const [target, setTarget] = useState<PlatformOrganization | null>(null);
  const action = useStaffAction();

  const rows = (load.data ?? [])
    .filter((org) => {
      if (typeFilter && org.organizationTypeCode !== typeFilter) return false;
      if (statusFilter && org.status !== statusFilter) return false;
      return !list.query || `${org.name} ${org.code}`.toLowerCase().includes(list.query);
    })
    .sort((a, b) => {
      const cmp = list.sortKey === "created" ? a.createdAt.localeCompare(b.createdAt) : a.name.localeCompare(b.name);
      return list.sortDir === "desc" ? -cmp : cmp;
    });
  const { pageCount, current, shown } = paginate(rows, list.page);
  const filtersActive = Boolean(list.query || typeFilter || statusFilter);
  const suspendedCount = (load.data ?? []).filter((org) => org.status === AccountStatus.suspended).length;

  const changeStatus = async () => {
    if (!target) return;
    const next: AccountStatus = target.status === AccountStatus.active ? AccountStatus.suspended : AccountStatus.active;
    await action.run(() => adminApiClient.setOrganizationStatus(target.id, next), {
      failTitle: next === AccountStatus.suspended ? `${target.name} wasn't suspended` : `${target.name} wasn't reactivated`,
      success: () =>
        next === AccountStatus.suspended
          ? { title: `${target.name} suspended`, body: "Its members can't use it until you reactivate it." }
          : { title: `${target.name} reactivated`, body: "Its members can use it again, with the roles they had." },
      onDone: (updated) => {
        load.setData((current) => current?.map((org) => (org.id === target.id ? (updated ?? { ...org, status: next }) : org)) ?? current);
        setTarget(null);
      },
    });
  };

  const clear = () => {
    list.search.setValue("");
    list.set({ q: null, type: null, status: null });
  };

  return (
    <>
      <Panel
        title="Organizations"
        count={load.data?.length}
        subtitle={load.data && suspendedCount > 0 ? `${formatNumber(suspendedCount, 0)} suspended` : undefined}
        icon="organization"
        padding="none"
      >
        <TableToolbar>
          <Input
            size="sm"
            aria-label="Search organizations by name or code"
            placeholder="Search name or code"
            className="w-full max-w-[280px]"
            value={list.search.value}
            onChange={(event) => list.search.setValue(event.target.value)}
            suffix={list.search.pending ? "Searching…" : undefined}
            hideOptional
          />
          <Select
            size="sm"
            aria-label="Organization type"
            className="w-[170px]"
            value={typeFilter}
            onChange={(event) => list.set({ type: event.target.value || null })}
            options={[
              { value: "", label: "All types" },
              { value: "rental_company", label: "Rental companies" },
              { value: "renter", label: "Renters" },
            ]}
            hideOptional
          />
          <Select
            size="sm"
            aria-label="Status"
            className="w-[150px]"
            value={statusFilter}
            onChange={(event) => list.set({ status: event.target.value || null })}
            options={[
              { value: "", label: "Any status" },
              { value: AccountStatus.active, label: "Active" },
              { value: AccountStatus.suspended, label: "Suspended" },
            ]}
            hideOptional
          />
          {filtersActive && (
            <Button variant="tertiary" size="sm" icon="close" onClick={clear}>
              Clear filters
            </Button>
          )}
        </TableToolbar>
        {load.error ? (
          <LoadError what="Organizations" error={load.error} onRetry={() => void load.reload()} />
        ) : load.loading || !load.data ? (
          <Table bare minWidth={720} caption="Loading organizations">
            <Thead>
              <Tr>
                <Th>Organization</Th>
                <Th>Code</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th>On FleetIP since</Th>
                <Th />
              </Tr>
            </Thead>
            <TableSkeleton columns={6} label="Loading organizations" />
          </Table>
        ) : rows.length === 0 ? (
          <EmptyState
            title={filtersActive ? "No organizations match these filters" : "No organizations yet"}
            description={filtersActive ? "Clear the filters to see every organization." : "Every tenant organization appears here once someone signs up."}
            action={
              filtersActive ? (
                <Button variant="secondary" onClick={clear}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table bare minWidth={720} caption="Every organization on FleetIP">
            <Thead>
              <Tr>
                <Th {...list.sortProps("name")}>Organization</Th>
                <Th>Code</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th {...list.sortProps("created", "desc")}>On FleetIP since</Th>
                <Th className="w-[1%]">
                  <span className="sr-only">Actions</span>
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              {shown.map((org) => (
                <Tr key={org.id}>
                  <Td>
                    <CellStack title={org.name} />
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-xs font-medium">{org.code}</Td>
                  <Td>{TYPE_LABEL[org.organizationTypeCode] ?? org.organizationTypeCode}</Td>
                  <Td>
                    <Status domain="account" value={org.status} size="sm" />
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-xs">{formatDate(org.createdAt)}</Td>
                  <Td align="right">
                    <StatusAction status={org.status} label={org.name} online={online} onClick={() => setTarget(org)} />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
        {load.data && rows.length > PAGE_SIZE && (
          <TableFooter>
            <Pagination
              page={current}
              pageCount={pageCount}
              onPageChange={(next) => list.set({ page: next > 1 ? next : null })}
              total={rows.length}
              pageSize={PAGE_SIZE}
              noun="organizations"
            />
          </TableFooter>
        )}
      </Panel>
      <p className="m-0 px-1 text-[11px] leading-[1.5] text-meta-light">
        Suspending an organization is enforced by the API on every request, not just hidden here. Nothing is deleted.
      </p>

      {target && (
        <ConfirmDialog
          open
          onClose={() => setTarget(null)}
          onConfirm={changeStatus}
          title={target.status === AccountStatus.active ? `Suspend ${target.name}?` : `Reactivate ${target.name}?`}
          description={`${TYPE_LABEL[target.organizationTypeCode] ?? "Organization"} · ${target.code}`}
          icon={target.status === AccountStatus.active ? "lock" : "success"}
          tone={target.status === AccountStatus.active ? "danger" : "success"}
          consequences={
            target.status === AccountStatus.active
              ? [
                  "Every member loses access to it straight away: FleetIP refuses their requests for this organization until it's reactivated.",
                  "Members keep their FleetIP logins and any other organizations they belong to.",
                  "Nothing is deleted. Reactivating restores access as it was.",
                ]
              : ["Its members can use it again straight away, with the roles they had before."]
          }
          confirmLabel={target.status === AccountStatus.active ? "Suspend organization" : "Reactivate organization"}
          confirmVariant={target.status === AccountStatus.active ? "danger" : "primary"}
          cancelLabel={target.status === AccountStatus.active ? "Keep active" : "Keep suspended"}
          busy={action.busy}
          busyLabel={target.status === AccountStatus.active ? "Suspending…" : "Reactivating…"}
          confirmDisabled={!online}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------------ users

export function UsersSection() {
  const { online } = useConnection();
  const list = useListParams();
  const statusFilter = list.get("status");
  const load = useStaffLoad(() => adminApiClient.listUsers().then((rows) => rows ?? []), []);
  const [target, setTarget] = useState<PlatformUser | null>(null);
  const action = useStaffAction();

  const rows = (load.data ?? [])
    .filter((user) => {
      if (statusFilter && user.status !== statusFilter) return false;
      return !list.query || `${user.displayName} ${user.email}`.toLowerCase().includes(list.query);
    })
    .sort((a, b) => {
      const cmp = list.sortKey === "created" ? a.createdAt.localeCompare(b.createdAt) : a.displayName.localeCompare(b.displayName);
      return list.sortDir === "desc" ? -cmp : cmp;
    });
  const { pageCount, current, shown } = paginate(rows, list.page);
  const filtersActive = Boolean(list.query || statusFilter);
  const suspendedCount = (load.data ?? []).filter((user) => user.status === AccountStatus.suspended).length;

  const changeStatus = async () => {
    if (!target) return;
    const next: AccountStatus = target.status === AccountStatus.active ? AccountStatus.suspended : AccountStatus.active;
    await action.run(() => adminApiClient.setUserStatus(target.id, next), {
      failTitle: next === AccountStatus.suspended ? `${target.displayName} wasn't suspended` : `${target.displayName} wasn't reactivated`,
      success: () =>
        next === AccountStatus.suspended
          ? { title: `${target.displayName} suspended`, body: "They can't sign in until you reactivate them." }
          : { title: `${target.displayName} reactivated`, body: "They can sign in again." },
      onDone: (updated) => {
        load.setData((current) => current?.map((user) => (user.id === target.id ? (updated ?? { ...user, status: next }) : user)) ?? current);
        setTarget(null);
      },
    });
  };

  const clear = () => {
    list.search.setValue("");
    list.set({ q: null, status: null });
  };

  return (
    <>
      <Panel
        title="Users"
        count={load.data?.length}
        subtitle={load.data && suspendedCount > 0 ? `${formatNumber(suspendedCount, 0)} suspended` : undefined}
        icon="user"
        padding="none"
      >
        <TableToolbar>
          <Input
            size="sm"
            aria-label="Search users by name or email"
            placeholder="Search name or email"
            className="w-full max-w-[280px]"
            value={list.search.value}
            onChange={(event) => list.search.setValue(event.target.value)}
            suffix={list.search.pending ? "Searching…" : undefined}
            hideOptional
          />
          <Select
            size="sm"
            aria-label="Status"
            className="w-[150px]"
            value={statusFilter}
            onChange={(event) => list.set({ status: event.target.value || null })}
            options={[
              { value: "", label: "Any status" },
              { value: AccountStatus.active, label: "Active" },
              { value: AccountStatus.suspended, label: "Suspended" },
            ]}
            hideOptional
          />
          {filtersActive && (
            <Button variant="tertiary" size="sm" icon="close" onClick={clear}>
              Clear filters
            </Button>
          )}
        </TableToolbar>
        {load.error ? (
          <LoadError what="Users" error={load.error} onRetry={() => void load.reload()} />
        ) : load.loading || !load.data ? (
          <Table bare minWidth={640} caption="Loading users">
            <Thead>
              <Tr>
                <Th>User</Th>
                <Th>Status</Th>
                <Th>Joined FleetIP</Th>
                <Th />
              </Tr>
            </Thead>
            <TableSkeleton columns={4} label="Loading users" />
          </Table>
        ) : rows.length === 0 ? (
          <EmptyState
            title={filtersActive ? "No users match these filters" : "No users yet"}
            description={filtersActive ? "Clear the filters to see everyone." : "People appear here once they create a FleetIP login."}
            action={
              filtersActive ? (
                <Button variant="secondary" onClick={clear}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table bare minWidth={640} caption="Every FleetIP user">
            <Thead>
              <Tr>
                <Th {...list.sortProps("name")}>User</Th>
                <Th>Status</Th>
                <Th {...list.sortProps("created", "desc")}>Joined FleetIP</Th>
                <Th className="w-[1%]">
                  <span className="sr-only">Actions</span>
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              {shown.map((user) => (
                <Tr key={user.id}>
                  <Td>
                    <CellStack title={user.displayName} sub={user.email} />
                  </Td>
                  <Td>
                    <Status domain="account" value={user.status} size="sm" />
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-xs">{formatDate(user.createdAt)}</Td>
                  <Td align="right">
                    <StatusAction status={user.status} label={user.displayName} online={online} onClick={() => setTarget(user)} />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
        {load.data && rows.length > PAGE_SIZE && (
          <TableFooter>
            <Pagination
              page={current}
              pageCount={pageCount}
              onPageChange={(next) => list.set({ page: next > 1 ? next : null })}
              total={rows.length}
              pageSize={PAGE_SIZE}
              noun="users"
            />
          </TableFooter>
        )}
      </Panel>
      <p className="m-0 px-1 text-[11px] leading-[1.5] text-meta-light">
        Passwords, credentials and session tokens are never shown here.
      </p>

      {target && (
        <ConfirmDialog
          open
          onClose={() => setTarget(null)}
          onConfirm={changeStatus}
          title={target.status === AccountStatus.active ? `Suspend ${target.displayName}?` : `Reactivate ${target.displayName}?`}
          description={target.email}
          icon={target.status === AccountStatus.active ? "lock" : "success"}
          tone={target.status === AccountStatus.active ? "danger" : "success"}
          consequences={
            target.status === AccountStatus.active
              ? [
                  "They can't sign in to FleetIP until you reactivate them.",
                  "If they're signed in right now, that session keeps working until it expires — FleetIP doesn't end open sessions yet.",
                  "Their memberships and records stay as they are.",
                ]
              : ["They can sign in again straight away, into the organizations they belong to."]
          }
          confirmLabel={target.status === AccountStatus.active ? "Suspend user" : "Reactivate user"}
          confirmVariant={target.status === AccountStatus.active ? "danger" : "primary"}
          cancelLabel={target.status === AccountStatus.active ? "Keep active" : "Keep suspended"}
          busy={action.busy}
          busyLabel={target.status === AccountStatus.active ? "Suspending…" : "Reactivating…"}
          confirmDisabled={!online}
        />
      )}
    </>
  );
}
