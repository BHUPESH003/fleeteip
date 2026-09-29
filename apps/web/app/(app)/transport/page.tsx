"use client";

import type { Machine } from "@fleetip/contracts/equipment";
import type { Organization } from "@fleetip/contracts/organization";
import { RentalStatus, type Rental } from "@fleetip/contracts/rental";
import { TransportLeg, TransportStatus, transportStatusSchema, type TransportRecord } from "@fleetip/contracts/transport";
import {
  Alert,
  AttentionStrip,
  Button,
  CellStack,
  EmptyState,
  ErrorState,
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
  type KeyFigure,
} from "@fleetip/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { ForbiddenPage } from "../../../components/PageStates";
import { apiClient } from "../../../lib/api-client";
import { describeError, errorStatus } from "../../../lib/errors";
import {
  addDays,
  daysBetween,
  formatMoney,
  formatNumber,
  formatShortDate,
  plural,
  rentalRef,
  todayIsoDate,
} from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { Status, statusLabel, statusOptions } from "../../../lib/status";
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
} from "../../../components/list-kit";
import { TransportPanel } from "../rentals/panels";
import { LEG_LABEL } from "./TransportDialogs";

interface TransportData {
  records: TransportRecord[];
  /** null when the role can't view rentals. */
  rentals: Rental[] | null;
  machines: Map<string, Machine>;
  customerNames: Map<string, string>;
}

async function loadTransport(
  orgId: string,
  access: { rentals: boolean; machines: boolean; customers: boolean },
): Promise<TransportData> {
  // Rentals, machines and customer names are enrichment — ancillary to
  // transport.manage and gated by other permissions a custom role may lack.
  const [records, rentals, machines, renters] = await Promise.all([
    apiClient.listTransportRecords(orgId) as Promise<TransportRecord[]>,
    optional(access.rentals, () => apiClient.listRentals(orgId) as Promise<Rental[]>, null as Rental[] | null),
    optional(access.machines, () => apiClient.listMachines(orgId) as Promise<Machine[]>, [] as Machine[]),
    optional(access.customers, () => apiClient.listRenterOrganizations(orgId) as Promise<Organization[]>, [] as Organization[]),
  ]);
  return {
    records,
    rentals,
    machines: new Map(machines.map((m) => [m.id, m])),
    customerNames: new Map(renters.map((o) => [o.id, o.name])),
  };
}

type DerivedView = "late_dispatch" | "late_delivery";
const DERIVED_VIEWS: Record<DerivedView, string> = {
  late_dispatch: "Planned · past its date",
  late_delivery: "Dispatched · not delivered past its date",
};
const STORED = transportStatusSchema.options;

function inDerivedView(record: TransportRecord, view: DerivedView, today: string): boolean {
  if (!record.plannedDate || record.plannedDate >= today) return false;
  return view === "late_dispatch" ? record.status === TransportStatus.planned : record.status === TransportStatus.dispatched;
}

type SortKey = "leg" | "rental" | "planned" | "charges" | "status";
const SORTS: Record<SortKey, "asc" | "desc"> = { leg: "asc", rental: "asc", planned: "desc", charges: "desc", status: "asc" };
const STATUS_ORDER: Record<TransportRecord["status"], number> = { dispatched: 0, planned: 1, delivered: 2, cancelled: 3 };
const COLUMNS = 7;

function customerOf(rental: Rental | undefined, names: Map<string, string>): string | null {
  if (!rental) return null;
  if (rental.clientSnapshot) return rental.clientSnapshot.name;
  if (rental.renterOrganizationId) return names.get(rental.renterOrganizationId) ?? "FleetIP customer";
  return null;
}

/** "3 days late" / "on plan" / "2 days past plan" — the line under planned → actual. */
function planNote(record: TransportRecord, today: string): { text: string; late: boolean } {
  if (record.status === TransportStatus.cancelled) return { text: "cancelled", late: false };
  if (record.actualDate && record.plannedDate) {
    const diff = daysBetween(record.plannedDate, record.actualDate);
    if (diff === 0) return { text: "on plan", late: false };
    return { text: `${plural(Math.abs(diff), "day")} ${diff > 0 ? "late" : "early"}`, late: diff > 0 };
  }
  if (record.actualDate) return { text: "no planned date", late: false };
  if (!record.plannedDate) return { text: "no date planned yet", late: false };
  const diff = daysBetween(record.plannedDate, today);
  if (diff > 0) return { text: `${plural(diff, "day")} past plan, not delivered`, late: true };
  if (diff === 0) return { text: "planned for today", late: false };
  return { text: `in ${plural(-diff, "day")}`, late: false };
}

