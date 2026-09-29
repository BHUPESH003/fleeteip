"use client";

import type { Auction } from "@fleetip/contracts/auction";
import type { ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import type { Requirement } from "@fleetip/contracts/rfq";
import {
  Button,
  CellStack,
  EmptyState,
  ErrorState,
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
} from "@fleetip/ui";
import { adminApiClient } from "../../lib/admin-api-client";
import { apiClient } from "../../lib/api-client";
import { describeError } from "../../lib/errors";
import { daysUntil, formatDate, formatDateTime, formatMoney, formatNumber, plural, requirementRef } from "../../lib/format";
import { Status, statusOptions } from "../../lib/status";
import { optional } from "../../lib/use-load";
import { useUrlSearch, useUrlState } from "../../lib/url-state";
import { KpiGrid } from "../(app)/dashboard/shared";
import { PERMISSION_GROUPS, PERMISSION_INFO, appliesTo } from "../(app)/settings/permissions";
import { isSignedOut, useStaffLoad } from "./staff-api";

const PAGE_SIZE = 25;

function LoadError({ what, error, onRetry }: { what: string; error: unknown; onRetry: () => void }) {
  if (isSignedOut(error)) return null;
  return (
    <ErrorState
      title={`${what} didn't load`}
      message={describeError(error).body}
      action={
        <Button variant="secondary" size="sm" icon="refresh" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}

// ------------------------------------------------------------------ overview

export function OverviewSection() {
  const load = useStaffLoad(() => adminApiClient.getDashboard(), []);
  if (load.error) return <LoadError what="The overview" error={load.error} onRetry={() => void load.reload()} />;
  if (load.loading || !load.data) {
    return (
      <div aria-busy="true" className="h-[78px] rounded-panel border border-border-soft bg-surface">
        <span className="sr-only">Loading the overview…</span>
      </div>
    );
  }
  const counts = load.data;
  return (
    <div className="flex flex-col gap-2">
      <KpiGrid
        onRetry={() => void load.reload()}
        tiles={[
          {
            key: "organizations",
            label: "Organizations",
            value: formatNumber(counts.organizations, 0),
            context: "Rental companies and renters, any status",
            href: "/platform-admin?section=organizations",
          },
          {
            key: "users",
            label: "Users",
            value: formatNumber(counts.users, 0),
            context: "People with a FleetIP login",
            href: "/platform-admin?section=users",
          },
          {
            key: "requirements",
            label: "Open requirements",
            value: formatNumber(counts.openRequirements, 0),
            context: "Still taking responses",
            href: "/platform-admin?section=requirements",
          },
          {
            key: "auctions",
            label: "Live or scheduled auctions",
            value: formatNumber(counts.liveAuctions, 0),
            context: "Across every renter",
            href: "/platform-admin?section=auctions",
          },
        ]}
      />
      <p className="m-0 px-1 text-[11px] leading-[1.5] text-meta-light">Counted when this page opened, from live data.</p>
    </div>
  );
}

// ------------------------------------------------------------------ requirements

export function RequirementsSection() {
  const { get, set } = useUrlState();
  const search = useUrlSearch("q", get, set);
  const rawQuery = get("q").trim().toLowerCase();
  const query = rawQuery.length >= 2 ? rawQuery : "";
  const page = Math.max(1, Math.floor(Number(get("page", "1"))) || 1);
  const load = useStaffLoad(async () => {
    const [requirements, categories] = await Promise.all([
      adminApiClient.listOpenRequirements().then((rows) => rows ?? []),
      // Equipment names come from the public catalogue; without it the column reads "Not specified".
      optional(true, () => apiClient.listProductCategories(), [] as ProductCategory[]),
    ]);
    const subcategoryLists = await Promise.all(
      categories.map((c) => optional(true, () => apiClient.listProductSubcategories(c.id), [] as ProductSubcategory[])),
    );
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    const subcategoryLabel = new Map(
      subcategoryLists.flat().map((s) => [s.id, [categoryName.get(s.productCategoryId), s.name].filter(Boolean).join(" · ")]),
    );
    return { requirements, subcategoryLabel };
  }, []);

  const subcategoryLabel = load.data?.subcategoryLabel ?? new Map<string, string>();
  const rows = (load.data?.requirements ?? [])
    .filter((r: Requirement) => !query || `${r.projectName ?? ""} ${r.projectLocation ?? ""}`.toLowerCase().includes(query))
    .sort((a, b) => a.validityDate.localeCompare(b.validityDate));
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const shown = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <>
      <Panel title="Open requirements" count={load.data?.requirements.length} subtitle="read-only" icon="requirement" padding="none">
        <TableToolbar>
          <Input
            size="sm"
            aria-label="Search by project or location"
            placeholder="Search project or location"
            className="w-full max-w-[300px]"
            value={search.value}
            onChange={(event) => search.setValue(event.target.value)}
            suffix={search.pending ? "Searching…" : undefined}
            hideOptional
          />
          {query && (
            <Button
              variant="tertiary"
              size="sm"
              icon="close"
              onClick={() => {
                search.setValue("");
                set({ q: null });
              }}
            >
              Clear search
            </Button>
          )}
        </TableToolbar>
        {load.error ? (
          <div className="p-4">
            <LoadError what="Requirements" error={load.error} onRetry={() => void load.reload()} />
          </div>
        ) : load.loading || !load.data ? (
          <Table bare minWidth={760} caption="Loading requirements">
            <Thead>
              <Tr>
                <Th>Requirement</Th>
                <Th>Equipment</Th>
                <Th>Requested start</Th>
                <Th>Takes responses until</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <TableSkeleton columns={5} label="Loading requirements" />
          </Table>
        ) : rows.length === 0 ? (
          <EmptyState
            title={query ? `No open requirements match “${get("q")}”` : "No open requirements right now"}
            description={query ? "Clear the search to see all of them." : "Requirements renters post appear here while they're taking responses."}
          />
        ) : (
          <Table bare minWidth={760} caption="Open requirements across every renter">
            <Thead>
              <Tr>
                <Th>Requirement</Th>
                <Th>Equipment</Th>
                <Th>Requested start</Th>
                <Th>Takes responses until</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {shown.map((requirement) => {
                const days = daysUntil(requirement.validityDate);
                const capacity = requirement.capacity
                  ? `${formatNumber(requirement.capacity, 2)} ${requirement.capacityUnit ?? ""}`.trim()
                  : null;
                return (
                  <Tr key={requirement.id}>
                    <Td>
                      <CellStack
                        title={requirement.projectName ?? "Project not named"}
                        sub={[requirementRef(requirement.id), requirement.projectLocation].filter(Boolean).join(" · ")}
                      />
                    </Td>
                    <Td>
                      <CellStack
                        title={subcategoryLabel.get(requirement.productSubcategoryId) ?? "Not specified"}
                        sub={[capacity, plural(requirement.quantity, "machine")].filter(Boolean).join(" · ")}
                      />
                    </Td>
                    <Td className="whitespace-nowrap font-mono text-xs">{formatDate(requirement.requestedStartDate)}</Td>
                    <Td>
                      <span className="flex flex-col gap-0.5">
                        <span className="whitespace-nowrap font-mono text-xs">{formatDate(requirement.validityDate)}</span>
                        <span className="text-[11px] text-meta-light">
                          {days === 0 ? "Closes today" : days === 1 ? "Closes tomorrow" : `Closes in ${plural(days, "day")}`}
                        </span>
                      </span>
                    </Td>
                    <Td>
                      <Status domain="requirement" value={requirement.status} size="sm" />
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
        {load.data && rows.length > PAGE_SIZE && (
          <TableFooter>
            <Pagination
              page={current}
              pageCount={pageCount}
              onPageChange={(next) => set({ page: next > 1 ? next : null })}
              total={rows.length}
              pageSize={PAGE_SIZE}
              noun="requirements"
            />
          </TableFooter>
        )}
      </Panel>
      <p className="m-0 px-1 text-[11px] leading-[1.5] text-meta-light">
        The same open set rental companies see on the open market. Staff can&apos;t create, edit or close requirements.
      </p>
    </>
  );
}

// ------------------------------------------------------------------ auctions

const DIRECTION: Record<Auction["biddingDirection"], string> = {
  ascending: "Highest bid wins",
  descending: "Lowest bid wins",
};

export function AuctionsSection() {
  const { get, set } = useUrlState();
  const statusFilter = get("status");
  const page = Math.max(1, Math.floor(Number(get("page", "1"))) || 1);
  const load = useStaffLoad(() => adminApiClient.listAuctions().then((rows) => rows ?? []), []);

  const rows = (load.data ?? [])
    .filter((auction) => !statusFilter || auction.status === statusFilter)
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const shown = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <>
      <Panel title="Auctions" count={load.data?.length} subtitle="read-only" icon="auction" padding="none">
        <TableToolbar>
          <Select
            size="sm"
            aria-label="Status"
            className="w-[170px]"
            value={statusFilter}
            onChange={(event) => set({ status: event.target.value || null })}
            options={[{ value: "", label: "Any status" }, ...statusOptions("auction")]}
            hideOptional
          />
          {statusFilter && (
            <Button variant="tertiary" size="sm" icon="close" onClick={() => set({ status: null })}>
              Clear filter
            </Button>
          )}
        </TableToolbar>
        {load.error ? (
          <div className="p-4">
            <LoadError what="Auctions" error={load.error} onRetry={() => void load.reload()} />
          </div>
        ) : load.loading || !load.data ? (
          <Table bare minWidth={800} caption="Loading auctions">
            <Thead>
              <Tr>
                <Th>Auction</Th>
                <Th>Bidding</Th>
                <Th align="right">Base price</Th>
                <Th>Starts</Th>
                <Th>Ends</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <TableSkeleton columns={6} label="Loading auctions" />
          </Table>
        ) : rows.length === 0 ? (
          <EmptyState
            title={statusFilter ? "No auctions with this status" : "No auctions yet"}
            description={statusFilter ? "Clear the filter to see every auction." : "Auctions renters run appear here."}
          />
        ) : (
          <Table bare minWidth={800} caption="Auctions across every renter">
            <Thead>
              <Tr>
                <Th>Auction</Th>
                <Th>Bidding</Th>
                <Th align="right">Base price</Th>
                <Th>Starts</Th>
                <Th>Ends</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {shown.map((auction) => (
                <Tr key={auction.id}>
                  <Td>
                    <span className="flex flex-col gap-0.5">
                      <span className="whitespace-nowrap font-mono text-xs font-semibold text-ink">
                        AU-{auction.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span className="whitespace-nowrap font-mono text-[11px] text-meta-light">
                        for {requirementRef(auction.requirementId)}
                      </span>
                    </span>
                  </Td>
                  <Td>{DIRECTION[auction.biddingDirection]}</Td>
                  <Td align="right" className="whitespace-nowrap font-mono">
                    {formatMoney(auction.basePrice)}
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-xs">{formatDateTime(auction.startsAt)}</Td>
                  <Td className="whitespace-nowrap font-mono text-xs">{formatDateTime(auction.endsAt)}</Td>
                  <Td>
                    <Status domain="auction" value={auction.status} size="sm" />
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
              onPageChange={(next) => set({ page: next > 1 ? next : null })}
              total={rows.length}
              pageSize={PAGE_SIZE}
              noun="auctions"
            />
          </TableFooter>
        )}
      </Panel>
      <p className="m-0 px-1 text-[11px] leading-[1.5] text-meta-light">
        Status and timing only: bids and who is competing stay hidden here too.
      </p>
    </>
  );
}

// ------------------------------------------------------------------ access

export function AccessSection() {
  return (
    <>
      <Panel title="Staff access" icon="lock">
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm leading-[1.5] text-ink-body">
          <li className="flex items-start gap-2">
            <Icon name="info" size={15} className="mt-0.5 text-sev-info" />
            There&apos;s one staff role: every signed-in staff account can use every section here.
          </li>
          <li className="flex items-start gap-2">
            <Icon name="info" size={15} className="mt-0.5 text-sev-info" />
            Staff accounts are set up by FleetIP directly; they can&apos;t be created or edited on this page.
          </li>
          <li className="flex items-start gap-2">
            <Icon name="info" size={15} className="mt-0.5 text-sev-info" />
            FleetIP doesn&apos;t keep an audit log of staff actions yet.
          </li>
        </ul>
      </Panel>
      <Panel title="Tenant permissions" subtitle="the fixed list organizations build their roles from" icon="organization" padding="none">
        <div className="flex flex-col">
          {PERMISSION_GROUPS.map((group) => (
            <section key={group.key} aria-label={group.label} className="border-b border-border px-4 py-3 last:border-b-0">
              <h3 className="m-0 mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-meta">{group.label}</h3>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {group.codes.map((code) => (
                  <li key={code} className="grid grid-cols-1 gap-0.5 min-[760px]:grid-cols-[minmax(0,1fr)_200px] min-[760px]:gap-4">
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm font-medium text-ink-strong">{PERMISSION_INFO[code].label}</span>
                      <span className="text-[11px] leading-[1.4] text-meta-light">{PERMISSION_INFO[code].description}</span>
                    </span>
                    <span className="flex flex-col text-[11px] leading-[1.4] min-[760px]:items-end">
                      <span className="font-mono text-meta">{code}</span>
                      <span className="text-ink-muted">{appliesTo(code)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Panel>
    </>
  );
}
