"use client";

import type { Machine } from "@fleetip/contracts/equipment";
import type { Logsheet } from "@fleetip/contracts/logsheet";
import { OrganizationTypeCode, type Organization } from "@fleetip/contracts/organization";
import { RentalStatus, type Rental } from "@fleetip/contracts/rental";
import {
  Alert,
  AttentionStrip,
  Button,
  CellStack,
  EmptyState,
  ErrorState,
  Input,
  KeyFigures,
  KeyFiguresSkeleton,
  PageBody,
  PageHeader,
  Pagination,
  Select,
  Table,
  TableSkeleton,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  UILink,
  cx,
  type AttentionItem,
  type KeyFigure,
} from "@fleetip/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { ForbiddenPage } from "../../../components/PageStates";
import { apiClient } from "../../../lib/api-client";
import { useConnection } from "../../../lib/connection";
import { OFFLINE_HINT, describeError, errorStatus } from "../../../lib/errors";
import {
  addDays,
  daysBetween,
  formatDate,
  formatHours,
  formatNumber,
  formatShortDate,
  plural,
  rentalRef,
  todayIsoDate,
} from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { Status, statusLabel } from "../../../lib/status";
import { optional, useLoad } from "../../../lib/use-load";
import {
  DrillDownBar,
  ListCard,
  ListSearch,
  NoMatches,
  PAGE_SIZE,
  PickRecordDialog,
  RefCell,
  compareNumber,
  compareText,
  matches,
  paginate,
  quoted,
  sortRows,
  useListView,
} from "../maintenance/list-kit";
import { LogsheetDrawer } from "../rentals/LogsheetDrawer";
import { LogsheetPanel } from "../rentals/panels";
import { confirmation, fuelText, missingDays } from "./shared";

interface LogsheetData {
  logsheets: Logsheet[];
  /** null when the role can't view rentals. */
  rentals: Rental[] | null;
  /** null when the role can't view machines. */
  machines: Map<string, Machine> | null;
  customerNames: Map<string, string>;
}

async function loadLogsheets(
  orgId: string,
  access: { rentals: boolean; machines: boolean; customers: boolean },
): Promise<LogsheetData> {
  // Rentals, machines and customer names are enrichment for the table, not
  // the point of this page (logsheet.manage is) — a custom role without them
  // still gets a working list.
  const [logsheets, rentals, machines, renters] = await Promise.all([
    apiClient.listLogsheets(orgId) as Promise<Logsheet[]>,
    optional(access.rentals, () => apiClient.listRentals(orgId) as Promise<Rental[]>, null as Rental[] | null),
    optional(access.machines, () => apiClient.listMachines(orgId) as Promise<Machine[]>, null as Machine[] | null),
    optional(access.customers, () => apiClient.listRenterOrganizations(orgId) as Promise<Organization[]>, [] as Organization[]),
  ]);
  return {
    logsheets,
    rentals,
    machines: machines ? new Map(machines.map((m) => [m.id, m])) : null,
    customerNames: new Map(renters.map((o) => [o.id, o.name])),
  };
}

type SortKey = "date" | "operating" | "machine" | "rental";
const SORTS: Record<SortKey, "asc" | "desc"> = { date: "desc", operating: "desc", machine: "asc", rental: "asc" };
const COLUMNS = 9;
const STALE_DAYS = 7;
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function weekday(iso: string): string {
  return WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()] ?? "";
}

function customerOf(rental: Rental | undefined, names: Map<string, string>): string | null {
  if (!rental) return null;
  if (rental.clientSnapshot) return rental.clientSnapshot.name;
  if (rental.renterOrganizationId) return names.get(rental.renterOrganizationId) ?? "FleetIP customer";
  return null;
}

