"use client";

import type { Product } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
import { OrganizationTypeCode, type Organization } from "@fleetip/contracts/organization";
import { ActualDatesVerificationStatus, RentalStatus, type Rental } from "@fleetip/contracts/rental";
import {
  AllocationBar,
  AttentionStrip,
  Button,
  CellStack,
  EmptyState,
  ErrorState,
  FilterChip,
  Icon,
  Input,
  PageBody,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  Table,
  TableFooter,
  TableSkeleton,
  TableToolbar,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  UILink,
  cx,
  type AllocationSegment,
  type AttentionItem,
  type SortDirection,
} from "@fleetip/ui";
import { useRouter } from "next/navigation";
import { useMemo, useState, type MouseEvent } from "react";
import { ForbiddenPage } from "../../../components/PageStates";
import { apiClient } from "../../../lib/api-client";
import { useConnection } from "../../../lib/connection";
import { OFFLINE_HINT, describeError, errorStatus } from "../../../lib/errors";
import {
  daysBetween,
  formatCompactRange,
  formatMoney,
  formatRateUnit,
  formatShortDate,
  plural,
  rentalRef,
  todayIsoDate,
} from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { Status, statusLabel, statusOptions } from "../../../lib/status";
import { useUrlSearch, useUrlState } from "../../../lib/url-state";
import { optional, useLoad } from "../../../lib/use-load";
import { productName } from "../machines/shared";
import { CreateRentalDialog } from "./CreateRentalDialog";

// ------------------------------------------------------------------ data

interface Access {
  isRenter: boolean;
  /** rental.manage — Create rental (Rental Company). */
  manage: boolean;
  /** equipment.manage — asset code + product for the Rental Company. */
  machines: boolean;
  /** quotation.manage — names of customers that are FleetIP organizations. */
  customers: boolean;
}

interface RentalsData {
  rentals: Rental[];
  machinesById: Map<string, Machine>;
  productsById: Map<string, Product>;
  customerNames: Map<string, string>;
  today: string;
}

/**
 * listRentals serves both organization types (Rental Company: rental.manage;
 * Renter: rental.respond, where the server resolves machineAssetCode and
 * rentalCompanyOrganizationName because a Renter can't look them up).
 * Machine/product identity and customer names are Rental Company enrichment
 * behind their own permissions — optional(), never a page failure.
 */
async function loadRentals(orgId: string, access: Access): Promise<RentalsData> {
  const enrich = !access.isRenter;
  const [rentals, machines, products, renters] = await Promise.all([
    apiClient.listRentals(orgId) as Promise<Rental[]>,
    optional(enrich && access.machines, () => apiClient.listMachines(orgId) as Promise<Machine[]>, [] as Machine[]),
    optional(enrich && access.machines, () => apiClient.listProducts() as Promise<Product[]>, [] as Product[]),
    optional(enrich && access.customers, () => apiClient.listRenterOrganizations(orgId) as Promise<Organization[]>, [] as Organization[]),
  ]);
  return {
    rentals,
    machinesById: new Map(machines.map((m) => [m.id, m])),
    productsById: new Map(products.map((p) => [p.id, p])),
    customerNames: new Map(renters.map((o) => [o.id, o.name])),
    today: todayIsoDate(),
  };
}

// ------------------------------------------------------------------ rows

const ENDING_DAYS = 14;
const RENTAL_STATUSES: RentalStatus[] = [RentalStatus.confirmed, RentalStatus.active, RentalStatus.off_rent, RentalStatus.completed, RentalStatus.cancelled];
const PAGE_SIZES = [10, 20];
const DEFAULT_PAGE_SIZE = 20;

type SortKey = "start" | "end" | "status";
type Flag = "ending" | "late" | "disputed" | "verify";
const FLAGS: Flag[] = ["ending", "late", "disputed", "verify"];
const FLAG_LABEL: Record<Flag, string> = {
  ending: `Ends within ${ENDING_DAYS} days`,
  late: "Past the planned start, still Confirmed",
  disputed: "Actual dates disputed",
  verify: "Dates waiting for your verification",
};