export default function TransportPage() {
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  // The fleet-wide list is the Rental Company's (transport.manage). A Renter
  // reads its own rentals' legs from /transport/<id> (transport.respond).
  const canView = hasPermission("transport.manage");
  // Rentals here are enrichment (machine, customer, the per-rental
  // drill-down) — gated by the rental permission of the caller's own
  // organization type, which a custom role may lack.
  const canListRentals =
    organizationType === "renter" ? hasPermission("rental.respond") : hasPermission("rental.manage");
  const access = {
    rentals: canListRentals,
    machines: hasPermission("equipment.manage"),
    customers: hasPermission("quotation.manage"),
  };
  const today = todayIsoDate();

  const { data, error, reload } = useLoad(
    () => loadTransport(organizationId!, access),
    [organizationId, access.rentals, access.machines, access.customers],
    Boolean(organizationId) && canView,
  );
  const view = useListView<SortKey>("transport", SORTS, "planned");
  const { get, set } = view;
  const [picking, setPicking] = useState(false);

  const legParam = get("leg");
  const statusParam = get("status");
  const rentalParam = get("rental");

  // TransportPanel keeps its own copy of the rental's legs; refresh the
  // fleet list when the user leaves the drill-down.
  const previousRental = useRef(rentalParam);
  useEffect(() => {
    if (previousRental.current && !rentalParam) void reload();
    previousRental.current = rentalParam;
  }, [rentalParam, reload]);

  const rentalsById = useMemo(() => new Map((data?.rentals ?? []).map((r) => [r.id, r])), [data?.rentals]);
  const drillRental = rentalParam ? (rentalsById.get(rentalParam) ?? null) : null;
  const records = useMemo(() => data?.records ?? [], [data?.records]);

  const machineOf = (rental: Rental | undefined) => (rental ? (data?.machines.get(rental.machineId) ?? null) : null);

  const filtered = useMemo(() => {
    return records.filter((record) => {
      if (rentalParam && record.rentalId !== rentalParam) return false;
      if (legParam && record.leg !== legParam) return false;
      if (statusParam) {
        if ((STORED as readonly string[]).includes(statusParam)) {
          if (record.status !== statusParam) return false;
        } else if (statusParam in DERIVED_VIEWS && !inDerivedView(record, statusParam as DerivedView, today)) {
          return false;
        }
      }
      if (view.query) {
        const rental = rentalsById.get(record.rentalId);
        const machine = rental ? data?.machines.get(rental.machineId) : undefined;
        if (
          !matches(view.query, [
            rentalRef(record.rentalId),
            machine?.assetCode,
            rental?.machineAssetCode,
            customerOf(rental, data?.customerNames ?? new Map()),
            rental?.projectName,
            record.pickupLocation,
            record.destination,
            record.transportDetails,
            LEG_LABEL[record.leg],
          ])
        ) {
          return false;
        }
      }
      return true;
    });
  }, [records, rentalParam, legParam, statusParam, view.query, rentalsById, data?.machines, data?.customerNames, today]);

  const sorted = useMemo(() => {
    const compare =
      view.sortKey === "leg"
        ? (a: TransportRecord, b: TransportRecord) => a.leg.localeCompare(b.leg)
        : view.sortKey === "rental"
          ? (a: TransportRecord, b: TransportRecord) => compareText(rentalRef(a.rentalId), rentalRef(b.rentalId)) || a.leg.localeCompare(b.leg)
          : view.sortKey === "charges"
            ? (a: TransportRecord, b: TransportRecord) => compareNumber(a.charges, b.charges)
            : view.sortKey === "status"
              ? (a: TransportRecord, b: TransportRecord) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
              : (a: TransportRecord, b: TransportRecord) =>
                  compareText(a.actualDate ?? a.plannedDate, b.actualDate ?? b.plannedDate) || a.createdAt.localeCompare(b.createdAt);
    const missing =
      view.sortKey === "planned"
        ? (r: TransportRecord) => !(r.actualDate ?? r.plannedDate)
        : view.sortKey === "charges"
          ? (r: TransportRecord) => r.charges == null
          : undefined;
    return sortRows(filtered, compare, view.sortDir, missing);
  }, [filtered, view.sortKey, view.sortDir]);
  const page = paginate(sorted, view.page);

  if (currentMembership && !canView) {
    return (
      <ForbiddenPage
        what="transport"
        permissionHint="The fleet-wide transport list needs the Transport permission. Customers see their own trips from each rental."
      />
    );
  }
  if (error && errorStatus(error) === 403) {
    return <ForbiddenPage what="transport" permissionHint="The fleet-wide transport list needs the Transport permission." />;
  }

  const rentalsKnown = data?.rentals != null;
  const names = data?.customerNames ?? new Map<string, string>();

  // ------------------------------------------------------------ figures (fleet-wide)
  const lateDelivery = records.filter((r) => inDerivedView(r, "late_delivery", today));
  const lateDispatch = records.filter((r) => inDerivedView(r, "late_dispatch", today));
  const onTheRoad = records.filter((r) => r.status === TransportStatus.dispatched);
  const plannedAhead = records
    .filter((r) => r.status === TransportStatus.planned)
    .sort((a, b) => compareText(a.plannedDate, b.plannedDate));
  const thisWeek = plannedAhead.filter((r) => r.plannedDate && r.plannedDate >= today && r.plannedDate <= addDays(today, 7));
  const monthKey = today.slice(0, 7);
  const deliveredThisMonth = records.filter((r) => r.status === TransportStatus.delivered && r.actualDate?.slice(0, 7) === monthKey);
  const lateDeliveredThisMonth = deliveredThisMonth.filter((r) => r.plannedDate && r.actualDate && r.actualDate > r.plannedDate);
  const legsByRental = new Map<string, TransportRecord[]>();
  for (const record of records) legsByRental.set(record.rentalId, [...(legsByRental.get(record.rentalId) ?? []), record]);
  const needsMob = (data?.rentals ?? []).filter(
    (r) => (r.status === RentalStatus.confirmed || r.status === RentalStatus.active) && !(legsByRental.get(r.id) ?? []).some((t) => t.leg === TransportLeg.mobilization),
  );
  const needsDemob = (data?.rentals ?? []).filter(
    (r) => r.status === RentalStatus.off_rent && !(legsByRental.get(r.id) ?? []).some((t) => t.leg === TransportLeg.demobilization),
  );

  const figures: KeyFigure[] = [
    {
      key: "road",
      label: "On the road",
      value: formatNumber(onTheRoad.length, 0),
      unit: onTheRoad.length === 1 ? "trip" : "trips",
      context: onTheRoad.length ? `Dispatched · ${lateDelivery.length} past the planned date` : "Nothing dispatched right now",
    },
    {
      key: "planned",
      label: "Planned · next 7 days",
      value: formatNumber(thisWeek.length, 0),
      unit: thisWeek.length === 1 ? "trip" : "trips",
      context: plannedAhead.length
        ? `${plural(plannedAhead.length, "planned trip")} in all${lateDispatch.length ? ` · ${lateDispatch.length} past their date` : ""}`
        : "No trip is waiting to be dispatched",
    },
    {
      key: "delivered",
      label: "Delivered this month",
      value: formatNumber(deliveredThisMonth.length, 0),
      unit: deliveredThisMonth.length === 1 ? "trip" : "trips",
      context: deliveredThisMonth.length
        ? `By actual date · ${lateDeliveredThisMonth.length} later than planned`
        : "None yet this month, by actual date",
    },
    rentalsKnown
      ? {
          key: "unplanned",
          label: "Not planned yet",
          value: formatNumber(needsMob.length + needsDemob.length, 0),
          unit: needsMob.length + needsDemob.length === 1 ? "leg" : "legs",
          context:
            needsMob.length + needsDemob.length
              ? `${plural(needsMob.length, "rental")} with no mobilization · ${plural(needsDemob.length, "off-rent rental")} with no return trip`
              : "Every booked or running rental has its trip recorded",
        }
      : { key: "unplanned", label: "Not planned yet", value: "—", context: "Needs the Rentals permission", tone: "muted" },
  ];

  const filtersActive = Boolean(legParam || statusParam || view.queryLabel);
  const clearFilters = () => set({ leg: null, status: null, q: null });
  const filterParts = [
    legParam ? (LEG_LABEL[legParam as keyof typeof LEG_LABEL] ?? legParam) : null,
    statusParam ? (DERIVED_VIEWS[statusParam as DerivedView] ?? statusLabel("transport", statusParam)) : null,
    view.queryLabel ? quoted(view.queryLabel) : null,
  ].filter((p): p is string => Boolean(p));

  // Rentals that can get a trip: booked, running or returning.
  const plannable = (data?.rentals ?? [])
    .filter((r) => r.status === RentalStatus.confirmed || r.status === RentalStatus.active || r.status === RentalStatus.off_rent)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const planDisabledReason = !rentalsKnown && data ? "Picking a rental needs the Rentals permission." : undefined;
  const primary = drillRental ? null : (
    <Button icon="transport" onClick={() => setPicking(true)} disabled={!data || Boolean(planDisabledReason)} title={planDisabledReason}>
      Plan transport
    </Button>
  );

  const drillFallback = Boolean(rentalParam && data && !drillRental);
  const drillMachine = machineOf(drillRental ?? undefined);

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title="Transport"
        description="Mobilization and demobilization trips across every rental — one record per leg."
        actions={primary}
      />
      <PageBody>
        {drillRental && organizationId ? (
          <>
            <DrillDownBar icon="rental" exitLabel="All transport" onExit={() => set({ rental: null })}>
              <span className="flex flex-wrap items-center gap-2">
                <UILink href={`/rentals/${drillRental.id}?tab=transport`} className="font-mono text-sm font-semibold text-ink no-underline hover:underline">
                  {rentalRef(drillRental.id)}
                </UILink>
                <Status domain="rental" value={drillRental.status} size="sm" />
              </span>
              <span className="text-xs text-meta">
                {[
                  customerOf(drillRental, names),
                  drillMachine?.assetCode ?? drillRental.machineAssetCode,
                  drillRental.projectLocation ? `site ${drillRental.projectLocation}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {" · "}Only this rental&apos;s trips are shown.
              </span>
            </DrillDownBar>
            <TransportPanel organizationId={organizationId} rental={drillRental} onChanged={() => void reload()} />
          </>
        ) : (
          <>
            {drillFallback && (
              <Alert
                tone={rentalsKnown ? "warning" : "info"}
                action={
                  <Button variant="secondary" size="sm" onClick={() => set({ rental: null })}>
                    All transport
                  </Button>
                }
              >
                {rentalsKnown
                  ? `${rentalRef(rentalParam)} isn't one of your rentals, or the link is wrong. Showing any trips recorded against it.`
                  : `Showing ${rentalRef(rentalParam)}'s trips. Planning or changing them here needs the Rentals permission — open a trip to see it.`}
              </Alert>
            )}

            {data && !rentalParam && (
              <AttentionStrip
                items={[
                  {
                    key: "late_delivery",
                    count: lateDelivery.length,
                    text: `${lateDelivery.length === 1 ? "trip" : "trips"} dispatched but not delivered after the planned date`,
                    onClick: () => set({ status: "late_delivery", leg: null }),
                  },
                  {
                    key: "late_dispatch",
                    count: lateDispatch.length,
                    text: `${lateDispatch.length === 1 ? "trip" : "trips"} still planned past the scheduled date`,
                    onClick: () => set({ status: "late_dispatch", leg: null }),
                  },
                ]}
              />
            )}

            {!rentalParam && (data ? <KeyFigures items={figures} label="Transport figures" /> : <KeyFiguresSkeleton count={4} />)}

            {error ? (
              <ErrorState
                title="Transport didn't load"
                message={describeError(error).body}
                action={
                  <Button variant="secondary" size="sm" onClick={() => void reload()}>
                    Try again
                  </Button>
                }
              />
            ) : data && records.length === 0 ? (
              <section className="rounded-panel border border-border-strong bg-surface">
                <EmptyState
                  variant="page"
                  icon="transport"
                  title="No trips recorded yet"
                  description="Mobilization and demobilization are planned per rental. Pick a rental to plan its trip to site."
                  action={primary}
                />
              </section>
            ) : (
              <ListCard
                label="Transport trips"
                toolbar={
                  <>
                    <ListSearch search={view.search} label="Search transport" placeholder="Rental, machine, route, vehicle…" />
                    <Select
                      aria-label="Leg"
                      className="w-full min-[760px]:w-[180px]"
                      placeholder="Both legs"
                      value={legParam}
                      onChange={(e) => set({ leg: e.target.value || null })}
                      options={[
                        { value: TransportLeg.mobilization, label: "Mobilization" },
                        { value: TransportLeg.demobilization, label: "Demobilization" },
                      ]}
                    />
                    <Select
                      aria-label="Status"
                      className="w-full min-[760px]:w-[250px]"
                      placeholder="All statuses"
                      value={statusParam}
                      onChange={(e) => set({ status: e.target.value || null })}
                      options={[
                        ...statusOptions("transport"),
                        ...(Object.keys(DERIVED_VIEWS) as DerivedView[]).map((key) => ({ value: key, label: DERIVED_VIEWS[key] })),
                      ]}
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
                    <Pagination page={page.page} pageCount={page.pageCount} onPageChange={view.setPage} total={sorted.length} pageSize={PAGE_SIZE} noun="trips" />
                  ) : undefined
                }
              >
                {data && sorted.length === 0 ? (
                  <NoMatches noun="trips" parts={filterParts} onClear={clearFilters} />
                ) : (
                  <Table bare minWidth={1000} caption="Transport trips across every rental">
                    <Thead>
                      <Tr>
                        <Th className="w-[150px]" {...view.sortProps("leg")}>
                          Leg
                        </Th>
                        <Th className="w-[170px]" {...view.sortProps("rental")}>
                          Rental
                        </Th>
                        <Th className="w-[130px]">Machine</Th>
                        <Th>Route</Th>
                        <Th className="w-[190px]" {...view.sortProps("planned")}>
                          Planned → actual
                        </Th>
                        <Th align="right" className="w-[120px]" {...view.sortProps("charges")}>
                          Charges
                        </Th>
                        <Th className="w-[118px]" {...view.sortProps("status")}>
                          Status
                        </Th>
                      </Tr>
                    </Thead>
                    {!data ? (
                      <TableSkeleton columns={COLUMNS} rows={8} label="Loading transport" />
                    ) : (
                      <Tbody>
                        {page.rows.map((record) => {
                          const rental = rentalsById.get(record.rentalId);
                          const machine = machineOf(rental);
                          const note = planNote(record, today);
                          return (
                            <Tr key={record.id} className={note.late ? "bg-attention-wash" : undefined}>
                              <Td>
                                <RefCell
                                  href={`/transport/${record.id}?rentalId=${record.rentalId}`}
                                  label={LEG_LABEL[record.leg]}
                                  mono={false}
                                  sub={record.transportDetails ?? "No vehicle recorded"}
                                />
                              </Td>
                              <Td>
                                <RefCell
                                  href={rentalsKnown ? `/rentals/${record.rentalId}` : null}
                                  label={rentalRef(record.rentalId)}
                                  sub={customerOf(rental, names) ?? (rentalsKnown ? "Rental not found" : "Customer needs the Rentals permission")}
                                />
                              </Td>
                              <Td>
                                {machine ? (
                                  <RefCell href={`/machines/${machine.id}`} label={machine.assetCode} />
                                ) : (
                                  <span className="font-mono text-xs text-meta-light">{rental?.machineAssetCode ?? "—"}</span>
                                )}
                              </Td>
                              <Td>
                                <CellStack
                                  title={record.pickupLocation ?? "Pickup not specified"}
                                  sub={`→ ${record.destination ?? "destination not specified"}`}
                                />
                              </Td>
                              <Td>
                                <CellStack
                                  mono
                                  title={`${formatShortDate(record.plannedDate)} → ${formatShortDate(record.actualDate)}`}
                                  sub={<span className={note.late ? "font-medium text-attention" : undefined}>{note.text}</span>}
                                />
                              </Td>
                              <Td align="right" className="font-mono text-xs">
                                {record.charges != null ? formatMoney(record.charges) : <span className="text-disabled-text">—</span>}
                              </Td>
                              <Td>
                                <Status domain="transport" value={record.status} size="sm" />
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
        title="Plan transport"
        description="Pick the rental. Its mobilization and demobilization open next, where you can plan, dispatch or deliver each leg."
        icon="transport"
        label="Rental"
        placeholder="Search by rental, machine or customer"
        options={plannable.map((r) => ({
          value: r.id,
          label: `${rentalRef(r.id)} · ${machineOf(r)?.assetCode ?? r.machineAssetCode ?? "machine"}`,
          description: [customerOf(r, names), statusLabel("rental", r.status), `starts ${formatShortDate(r.startDate)}`].filter(Boolean).join(" · "),
          keywords: [r.projectName, r.projectLocation].filter(Boolean).join(" "),
        }))}
        emptyText="No rental is booked, running or returning, so there's no trip to plan."
        hint="Confirmed, active and off-rent rentals are listed."
        requiredMessage="Choose the rental the trip is for."
        confirmLabel="Open its transport"
        onPick={(id) => {
          setPicking(false);
          set({ rental: id });
        }}
      />
    </div>
  );
}