export default function LogsheetsPage() {
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  // The org-wide list is the Rental Company's (logsheet.manage). Renters
  // read a single logsheet at /logsheets/<id> (logsheet.respond).
  const canView = hasPermission("logsheet.manage");
  // Rentals here are enrichment for the table/drill-down — gated by the
  // rental permission of the caller's own organization type.
  const canListRentals =
    organizationType === OrganizationTypeCode.renter ? hasPermission("rental.respond") : hasPermission("rental.manage");
  const access = { rentals: canListRentals, machines: hasPermission("equipment.manage"), customers: hasPermission("quotation.manage") };
  const { online } = useConnection();
  const today = todayIsoDate();

  const { data, error, reload } = useLoad(
    () => loadLogsheets(organizationId!, access),
    [organizationId, access.rentals, access.machines, access.customers],
    Boolean(organizationId) && canView,
  );
  const view = useListView<SortKey>("logsheets", SORTS, "date");
  const { get, set } = view;
  const [picking, setPicking] = useState(false);
  const [drawer, setDrawer] = useState<{ rental: Rental; date: string } | null>(null);

  const machineParam = get("machine");
  const rentalParam = get("rental");
  const confirmationParam = get("confirmation");
  const fromParam = get("from");
  const toParam = get("to");
  const rangeInvalid = Boolean(fromParam && toParam && toParam < fromParam);

  const rentalsById = useMemo(() => new Map((data?.rentals ?? []).map((r) => [r.id, r])), [data?.rentals]);
  const drillRental = rentalParam ? rentalsById.get(rentalParam) : undefined;
  // Machine detail links "All logsheets for RN-…" here; an Active rental gets
  // its logsheet panel (every expected day, gaps, submit/correct).
  const drillActive = drillRental && drillRental.status === RentalStatus.active ? drillRental : null;

  // LogsheetPanel keeps its own copy; refresh the list when leaving the drill-down.
  const previousRental = useRef(rentalParam);
  useEffect(() => {
    if (previousRental.current && !rentalParam) void reload();
    previousRental.current = rentalParam;
  }, [rentalParam, reload]);

  const logsheets = useMemo(() => data?.logsheets ?? [], [data?.logsheets]);
  const names = data?.customerNames ?? new Map<string, string>();

  // Scope = the machine/rental the list is narrowed to (figures follow it).
  const scope = useMemo(
    () => logsheets.filter((s) => (!machineParam || s.machineId === machineParam) && (!rentalParam || s.rentalId === rentalParam)),
    [logsheets, machineParam, rentalParam],
  );

  const filtered = useMemo(() => {
    return scope.filter((sheet) => {
      if (confirmationParam === "confirmed" && !sheet.customerConfirmed) return false;
      if (confirmationParam === "unconfirmed" && sheet.customerConfirmed) return false;
      if (fromParam && sheet.logDate < fromParam) return false;
      if (toParam && !rangeInvalid && sheet.logDate > toParam) return false;
      if (view.query) {
        const rental = rentalsById.get(sheet.rentalId);
        const machine = data?.machines?.get(sheet.machineId);
        if (
          !matches(view.query, [
            rentalRef(sheet.rentalId),
            machine?.assetCode,
            rental?.machineAssetCode,
            customerOf(rental, names),
            rental?.projectName,
            sheet.operatorName,
            sheet.shift,
            sheet.remarks,
            formatDate(sheet.logDate),
          ])
        ) {
          return false;
        }
      }
      return true;
    });
  }, [scope, confirmationParam, fromParam, toParam, rangeInvalid, view.query, rentalsById, data?.machines, names]);

  const sorted = useMemo(() => {
    const assetOf = (s: Logsheet) => data?.machines?.get(s.machineId)?.assetCode ?? rentalsById.get(s.rentalId)?.machineAssetCode;
    const compare =
      view.sortKey === "operating"
        ? (a: Logsheet, b: Logsheet) => compareNumber(a.operatingHours, b.operatingHours)
        : view.sortKey === "machine"
          ? (a: Logsheet, b: Logsheet) => compareText(assetOf(a), assetOf(b)) || b.logDate.localeCompare(a.logDate)
          : view.sortKey === "rental"
            ? (a: Logsheet, b: Logsheet) => compareText(rentalRef(a.rentalId), rentalRef(b.rentalId)) || b.logDate.localeCompare(a.logDate)
            : (a: Logsheet, b: Logsheet) => a.logDate.localeCompare(b.logDate) || a.createdAt.localeCompare(b.createdAt);
    const missing =
      view.sortKey === "operating"
        ? (s: Logsheet) => s.operatingHours == null
        : view.sortKey === "machine"
          ? (s: Logsheet) => !assetOf(s)
          : undefined;
    return sortRows(filtered, compare, view.sortDir, missing);
  }, [filtered, view.sortKey, view.sortDir, data?.machines, rentalsById]);
  const page = paginate(sorted, view.page);

  if (currentMembership && !canView) {
    return (
      <ForbiddenPage
        what="logsheets"
        permissionHint="The logsheet list needs the Logsheets permission. Customers see the logsheets on their own rentals."
      />
    );
  }
  if (error && errorStatus(error) === 403) {
    return <ForbiddenPage what="logsheets" permissionHint="The logsheet list needs the Logsheets permission." />;
  }

  const rentalsKnown = data?.rentals != null;
  const machinesKnown = data?.machines != null;
  const assetFor = (sheet: Logsheet) => data?.machines?.get(sheet.machineId)?.assetCode ?? rentalsById.get(sheet.rentalId)?.machineAssetCode ?? null;

  // ------------------------------------------------------------ figures (scope)
  const staleUnconfirmed = scope.filter((s) => !s.customerConfirmed && daysBetween(s.logDate, today) > STALE_DAYS);
  const unconfirmed = scope.filter((s) => !s.customerConfirmed);
  const activeInScope = (data?.rentals ?? []).filter(
    (r) => r.status === RentalStatus.active && (!machineParam || r.machineId === machineParam) && (!rentalParam || r.id === rentalParam),
  );
  const gaps = activeInScope
    .map((rental) => ({ rental, days: missingDays(rental, logsheets, today) }))
    .filter((g) => g.days.length > 0)
    .sort((a, b) => b.days.length - a.days.length);
  const missingTotal = gaps.reduce((sum, g) => sum + g.days.length, 0);
  const worst = gaps[0];
  const monthAgo = addDays(today, -30);
  const recent = scope.filter((s) => s.logDate >= monthAgo);
  const sum = (key: "operatingHours" | "idleHours" | "overtimeHours") => recent.reduce((total, s) => total + (s[key] ?? 0), 0);
  const latest = [...scope].sort((a, b) => b.logDate.localeCompare(a.logDate))[0];

  const figures: KeyFigure[] = [
    {
      key: "count",
      label: "Logsheets",
      value: formatNumber(scope.length, 0),
      unit: scope.length === 1 ? "day logged" : "days logged",
      context: scope.length
        ? `${plural(new Set(scope.map((s) => s.rentalId)).size, "rental")} · latest ${formatShortDate(latest?.logDate)}`
        : "Nothing logged yet",
    },
    {
      key: "unconfirmed",
      label: "Not confirmed by the customer",
      value: formatNumber(unconfirmed.length, 0),
      unit: unconfirmed.length === 1 ? "logsheet" : "logsheets",
      context: staleUnconfirmed.length ? `${staleUnconfirmed.length} older than ${STALE_DAYS} days` : "None older than a week",
      tone: staleUnconfirmed.length ? "warning" : "default",
    },
    rentalsKnown
      ? {
          key: "missing",
          label: "Missing days",
          value: formatNumber(missingTotal, 0),
          unit: missingTotal === 1 ? "day" : "days",
          context: missingTotal
            ? `On ${plural(gaps.length, "active rental")} · today excluded`
            : activeInScope.length
              ? "Every active rental is logged up to yesterday"
              : "No rental is active",
          tone: missingTotal ? "warning" : "default",
        }
      : { key: "missing", label: "Missing days", value: "—", context: "Needs the Rentals permission", tone: "muted" },
    {
      key: "hours",
      label: "Operating · last 30 days",
      value: formatNumber(sum("operatingHours")),
      unit: "h",
      context: `Idle ${formatNumber(sum("idleHours"))} h · overtime ${formatNumber(sum("overtimeHours"))} h`,
    },
  ];

  const attention: AttentionItem[] = [
    {
      key: "stale",
      count: staleUnconfirmed.length,
      text: `${staleUnconfirmed.length === 1 ? "logsheet" : "logsheets"} not confirmed by the customer for more than ${STALE_DAYS} days`,
      onClick: () => set({ confirmation: "unconfirmed", from: null, to: addDays(today, -(STALE_DAYS + 1)) }),
    },
    ...(worst
      ? [
          {
            key: "missing",
            count: missingTotal,
            text:
              gaps.length === 1
                ? `${missingTotal === 1 ? "day" : "days"} with no logsheet on ${rentalRef(worst.rental.id)} — open it to fill the gaps`
                : `${missingTotal === 1 ? "day" : "days"} with no logsheet on ${gaps.length} active rentals — most on ${rentalRef(worst.rental.id)}`,
            onClick: () => set({ rental: worst.rental.id }),
          },
        ]
      : []),
  ];

  // Submit logsheet → pick an Active rental → the logsheet drawer.
  const activeRentals = (data?.rentals ?? []).filter((r) => r.status === RentalStatus.active).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const submitReason = !online
    ? OFFLINE_HINT
    : data && !rentalsKnown
      ? "Picking a rental needs the Rentals permission."
      : data && activeRentals.length === 0
        ? "No rental is Active, so there's nothing to log. Logsheets need the machine on site."
        : undefined;
  const primary = drillActive ? null : (
    <Button icon="logsheet" onClick={() => setPicking(true)} disabled={!data || Boolean(submitReason)} title={submitReason}>
      Submit logsheet
    </Button>
  );

  function openDrawer(rental: Rental, date?: string) {
    const gapsFor = missingDays(rental, logsheets, today);
    setDrawer({ rental, date: date ?? gapsFor[0] ?? today });
  }

  const filtersActive = Boolean(machineParam || rentalParam || confirmationParam || fromParam || toParam || view.queryLabel);
  const clearFilters = () => set({ machine: null, rental: null, confirmation: null, from: null, to: null, q: null });
  const filterParts = [
    machineParam ? (data?.machines?.get(machineParam)?.assetCode ?? "one machine") : null,
    rentalParam ? rentalRef(rentalParam) : null,
    confirmationParam ? statusLabel("logsheet", confirmationParam) : null,
    fromParam || toParam
      ? fromParam && toParam && !rangeInvalid
        ? `${formatShortDate(fromParam)} to ${formatShortDate(toParam)}`
        : fromParam
          ? `from ${formatShortDate(fromParam)}`
          : `up to ${formatShortDate(toParam)}`
      : null,
    view.queryLabel ? quoted(view.queryLabel) : null,
  ].filter((p): p is string => Boolean(p));

  const machineOptions = machinesKnown
    ? [...new Set([...logsheets.map((s) => s.machineId), ...activeRentals.map((r) => r.machineId)])]
        .map((id) => data?.machines?.get(id))
        .filter((m): m is Machine => Boolean(m))
        .sort((a, b) => compareText(a.assetCode, b.assetCode))
        .map((m) => ({ value: m.id, label: m.assetCode }))
    : [];
  const rentalIdsWithSheets = new Set(logsheets.map((s) => s.rentalId));
  const rentalOptions = rentalsKnown
    ? (data?.rentals ?? [])
        .filter((r) => rentalIdsWithSheets.has(r.id) || r.status === RentalStatus.active)
        .sort((a, b) => (a.status === RentalStatus.active ? 0 : 1) - (b.status === RentalStatus.active ? 0 : 1) || b.startDate.localeCompare(a.startDate))
        .map((r) => ({
          value: r.id,
          label: `${rentalRef(r.id)} · ${data?.machines?.get(r.machineId)?.assetCode ?? r.machineAssetCode ?? "machine"}${r.status === RentalStatus.active ? "" : ` · ${statusLabel("rental", r.status)}`}`,
        }))
    : [...rentalIdsWithSheets].map((id) => ({ value: id, label: rentalRef(id) }));

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title="Logsheets"
        description="Daily hours logged against every rental — one logsheet per rental per day, corrected by resubmitting."
        actions={primary}
      />
      <PageBody>
        {drillActive && organizationId ? (
          <>
            <DrillDownBar icon="rental" exitLabel="All logsheets" onExit={() => set({ rental: null })}>
              <span className="flex flex-wrap items-center gap-2">
                <UILink href={`/rentals/${drillActive.id}`} className="font-mono text-sm font-semibold text-ink no-underline hover:underline">
                  {rentalRef(drillActive.id)}
                </UILink>
                <Status domain="rental" value={drillActive.status} size="sm" />
              </span>
              <span className="text-xs text-meta">
                {[customerOf(drillActive, names), data?.machines?.get(drillActive.machineId)?.assetCode ?? drillActive.machineAssetCode, drillActive.projectName]
                  .filter(Boolean)
                  .join(" · ")}
                {" · "}Every day since it started, gaps included.
              </span>
            </DrillDownBar>
            <LogsheetPanel organizationId={organizationId} rental={drillActive} />
          </>
        ) : (
          <>
            {rentalParam && data && !drillRental && (
              <Alert tone="info">
                {rentalsKnown
                  ? `${rentalRef(rentalParam)} isn't one of your rentals, or the link is wrong. Showing any logsheets recorded against it.`
                  : `Showing ${rentalRef(rentalParam)}'s logsheets. Submitting or correcting them here needs the Rentals permission.`}
              </Alert>
            )}
            {drillRental && drillRental.status !== RentalStatus.active && (
              <Alert tone="neutral" icon="lock">
                {rentalRef(drillRental.id)} is {statusLabel("rental", drillRental.status)}, so its logsheets can&apos;t be submitted or corrected
                {drillRental.status === RentalStatus.confirmed ? " until it starts" : " any more"}. Showing what was logged.
              </Alert>
            )}

            {data && <AttentionStrip items={attention} />}
            {data ? <KeyFigures items={figures} label="Logsheet figures" /> : !error && <KeyFiguresSkeleton count={4} />}

            {error ? (
              <ErrorState
                title="Logsheets didn't load"
                message={describeError(error).body}
                action={
                  <Button variant="secondary" size="sm" onClick={() => void reload()}>
                    Try again
                  </Button>
                }
              />
            ) : data && logsheets.length === 0 && !filtersActive ? (
              <section className="rounded-panel border border-border-strong bg-surface">
                <EmptyState
                  variant="page"
                  icon="logsheet"
                  title="No logsheets yet"
                  description="Logsheets record each day's operating, idle and overtime hours on a rental. They start once a rental is Active — the machine is on site."
                  action={primary}
                />
              </section>
            ) : (
              <ListCard
                label="Logsheets"
                toolbar={
                  <>
                    <ListSearch search={view.search} label="Search logsheets" placeholder="Rental, machine, operator, remarks…" />
                    {machinesKnown && (
                      <Select
                        aria-label="Machine"
                        className="w-full min-[760px]:w-[160px]"
                        placeholder="All machines"
                        value={machineParam}
                        onChange={(e) => set({ machine: e.target.value || null })}
                        options={machineOptions}
                      />
                    )}
                    <Select
                      aria-label="Rental"
                      className="w-full min-[760px]:w-[240px]"
                      placeholder="All rentals"
                      value={rentalParam}
                      onChange={(e) => set({ rental: e.target.value || null })}
                      options={rentalOptions}
                    />
                    <Select
                      aria-label="Customer confirmation"
                      className="w-full min-[760px]:w-[190px]"
                      placeholder="Confirmed or not"
                      value={confirmationParam}
                      onChange={(e) => set({ confirmation: e.target.value || null })}
                      options={[
                        { value: "confirmed", label: "Customer confirmed" },
                        { value: "unconfirmed", label: "Not confirmed" },
                      ]}
                    />
                    <Input
                      type="date"
                      mono
                      aria-label="Logged from"
                      prefix="From"
                      className="w-full min-[760px]:w-[190px]"
                      value={fromParam}
                      max={today}
                      onChange={(e) => set({ from: e.target.value || null })}
                    />
                    <Input
                      type="date"
                      mono
                      aria-label="Logged up to"
                      prefix="To"
                      className="w-full min-[760px]:w-[190px]"
                      value={toParam}
                      min={fromParam || undefined}
                      onChange={(e) => set({ to: e.target.value || null })}
                      error={rangeInvalid ? `“To” can't be before “From” (${formatShortDate(fromParam)}). Pick a later date or clear it.` : undefined}
                    />
                    {filtersActive && (
                      <Button variant="tertiary" size="sm" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    )}
                  </>
                }
                footer={
                  data && sorted.length > 0 ? (
                    <Pagination page={page.page} pageCount={page.pageCount} onPageChange={view.setPage} total={sorted.length} pageSize={PAGE_SIZE} noun="logsheets" />
                  ) : undefined
                }
              >
                {data && sorted.length === 0 ? (
                  <NoMatches noun="logsheets" parts={filterParts} onClear={clearFilters} />
                ) : (
                  <Table bare minWidth={1080} caption="Logsheets across every rental">
                    <Thead>
                      <Tr>
                        <Th className="w-[130px]" {...view.sortProps("date")}>
                          Date
                        </Th>
                        <Th className="w-[160px]" {...view.sortProps("rental")}>
                          Rental
                        </Th>
                        <Th className="w-[120px]" {...view.sortProps("machine")}>
                          Machine
                        </Th>
                        <Th align="right" className="w-[104px]" {...view.sortProps("operating")}>
                          Operating
                        </Th>
                        <Th align="right" className="w-[76px]">
                          Idle
                        </Th>
                        <Th align="right" className="w-[88px]">
                          Overtime
                        </Th>
                        <Th>Operator · fuel</Th>
                        <Th className="w-[150px]">Customer</Th>
                        <Th className="w-[92px]">
                          <span className="sr-only">Actions</span>
                        </Th>
                      </Tr>
                    </Thead>
                    {!data ? (
                      <TableSkeleton columns={COLUMNS} rows={8} label="Loading logsheets" />
                    ) : (
                      <Tbody>
                        {page.rows.map((sheet) => {
                          const rental = rentalsById.get(sheet.rentalId);
                          const asset = assetFor(sheet);
                          const fuel = fuelText(sheet);
                          const canCorrect = rental?.status === RentalStatus.active;
                          return (
                            <Tr key={sheet.id} className={sheet.customerConfirmed ? undefined : "bg-attention-wash"}>
                              <Td>
                                <RefCell
                                  href={`/logsheets/${sheet.id}?rentalId=${sheet.rentalId}`}
                                  label={formatDate(sheet.logDate)}
                                  sub={[weekday(sheet.logDate), sheet.shift].filter(Boolean).join(" · ")}
                                />
                              </Td>
                              <Td>
                                <RefCell
                                  href={rentalsKnown ? `/rentals/${sheet.rentalId}` : null}
                                  label={rentalRef(sheet.rentalId)}
                                  sub={customerOf(rental, names) ?? (rentalsKnown ? undefined : "Customer needs the Rentals permission")}
                                />
                              </Td>
                              <Td>
                                {asset ? (
                                  <RefCell href={machinesKnown ? `/machines/${sheet.machineId}` : null} label={asset} />
                                ) : (
                                  <span className="font-mono text-xs text-meta-light">—</span>
                                )}
                              </Td>
                              <Td align="right" className="font-mono text-xs">
                                {formatHours(sheet.operatingHours)}
                              </Td>
                              <Td align="right" className={cx("font-mono text-xs", (sheet.idleHours ?? 0) >= 3 && "text-attention")}>
                                {formatHours(sheet.idleHours)}
                              </Td>
                              <Td align="right" className="font-mono text-xs">
                                {sheet.overtimeHours ? formatHours(sheet.overtimeHours) : "—"}
                              </Td>
                              <Td>
                                <CellStack
                                  title={sheet.operatorName ?? "Operator not recorded"}
                                  sub={fuel ? `Fuel ${fuel}` : "Fuel not recorded"}
                                />
                              </Td>
                              <Td>
                                <Status domain="logsheet" value={confirmation(sheet)} size="sm" />
                              </Td>
                              <Td align="right">
                                {canCorrect && rental && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={!online}
                                    title={online ? `Correct the ${formatShortDate(sheet.logDate)} logsheet` : OFFLINE_HINT}
                                    onClick={() => openDrawer(rental, sheet.logDate)}
                                  >
                                    Correct
                                  </Button>
                                )}
                              </Td>
                            </Tr>
                          );
                        })}
                      </Tbody>
                    )}
                  </Table>
                )}
              </ListCard>
            )}
          </>
        )}
      </PageBody>

      <PickRecordDialog
        open={picking}
        onClose={() => setPicking(false)}
        title="Submit a logsheet"
        description="Pick the rental. The logsheet opens on its most recent day without one — change the date if you're logging another day."
        icon="logsheet"
        label="Rental"
        placeholder="Search by rental, machine or customer"
        options={activeRentals.map((r) => {
          const gapCount = missingDays(r, logsheets, today).length;
          return {
            value: r.id,
            label: `${rentalRef(r.id)} · ${data?.machines?.get(r.machineId)?.assetCode ?? r.machineAssetCode ?? "machine"}`,
            description: [customerOf(r, names), gapCount ? `${plural(gapCount, "day")} not logged` : "logged up to yesterday"]
              .filter(Boolean)
              .join(" · "),
            keywords: [r.projectName, r.projectLocation].filter(Boolean).join(" "),
          };
        })}
        emptyText="No rental is Active, so there's nothing to log. Logsheets need the machine on site."
        hint="Only Active rentals take logsheets."
        requiredMessage="Choose the rental the hours are for."
        confirmLabel="Continue"
        onPick={(id) => {
          setPicking(false);
          const rental = rentalsById.get(id);
          if (rental) openDrawer(rental);
        }}
      />
      {drawer && organizationId && (
        <LogsheetDrawer
          open
          onClose={() => setDrawer(null)}
          organizationId={organizationId}
          rental={drawer.rental}
          logsheets={logsheets.filter((l) => l.rentalId === drawer.rental.id)}
          initialDate={drawer.date}
          onSaved={() => void reload()}
        />
      )}
    </div>
  );
}