interface Row {
  rental: Rental;
  ref: string;
  machine: Machine | null;
  assetCode: string | null;
  product: Product | null;
  customer: string;
  customerNote: string | null;
  note: { text: string; warn: boolean } | null;
  /** Show the actual-dates chip: only where someone can verify (a FleetIP customer). */
  datesChip: boolean;
  flags: Record<Flag, boolean>;
  search: string;
}

function dateNote(rental: Rental, today: string): Row["note"] {
  if (rental.status === RentalStatus.confirmed) {
    const days = daysBetween(today, rental.startDate);
    if (days > 0) return { text: `starts in ${plural(days, "day")}`, warn: false };
    if (days === 0) return { text: "starts today", warn: false };
    return { text: `was due to start ${formatShortDate(rental.startDate)}`, warn: true };
  }
  if (rental.status === RentalStatus.active) {
    if (!rental.endDate) {
      return {
        text: rental.noticePeriodDays != null ? `no end date · ${rental.noticePeriodDays}-day notice` : "no end date · notice not specified",
        warn: false,
      };
    }
    const days = daysBetween(today, rental.endDate);
    if (days < 0) return { text: `planned end ${formatShortDate(rental.endDate)} has passed`, warn: true };
    if (days === 0) return { text: "ends today", warn: true };
    if (days <= 30) return { text: `ends in ${plural(days, "day")}`, warn: days <= ENDING_DAYS };
    return null;
  }
  if (rental.status === RentalStatus.off_rent) {
    const since = rental.actualEndDate ?? rental.endDate;
    return since ? { text: `off rent since ${formatShortDate(since)}`, warn: false } : null;
  }
  if (rental.status === RentalStatus.completed) {
    const ended = rental.actualEndDate ?? rental.endDate;
    return ended ? { text: `ended ${formatShortDate(ended)}`, warn: false } : null;
  }
  return null;
}

function buildRows(data: RentalsData, access: Access): Row[] {
  const { today } = data;
  return data.rentals.map((rental) => {
    const machine = data.machinesById.get(rental.machineId) ?? null;
    const product = machine ? (data.productsById.get(machine.productId) ?? null) : null;
    const assetCode = machine?.assetCode ?? rental.machineAssetCode ?? null;
    let customer: string;
    let customerNote: string | null = null;
    if (access.isRenter) {
      customer = rental.rentalCompanyOrganizationName ?? "Rental company";
    } else if (rental.clientSnapshot) {
      customer = rental.clientSnapshot.name;
      customerNote = "Not on FleetIP";
    } else if (rental.renterOrganizationId) {
      const name = data.customerNames.get(rental.renterOrganizationId);
      customer = name ?? "FleetIP customer";
      customerNote = name ? null : "Name needs the Quotations permission";
    } else {
      customer = "Customer not recorded";
    }
    const endDays = rental.endDate ? daysBetween(today, rental.endDate) : null;
    const flags: Record<Flag, boolean> = {
      ending: rental.status === RentalStatus.active && endDays !== null && endDays >= 0 && endDays <= ENDING_DAYS,
      late: rental.status === RentalStatus.confirmed && rental.startDate < today,
      disputed: rental.actualDatesVerificationStatus === ActualDatesVerificationStatus.disputed,
      verify: access.isRenter && rental.actualDatesVerificationStatus === ActualDatesVerificationStatus.pending,
    };
    const ref = rentalRef(rental.id);
    return {
      rental,
      ref,
      machine,
      assetCode,
      product,
      customer,
      customerNote,
      note: dateNote(rental, today),
      // A customer outside FleetIP can't verify dates, so "pending" would never clear there.
      datesChip: Boolean(rental.actualDatesVerificationStatus) && (access.isRenter || Boolean(rental.renterOrganizationId)),
      flags,
      search: [ref, rental.id.slice(0, 8), customer, rental.projectName, rental.projectLocation, assetCode, productName(product)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    };
  });
}

const FAR_FUTURE = "9999-12-31";

function compareRows(a: Row, b: Row, key: SortKey): number {
  const byStart = a.rental.startDate.localeCompare(b.rental.startDate);
  if (key === "end") return (a.rental.endDate ?? FAR_FUTURE).localeCompare(b.rental.endDate ?? FAR_FUTURE) || byStart;
  if (key === "status") return RENTAL_STATUSES.indexOf(a.rental.status) - RENTAL_STATUSES.indexOf(b.rental.status) || -byStart;
  return byStart;
}

// ------------------------------------------------------------------ page

export default function RentalsPage() {
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const isRenter = currentMembership?.organization.organizationTypeCode === OrganizationTypeCode.renter;
  const canView = isRenter ? hasPermission("rental.respond") : hasPermission("rental.manage");
  const access: Access = {
    isRenter,
    manage: !isRenter && hasPermission("rental.manage"),
    machines: !isRenter && hasPermission("equipment.manage"),
    customers: !isRenter && hasPermission("quotation.manage"),
  };
  const accessKey = Object.values(access).join(",");

  const { data, error, loading, reload } = useLoad(
    () => loadRentals(organizationId!, access),
    [organizationId, accessKey],
    Boolean(organizationId) && canView,
  );

  if ((currentMembership && !canView) || errorStatus(error) === 403) {
    return (
      <ForbiddenPage
        what="rentals"
        permissionHint={isRenter ? "Viewing your rentals needs the Rentals permission." : "Viewing rentals needs the Rentals permission."}
      />
    );
  }

  return (
    <RentalsList organizationId={organizationId ?? null} access={access} data={loading ? null : data} error={error} reload={reload} />
  );
}

function RentalsList({
  organizationId,
  access,
  data,
  error,
  reload,
}: {
  organizationId: string | null;
  access: Access;
  data: RentalsData | null;
  error: unknown;
  reload: () => Promise<void>;
}) {
  const router = useRouter();
  const { online } = useConnection();
  const { get, set } = useUrlState("rentals");
  const search = useUrlSearch("q", get, set);
  const [createOpen, setCreateOpen] = useState(false);
  const today = data?.today ?? todayIsoDate();

  // ---- URL state (read every render; unknown values are ignored)
  const urlQ = get("q").trim().toLowerCase();
  const q = urlQ.length >= 2 ? urlQ : "";
  const statusParam = get("status");
  const status = (RENTAL_STATUSES as string[]).includes(statusParam) ? (statusParam as RentalStatus) : null;
  // Machine detail links "All rentals" here as /rentals?machine=<machineId>.
  const machineFilter = /^[0-9a-f-]{36}$/i.test(get("machine")) ? get("machine") : "";
  const flagParam = get("flag");
  const flag = (FLAGS as string[]).includes(flagParam) ? (flagParam as Flag) : null;
  const sortParam = get("sort");
  const sort: SortKey = sortParam === "end" || sortParam === "status" ? sortParam : "start";
  const dirParam = get("dir");
  const dir: "asc" | "desc" = dirParam === "asc" || dirParam === "desc" ? dirParam : sort === "start" ? "desc" : "asc";
  const size = PAGE_SIZES.includes(Number(get("size"))) ? Number(get("size")) : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Math.floor(Number(get("page", "1"))) || 1);

  const rows = useMemo(() => (data ? buildRows(data, access) : []), [data, access.isRenter]);

  const filtered = useMemo(() => {
    const out = rows.filter((row) => {
      if (q && !row.search.includes(q)) return false;
      if (status && row.rental.status !== status) return false;
      if (machineFilter && row.rental.machineId !== machineFilter) return false;
      if (flag && !row.flags[flag]) return false;
      return true;
    });
    out.sort((a, b) => compareRows(a, b, sort) * (dir === "desc" ? -1 : 1));
    return out;
  }, [rows, q, status, machineFilter, flag, sort, dir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / size));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * size, currentPage * size);

  const machineLabel = machineFilter
    ? (data?.machinesById.get(machineFilter)?.assetCode ??
      rows.find((r) => r.rental.machineId === machineFilter)?.assetCode ??
      "this machine")
    : null;
  const filterParts = [
    status ? statusLabel("rental", status) : null,
    machineLabel,
    flag ? FLAG_LABEL[flag] : null,
    q ? `“${urlQ}”` : null,
  ].filter((part): part is string => Boolean(part));
  const hasFilters = Boolean(urlQ || status || machineFilter || flag);

  function clearFilters() {
    search.setValue("");
    set({ q: null, status: null, machine: null, flag: null });
  }

  function applyOnly(updates: Record<string, string | null>) {
    search.setValue("");
    set({ q: null, status: null, machine: null, flag: null, ...updates });
  }

  function toggleSort(key: SortKey) {
    const defaultDir = key === "start" ? "desc" : "asc";
    const nextDir = sort === key ? (dir === "asc" ? "desc" : "asc") : defaultDir;
    set({ sort: key === "start" ? null : key, dir: nextDir === defaultDir ? null : nextDir });
  }

  /** Row click opens the rental; Ctrl/⌘/middle click opens a new tab. Links and buttons keep their own clicks. */
  function openRow(event: MouseEvent<HTMLElement>, href: string) {
    const target = event.target as HTMLElement;
    if (target.closest("a, button, input, select, textarea, label")) return;
    if (window.getSelection()?.toString()) return;
    if (event.metaKey || event.ctrlKey || event.button === 1) {
      window.open(href, "_blank", "noopener");
      return;
    }
    router.push(href);
  }

  const createButton = access.manage ? (
    <Button
      icon="plus"
      onClick={() => setCreateOpen(true)}
      disabled={!online || !organizationId}
      title={!online ? OFFLINE_HINT : undefined}
    >
      Create rental
    </Button>
  ) : undefined;

  const header = (
    <PageHeader
      title="Rentals"
      description={
        access.isRenter
          ? "Machines rented to you: dates, status and what each rental costs."
          : "Every booking of your machines: who has it, for which dates, at what rate."
      }
      actions={createButton}
    />
  );

  const dialog = access.manage && organizationId && (
    <CreateRentalDialog
      open={createOpen}
      onClose={() => setCreateOpen(false)}
      organizationId={organizationId}
      initialMachineId={machineFilter || undefined}
      onCreated={() => void reload()}
    />
  );

  if (error) {
    return (
      <div className="flex min-w-0 flex-col">
        {header}
        <PageBody>
          <ErrorState
            title="Rentals didn't load"
            message={describeError(error).body}
            action={
              <Button variant="secondary" size="sm" icon="refresh" onClick={() => void reload()}>
                Try again
              </Button>
            }
          />
        </PageBody>
      </div>
    );
  }

  if (data && data.rentals.length === 0) {
    return (
      <div className="flex min-w-0 flex-col">
        {header}
        <PageBody>
          <section aria-label="Rentals" className="rounded-panel border border-border-strong bg-surface">
            <EmptyState
              variant="page"
              icon="rental"
              title={access.isRenter ? "No rentals yet" : "No rentals yet — create your first"}
              description={
                access.isRenter
                  ? "Rentals appear here once a rental company books a machine for you, usually after you award a quotation."
                  : "Book a machine directly for a customer, or award a quotation and FleetIP creates the rental for you."
              }
              action={createButton}
            />
          </section>
        </PageBody>
        {dialog}
      </div>
    );
  }

  const tableLoading = !data;

  return (
    <div className="flex min-w-0 flex-col">
      {header}
      <PageBody>
        {data ? (
          <AllocationBar
            total={{ count: rows.length, label: "All rentals", sub: "Every status" }}
            segments={allocationSegments(rows, today)}
            active={status}
            onSelect={(key) => set({ status: key })}
          />
        ) : (
          <div aria-hidden="true" className="flex h-[92px] gap-px overflow-hidden rounded-panel border border-border-soft bg-surface">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex flex-1 flex-col gap-2.5 px-4 py-3.5">
                <Skeleton className="h-6 w-12" />
                <Skeleton className="h-2.5 w-3/5" />
              </div>
            ))}
          </div>
        )}

        {data && <AttentionStrip items={attentionItems(rows, access, applyOnly)} />}

        <section aria-label="Rentals" className="min-w-0 rounded-panel border border-border-strong bg-surface">
          <TableToolbar className="rounded-t-[5px]">
            <Input
              type="search"
              size="sm"
              aria-label="Search rentals"
              placeholder={access.isRenter ? "RN reference, rental company, project, asset code" : "RN reference, customer, project, asset code"}
              enterKeyHint="search"
              className="w-[320px] max-[759px]:w-full"
              prefix={<Icon name="search" size={13} />}
              suffix={search.pending && search.value.trim().length >= 2 ? "Searching…" : undefined}
              value={search.value}
              onChange={(e) => search.setValue(e.target.value)}
            />
            {urlQ.length === 1 && <span className="text-[11px] text-meta-light">Type at least 2 characters to search.</span>}
            <Select
              size="sm"
              aria-label="Rental status"
              placeholder="Any status"
              options={statusOptions("rental")}
              value={status ?? ""}
              onChange={(e) => set({ status: e.target.value || null })}
              className="w-40"
            />
            {machineLabel && <FilterChip label={`Machine: ${machineLabel}`} mono onRemove={() => set({ machine: null })} />}
            {flag && <FilterChip label={FLAG_LABEL[flag]} onRemove={() => set({ flag: null })} />}
            {hasFilters && (
              <Button variant="tertiary" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </TableToolbar>

          {!tableLoading && filtered.length === 0 ? (
            <EmptyState
              title={`No rentals match ${filterParts.join(" · ") || "these filters"}.`}
              description={
                machineFilter && !status && !flag && !q
                  ? `${machineLabel === "this machine" ? "This machine" : machineLabel} has no rentals yet.`
                  : "Change or clear the filters to see more rentals."
              }
              action={
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <>
              <div className="max-[759px]:hidden">
                <Table bare minWidth={1060} caption="Rentals" aria-busy={tableLoading || undefined}>
                  <Thead>
                    <Tr>
                      <Th className="w-[120px]">Rental</Th>
                      <Th className="min-w-[190px]">Machine</Th>
                      <Th className="min-w-[190px]">{access.isRenter ? "Rental company" : "Customer"}</Th>
                      <Th className="min-w-[170px]">Project</Th>
                      <Th
                        className="w-[210px]"
                        aria-sort={sort === "start" || sort === "end" ? (dir === "asc" ? "ascending" : "descending") : "none"}
                      >
                        <span className="inline-flex items-center gap-2">
                          <SortButton label="Start" direction={sort === "start" ? dir : null} onClick={() => toggleSort("start")} />
                          <span aria-hidden="true" className="text-separator-text">
                            ·
                          </span>
                          <SortButton label="End" direction={sort === "end" ? dir : null} onClick={() => toggleSort("end")} />
                        </span>
                      </Th>
                      <Th className="w-[170px]" onSort={() => toggleSort("status")} sortDirection={sort === "status" ? dir : null}>
                        Status
                      </Th>
                      <Th align="right" className="w-[130px]">
                        Rate
                      </Th>
                    </Tr>
                  </Thead>
                  {tableLoading ? (
                    <TableSkeleton columns={7} rows={8} label="Loading rentals" />
                  ) : (
                    <Tbody>
                      {pageRows.map((row) => {
                        const href = `/rentals/${row.rental.id}`;
                        return (
                          <Tr
                            key={row.rental.id}
                            interactive
                            className="cursor-pointer"
                            onClick={(e) => openRow(e, href)}
                            onAuxClick={(e) => {
                              if (e.button === 1) openRow(e, href);
                            }}
                          >
                            <Td>
                              <UILink
                                href={href}
                                className="whitespace-nowrap font-mono text-xs font-semibold text-accent-text no-underline hover:text-accent-text-hover hover:underline"
                              >
                                {row.ref}
                              </UILink>
                            </Td>
                            <Td>
                              <MachineCell row={row} canOpen={access.machines} />
                            </Td>
                            <Td>
                              <CellStack title={row.customer} sub={row.customerNote ?? undefined} />
                            </Td>
                            <Td>
                              <ProjectCell rental={row.rental} />
                            </Td>
                            <Td>
                              <DatesCell row={row} />
                            </Td>
                            <Td>
                              <StatusCell row={row} />
                            </Td>
                            <Td align="right">
                              <RateCell rental={row.rental} />
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  )}
                </Table>
              </div>

              {/* Below 760px the table becomes stacked cards with the same information. */}
              {tableLoading ? (
                <div aria-busy="true" aria-label="Loading rentals" className="flex flex-col gap-3 px-3.5 py-3.5 min-[760px]:hidden">
                  {Array.from({ length: 4 }, (_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <ul className="m-0 list-none p-0 min-[760px]:hidden">
                  {pageRows.map((row) => (
                    <li key={row.rental.id} className="flex flex-col gap-2 border-b border-border px-3.5 py-3 last:border-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <UILink
                          href={`/rentals/${row.rental.id}`}
                          className="font-mono text-[13px] font-semibold text-accent-text no-underline hover:underline"
                        >
                          {row.ref}
                        </UILink>
                        <StatusCell row={row} />
                        <span className="ml-auto">
                          <RateCell rental={row.rental} />
                        </span>
                      </div>
                      <MachineCell row={row} canOpen={access.machines} />
                      <CellStack title={row.customer} sub={row.customerNote ?? undefined} />
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <ProjectCell rental={row.rental} />
                        <DatesCell row={row} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <TableFooter className="rounded-b-[5px]">
            {!access.isRenter && (
              <span className="mr-auto text-[11px] leading-tight text-meta">
                Off rent means the machine has stopped earning but the rental isn&apos;t closed — its dates stay booked until it&apos;s completed.
              </span>
            )}
            <span className="flex items-center gap-1.5 text-xs text-meta">
              <span aria-hidden="true">Per page</span>
              <Select
                size="sm"
                aria-label="Rentals per page"
                options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
                value={String(size)}
                onChange={(e) => set({ size: Number(e.target.value) === DEFAULT_PAGE_SIZE ? null : e.target.value })}
                className="w-[68px]"
              />
            </span>
            <Pagination
              page={currentPage}
              pageCount={pageCount}
              onPageChange={(p) => set({ page: p === 1 ? null : p })}
              total={tableLoading ? undefined : filtered.length}
              pageSize={size}
              noun="rentals"
            />
          </TableFooter>
        </section>
      </PageBody>
      {dialog}
    </div>
  );
}

// ------------------------------------------------------------------ summary + attention

function allocationSegments(rows: Row[], today: string): AllocationSegment[] {
  const total = rows.length || 1;
  const byStatus = (s: RentalStatus) => rows.filter((r) => r.rental.status === s);
  const segment = (key: RentalStatus, list: Row[], tone: AllocationSegment["tone"], sub?: string): AllocationSegment => ({
    key,
    count: list.length,
    pct: `${Math.round((list.length / total) * 100)}%`,
    grow: list.length || 1,
    label: statusLabel("rental", key),
    tone,
    sub,
  });
  const confirmed = byStatus(RentalStatus.confirmed);
  const late = confirmed.filter((r) => r.flags.late).length;
  const nextStart = confirmed
    .map((r) => r.rental.startDate)
    .filter((d) => d >= today)
    .sort()[0];
  const active = byStatus(RentalStatus.active);
  const ending = active.filter((r) => r.flags.ending).length;
  const openEnded = active.filter((r) => r.rental.endDate === null).length;
  const offRent = byStatus(RentalStatus.off_rent);
  const oldestOffRent = offRent
    .map((r) => r.rental.actualEndDate ?? r.rental.endDate)
    .filter((d): d is string => Boolean(d))
    .sort()[0];
  const completed = byStatus(RentalStatus.completed);
  const lastEnded = completed
    .map((r) => r.rental.actualEndDate ?? r.rental.endDate)
    .filter((d): d is string => Boolean(d))
    .sort()
    .pop();
  const cancelled = byStatus(RentalStatus.cancelled);
  return [
    segment(
      "confirmed",
      confirmed,
      "on-rent",
      late ? `${late} past the planned start` : nextStart ? `Next starts ${formatShortDate(nextStart)}` : undefined,
    ),
    segment(
      "active",
      active,
      "on-rent",
      ending ? `${ending} end within ${ENDING_DAYS} days` : openEnded ? `${openEnded} with no end date` : undefined,
    ),
    segment("off_rent", offRent, "attention", oldestOffRent ? `Off rent since ${formatShortDate(oldestOffRent)} at the earliest` : undefined),
    segment("completed", completed, "neutral", lastEnded ? `Last one ended ${formatShortDate(lastEnded)}` : undefined),
    segment("cancelled", cancelled, "out-of-service", cancelled.length ? "Kept on record; dates freed" : undefined),
  ];
}

function attentionItems(rows: Row[], access: Access, applyOnly: (updates: Record<string, string | null>) => void): AttentionItem[] {
  const count = (flag: Flag) => rows.filter((r) => r.flags[flag]).length;
  if (access.isRenter) {
    const verify = count("verify");
    return [
      {
        key: "verify",
        count: verify,
        text: `${verify === 1 ? "rental has" : "rentals have"} dates waiting for your verification`,
        onClick: () => applyOnly({ flag: "verify" }),
      },
    ];
  }
  const late = count("late");
  const ending = count("ending");
  const disputed = count("disputed");
  const offRent = rows.filter((r) => r.rental.status === RentalStatus.off_rent).length;
  return [
    {
      key: "disputed",
      count: disputed,
      text: `${disputed === 1 ? "customer disputed" : "customers disputed"} the actual dates`,
      onClick: () => applyOnly({ flag: "disputed" }),
    },
    {
      key: "late",
      count: late,
      text: `confirmed ${late === 1 ? "rental is" : "rentals are"} past the planned start`,
      onClick: () => applyOnly({ flag: "late" }),
    },
    {
      key: "ending",
      count: ending,
      text: `active ${ending === 1 ? "rental ends" : "rentals end"} within ${ENDING_DAYS} days`,
      onClick: () => applyOnly({ flag: "ending" }),
    },
    {
      key: "off-rent",
      count: offRent,
      text: `off rent, not completed yet`,
      onClick: () => applyOnly({ status: "off_rent" }),
    },
  ];
}

// ------------------------------------------------------------------ cells

function MachineCell({ row, canOpen }: { row: Row; canOpen: boolean }) {
  const code = row.assetCode ?? "Machine not visible";
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {canOpen && row.machine ? (
        <UILink
          href={`/machines/${row.machine.id}`}
          className="self-start whitespace-nowrap font-mono text-xs font-semibold text-ink no-underline hover:text-accent-text hover:underline"
        >
          {code}
        </UILink>
      ) : (
        <span className={cx("whitespace-nowrap font-mono text-xs font-semibold", row.assetCode ? "text-ink" : "text-disabled-text")}>{code}</span>
      )}
      {row.product && (
        <span title={productName(row.product) ?? undefined} className="clamp-2 text-[11px] leading-tight text-meta-light">
          {productName(row.product)}
        </span>
      )}
    </div>
  );
}

function ProjectCell({ rental }: { rental: Rental }) {
  if (!rental.projectName && !rental.projectLocation) {
    return <span className="text-xs italic text-disabled-text">Not specified</span>;
  }
  return <CellStack title={rental.projectName ?? "Project not named"} sub={rental.projectLocation ?? undefined} />;
}

function DatesCell({ row }: { row: Row }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="whitespace-nowrap font-mono text-xs text-ink-strong">{formatCompactRange(row.rental.startDate, row.rental.endDate)}</span>
      {row.note && <span className={cx("text-[11px] leading-tight", row.note.warn ? "text-attention" : "text-meta-light")}>{row.note.text}</span>}
    </div>
  );
}

function StatusCell({ row }: { row: Row }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Status domain="rental" value={row.rental.status} size="sm" />
      {row.datesChip &&
        row.rental.actualDatesVerificationStatus &&
        row.rental.actualDatesVerificationStatus !== ActualDatesVerificationStatus.verified && (
          <Status domain="actual_dates" value={row.rental.actualDatesVerificationStatus} size="sm" />
        )}
    </span>
  );
}

function RateCell({ rental }: { rental: Rental }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="font-mono text-[13px] font-semibold leading-tight text-ink">{formatMoney(rental.rate)}</span>
      <span className="text-[11px] leading-tight text-meta-light">{formatRateUnit(rental.rateUnit)}</span>
    </div>
  );
}

function SortButton({ label, direction, onClick }: { label: string; direction: SortDirection; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Sort by ${label.toLowerCase()} date${direction ? `, ${direction === "asc" ? "ascending" : "descending"}` : ""}`}
      className={cx(
        "inline-flex items-center gap-1 border-0 bg-transparent p-0 text-[10px] font-semibold uppercase tracking-[0.1em] hover:text-ink",
        direction ? "text-ink" : "text-meta",
      )}
    >
      {label}
      <Icon
        name="chevron_down"
        size={11}
        className={cx("transition-transform", direction === "asc" && "rotate-180", !direction && "opacity-35")}
      />
    </button>
  );
}
