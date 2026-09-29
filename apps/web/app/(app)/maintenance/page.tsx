"use client";

import type { Product } from "@fleetip/contracts/catalogue";
import { MachineStatus, type Machine } from "@fleetip/contracts/equipment";
import { MaintenanceStatus, MaintenanceType, maintenanceStatusSchema, type MaintenanceRecord } from "@fleetip/contracts/maintenance";
import type { Rental } from "@fleetip/contracts/rental";
import {
  Alert,
  AttentionStrip,
  Button,
  CellStack,
  EmptyState,
  ErrorState,
  Icon,
  KeyFigures,
  KeyFiguresSkeleton,
  Menu,
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
  type KeyFigure,
} from "@fleetip/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { ForbiddenPage } from "../../../components/PageStates";
import { apiClient } from "../../../lib/api-client";
import { useConnection } from "../../../lib/connection";
import { describeError, errorStatus, OFFLINE_HINT } from "../../../lib/errors";
import { addDays, daysBetween, formatDateRange, formatNumber, formatShortDate, plural, todayIsoDate } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { Status, statusLabel, statusOptions } from "../../../lib/status";
import { optional, useLoad } from "../../../lib/use-load";
import { MaintenanceFormDialog } from "../machines/MaintenanceFormDialog";
import { MaintenancePanel } from "../machines/panels";
import { MAINTENANCE_TYPE_LABEL, MAINTENANCE_TYPE_OPTIONS, blocksAvailability, productName } from "../machines/shared";
import {
  DrillDownBar,
  ListCard,
  ListSearch,
  NoMatches,
  PAGE_SIZE,
  PickRecordDialog,
  RefCell,
  compareText,
  matches,
  paginate,
  quoted,
  sortRows,
  useListView,
} from "./list-kit";
import {
  MaintenanceTransitionDialog,
  canCancelMaintenance,
  nextMaintenanceStep,
  type MaintenanceTarget,
  type MaintenanceTransition,
} from "./MaintenanceTransitionDialog";

interface MaintenanceData {
  records: MaintenanceRecord[];
  /** null when the role can't view machines (Equipment permission). */
  machines: Machine[] | null;
  products: Map<string, Product>;
  /** null when the role can't view rentals. */
  rentals: Rental[] | null;
}

async function loadMaintenance(orgId: string, access: { machines: boolean; rentals: boolean }): Promise<MaintenanceData> {
  // Machines, products and rentals are enrichment: a role with only
  // maintenance.manage still gets a working list (see docs/decisions.md,
  // "ancillary permissions blocking whole pages").
  const [records, machines, products, rentals] = await Promise.all([
    apiClient.listMaintenanceRecords(orgId) as Promise<MaintenanceRecord[]>,
    optional(access.machines, () => apiClient.listMachines(orgId) as Promise<Machine[]>, null as Machine[] | null),
    optional(true, () => apiClient.listProducts() as Promise<Product[]>, [] as Product[]),
    optional(access.rentals, () => apiClient.listRentals(orgId) as Promise<Rental[]>, null as Rental[] | null),
  ]);
  return { records, machines, products: new Map(products.map((p) => [p.id, p])), rentals };
}

/** Derived views offered in the status filter next to the stored statuses. */
type DerivedView = "no_end" | "late_start" | "soon";
const DERIVED_VIEWS: Record<DerivedView, string> = {
  no_end: "In progress · no end date",
  late_start: "Scheduled · start date passed",
  soon: "Scheduled · starts within 7 days",
};
const STORED = maintenanceStatusSchema.options;

function inDerivedView(record: MaintenanceRecord, view: DerivedView, today: string): boolean {
  if (view === "no_end") return record.status === MaintenanceStatus.in_progress && !record.endDate;
  if (view === "late_start") return record.status === MaintenanceStatus.scheduled && record.startDate < today;
  return record.status === MaintenanceStatus.scheduled && record.startDate >= today && record.startDate <= addDays(today, 7);
}

type SortKey = "machine" | "dates" | "status";
const SORTS: Record<SortKey, "asc" | "desc"> = { machine: "asc", dates: "desc", status: "asc" };
const STATUS_ORDER: Record<MaintenanceRecord["status"], number> = { in_progress: 0, scheduled: 1, completed: 2, cancelled: 3 };

const COLUMNS = 7;

/** "starts in 3 days" / "in the workshop 5 days" — the line under a job's dates. */
function timing(record: MaintenanceRecord, today: string): { text: string; late: boolean } {
  if (record.status === MaintenanceStatus.scheduled) {
    const days = daysBetween(today, record.startDate);
    if (days > 0) return { text: `starts in ${plural(days, "day")}`, late: false };
    if (days === 0) return { text: "starts today", late: false };
    return { text: `${plural(-days, "day")} past its start`, late: true };
  }
  if (record.status === MaintenanceStatus.in_progress) {
    if (record.endDate && record.endDate < today) {
      return { text: `${plural(daysBetween(record.endDate, today), "day")} past expected return`, late: true };
    }
    return { text: `in the workshop ${plural(Math.max(1, daysBetween(record.startDate, today) + 1), "day")}`, late: false };
  }
  if (record.status === MaintenanceStatus.completed) {
    return { text: record.endDate ? `took ${plural(daysBetween(record.startDate, record.endDate) + 1, "day")}` : "completed", late: false };
  }
  return { text: "cancelled", late: false };
}

export default function MaintenancePage() {
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  // Maintenance is the Rental Company's own fleet record — there is no
  // Renter-facing maintenance permission (docs/decisions.md).
  const canView = hasPermission("maintenance.manage");
  const access = { machines: hasPermission("equipment.manage"), rentals: hasPermission("rental.manage") };
  const { online } = useConnection();
  const today = todayIsoDate();

  const { data, error, loading, reload } = useLoad(
    () => loadMaintenance(organizationId!, access),
    [organizationId, access.machines, access.rentals],
    Boolean(organizationId) && canView,
  );
  const view = useListView<SortKey>("maintenance", SORTS, "dates");
  const { get, set } = view;

  const [transition, setTransition] = useState<MaintenanceTransition | null>(null);
  const [picking, setPicking] = useState(false);
  const [formMachine, setFormMachine] = useState<Machine | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const statusParam = get("status");
  const typeParam = get("type");
  const machineParam = get("machine");

  // MaintenancePanel keeps its own copy of the machine's jobs; refresh the
  // fleet list when the user leaves the drill-down so it isn't stale.
  const previousMachine = useRef(machineParam);
  useEffect(() => {
    if (previousMachine.current && !machineParam) void reload();
    previousMachine.current = machineParam;
  }, [machineParam, reload]);

  const machinesById = useMemo(() => new Map((data?.machines ?? []).map((m) => [m.id, m])), [data?.machines]);
  const drillMachine = machineParam ? (machinesById.get(machineParam) ?? null) : null;

  const records = useMemo(() => data?.records ?? [], [data?.records]);
  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (machineParam && r.machineId !== machineParam) return false;
      if (statusParam) {
        if ((STORED as readonly string[]).includes(statusParam)) {
          if (r.status !== statusParam) return false;
        } else if (statusParam in DERIVED_VIEWS) {
          if (!inDerivedView(r, statusParam as DerivedView, today)) return false;
        }
      }
      if (typeParam && r.maintenanceType !== typeParam) return false;
      if (view.query) {
        const machine = machinesById.get(r.machineId);
        const product = machine ? productName(data?.products.get(machine.productId)) : null;
        if (
          !matches(view.query, [
            machine?.assetCode,
            machine?.registrationNumber,
            product,
            MAINTENANCE_TYPE_LABEL[r.maintenanceType],
            r.notes,
            statusLabel("maintenance", r.status),
          ])
        ) {
          return false;
        }
      }
      return true;
    });
  }, [records, machineParam, statusParam, typeParam, view.query, machinesById, data?.products, today]);

  const sorted = useMemo(() => {
    const compare =
      view.sortKey === "machine"
        ? (a: MaintenanceRecord, b: MaintenanceRecord) =>
            compareText(machinesById.get(a.machineId)?.assetCode, machinesById.get(b.machineId)?.assetCode) ||
            b.startDate.localeCompare(a.startDate)
        : view.sortKey === "status"
          ? (a: MaintenanceRecord, b: MaintenanceRecord) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.startDate.localeCompare(b.startDate)
          : (a: MaintenanceRecord, b: MaintenanceRecord) => a.startDate.localeCompare(b.startDate) || a.createdAt.localeCompare(b.createdAt);
    return sortRows(
      filtered,
      compare,
      view.sortDir,
      view.sortKey === "machine" ? (r) => !machinesById.get(r.machineId)?.assetCode : undefined,
    );
  }, [filtered, view.sortKey, view.sortDir, machinesById]);
  const page = paginate(sorted, view.page);

  if (currentMembership && !canView) {
    return (
      <ForbiddenPage
        what="maintenance"
        permissionHint="Workshop records need the Maintenance permission. They're kept by the rental company that owns the fleet."
      />
    );
  }
  if (error && errorStatus(error) === 403) {
    return <ForbiddenPage what="maintenance" permissionHint="Workshop records need the Maintenance permission." />;
  }

  const machinesKnown = data?.machines != null;
  const loggable = (data?.machines ?? []).filter((m) => m.status !== MachineStatus.retired).sort((a, b) => compareText(a.assetCode, b.assetCode));
  const rentalsFor = (machineId: string) => (data?.rentals ?? []).filter((r) => r.machineId === machineId);

  function openForm(machine: Machine) {
    setFormMachine(machine);
    setFormOpen(true);
  }

  // Header primary: Log maintenance → pick a machine → MaintenanceFormDialog.
  const logDisabledReason = !online
    ? OFFLINE_HINT
    : !machinesKnown && data
      ? "Picking a machine needs the Equipment permission."
      : data && loggable.length === 0
        ? "There's no machine to log against — every machine is retired or none is registered."
        : undefined;
  const primary = drillMachine ? null : (
    <Button icon="plus" onClick={() => setPicking(true)} disabled={!data || Boolean(logDisabledReason)} title={logDisabledReason}>
      Log maintenance
    </Button>
  );

  const filtersActive = Boolean(statusParam || typeParam || view.queryLabel);
  const filterParts = [
    statusParam ? (DERIVED_VIEWS[statusParam as DerivedView] ?? statusLabel("maintenance", statusParam)) : null,
    typeParam ? (MAINTENANCE_TYPE_LABEL[typeParam as keyof typeof MAINTENANCE_TYPE_LABEL] ?? typeParam) : null,
    view.queryLabel ? quoted(view.queryLabel) : null,
  ].filter((p): p is string => Boolean(p));

  // ------------------------------------------------------------ figures (fleet-wide)
  const inProgress = records.filter((r) => r.status === MaintenanceStatus.in_progress);
  const noEnd = inProgress.filter((r) => !r.endDate);
  const lateStart = records.filter((r) => inDerivedView(r, "late_start", today));
  const scheduledAhead = records
    .filter((r) => r.status === MaintenanceStatus.scheduled && r.startDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const soon = scheduledAhead.filter((r) => r.startDate <= addDays(today, 7));
  const next = scheduledAhead[0];
  const underMaintenance = (data?.machines ?? []).filter((m) => m.status === MachineStatus.under_maintenance);
  const idleInWorkshop = underMaintenance.filter((m) => !inProgress.some((r) => r.machineId === m.id));
  const monthAgo = addDays(today, -30);
  const completedRecently = records.filter((r) => r.status === MaintenanceStatus.completed && (r.endDate ?? r.updatedAt.slice(0, 10)) >= monthAgo);
  const assetOf = (id: string) => machinesById.get(id)?.assetCode ?? "a machine";

  const figures: KeyFigure[] = [
    {
      key: "workshop",
      label: "In the workshop",
      value: formatNumber(inProgress.length, 0),
      unit: inProgress.length === 1 ? "job" : "jobs",
      context: inProgress.length
        ? `${plural(new Set(inProgress.map((r) => r.machineId)).size, "machine")} · ${noEnd.length ? `${noEnd.length} with no end date` : "all have an expected return date"}`
        : "No job is in progress",
    },
    {
      key: "scheduled",
      label: "Starting within 7 days",
      value: formatNumber(soon.length, 0),
      unit: soon.length === 1 ? "job" : "jobs",
      context: next
        ? `Next: ${assetOf(next.machineId)} on ${formatShortDate(next.startDate)}${scheduledAhead.length > soon.length ? ` · ${scheduledAhead.length - soon.length} later` : ""}`
        : "Nothing is scheduled ahead",
    },
    machinesKnown
      ? {
          key: "machines",
          label: "Machines under maintenance",
          value: formatNumber(underMaintenance.length, 0),
          unit: underMaintenance.length === 1 ? "machine" : "machines",
          context: idleInWorkshop.length
            ? `${idleInWorkshop.map((m) => m.assetCode).slice(0, 3).join(", ")}${idleInWorkshop.length > 3 ? " and more" : ""} ${idleInWorkshop.length === 1 ? "has" : "have"} no job in progress`
            : "Stored machine status — off the rentable fleet",
        }
      : {
          key: "machines",
          label: "Machines under maintenance",
          value: "—",
          context: "Needs the Equipment permission",
          tone: "muted",
        },
    {
      key: "completed",
      label: "Completed · last 30 days",
      value: formatNumber(completedRecently.length, 0),
      unit: completedRecently.length === 1 ? "job" : "jobs",
      context: `By end date, since ${formatShortDate(monthAgo)}`,
    },
  ];

  const machineOptions = [...(data?.machines ?? [])]
    .filter((m) => m.status !== MachineStatus.retired || records.some((r) => r.machineId === m.id))
    .sort((a, b) => compareText(a.assetCode, b.assetCode))
    .map((m) => ({ value: m.id, label: m.assetCode }));

  const drillFallback = Boolean(machineParam && data && !drillMachine);

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title="Maintenance"
        description="Workshop jobs across the fleet — services, breakdowns and inspections, planned or already done."
        actions={primary}
      />
      <PageBody>
        {drillMachine && data && organizationId ? (
          <>
            <DrillDownBar icon="machine" exitLabel="All machines" onExit={() => set({ machine: null })}>
              <span className="flex flex-wrap items-center gap-2">
                <UILink href={`/machines/${drillMachine.id}?tab=workshop`} className="font-mono text-sm font-semibold text-ink no-underline hover:underline">
                  {drillMachine.assetCode}
                </UILink>
                <Status domain="machine" value={drillMachine.status} size="sm" />
              </span>
              <span className="text-xs text-meta">
                {[productName(data.products.get(drillMachine.productId)), drillMachine.registrationNumber].filter(Boolean).join(" · ")}
                {" · "}Only this machine&apos;s workshop jobs are shown.
              </span>
            </DrillDownBar>
            <MaintenancePanel
              organizationId={organizationId}
              machine={drillMachine}
              rentals={rentalsFor(drillMachine.id)}
              onMachineChanged={() => void reload()}
              title={`Workshop jobs on ${drillMachine.assetCode}`}
            />
          </>
        ) : (
          <>
            {drillFallback && (
              <Alert
                tone={machinesKnown ? "warning" : "info"}
                action={
                  <Button variant="secondary" size="sm" onClick={() => set({ machine: null })}>
                    All machines
                  </Button>
                }
              >
                {machinesKnown
                  ? "That machine isn't in your fleet. It may belong to another organization, or the link is wrong. Showing any jobs recorded against it."
                  : "Showing one machine's jobs. Its asset code and status need the Equipment permission, so only a job's own status can change from here."}
              </Alert>
            )}

            {data && !machineParam && (
              <AttentionStrip
                items={[
                  {
                    key: "no_end",
                    count: noEnd.length,
                    text: `${noEnd.length === 1 ? "job" : "jobs"} in progress with no expected return date`,
                    onClick: () => set({ status: "no_end", type: null }),
                  },
                  {
                    key: "late_start",
                    count: lateStart.length,
                    text: `${lateStart.length === 1 ? "job" : "jobs"} still Scheduled after the start date`,
                    onClick: () => set({ status: "late_start", type: null }),
                  },
                ]}
              />
            )}

            {!machineParam && (data ? <KeyFigures items={figures} label="Workshop figures" /> : <KeyFiguresSkeleton count={4} />)}

            {error ? (
              <ErrorState
                title="Workshop jobs didn't load"
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
                  icon="maintenance"
                  title="No workshop jobs yet"
                  description="Plan a service, or log a breakdown or inspection that already happened. Jobs on every machine in the fleet appear here."
                  action={primary}
                />
              </section>
            ) : (
              <ListCard
                label="Workshop jobs"
                toolbar={
                  <>
                    <ListSearch search={view.search} label="Search workshop jobs" placeholder="Asset code, reason, notes…" />
                    <Select
                      aria-label="Status"
                      className="w-full min-[760px]:w-[220px]"
                      placeholder="All statuses"
                      value={statusParam}
                      onChange={(e) => set({ status: e.target.value || null })}
                      options={[
                        ...statusOptions("maintenance"),
                        ...(Object.keys(DERIVED_VIEWS) as DerivedView[]).map((key) => ({ value: key, label: DERIVED_VIEWS[key] })),
                      ]}
                    />
                    <Select
                      aria-label="Reason"
                      className="w-full min-[760px]:w-[180px]"
                      placeholder="All reasons"
                      value={typeParam}
                      onChange={(e) => set({ type: e.target.value || null })}
                      options={MAINTENANCE_TYPE_OPTIONS}
                    />
                    {machinesKnown && (
                      <Select
                        aria-label="Machine"
                        className="w-full min-[760px]:w-[180px]"
                        placeholder="All machines"
                        value={machineParam}
                        onChange={(e) => set({ machine: e.target.value || null })}
                        options={machineOptions}
                      />
                    )}
                    {filtersActive && (
                      <Button variant="tertiary" size="sm" onClick={() => set({ status: null, type: null, q: null })}>
                        Clear filters
                      </Button>
                    )}
                  </>
                }
                footer={
                  data && sorted.length > 0 ? (
                    <Pagination page={page.page} pageCount={page.pageCount} onPageChange={view.setPage} total={sorted.length} pageSize={PAGE_SIZE} noun="jobs" />
                  ) : undefined
                }
              >
                {data && sorted.length === 0 ? (
                  <NoMatches noun="workshop jobs" parts={filterParts} onClear={() => set({ status: null, type: null, q: null })} />
                ) : (
                  <Table bare minWidth={1020} caption="Workshop jobs across the fleet">
                    <Thead>
                      <Tr>
                        <Th className="w-[170px]" {...view.sortProps("machine")}>
                          Machine
                        </Th>
                        <Th className="w-[150px]">Reason</Th>
                        <Th className="w-[210px]" {...view.sortProps("dates")}>
                          Dates
                        </Th>
                        <Th>Notes</Th>
                        <Th className="w-[120px]" {...view.sortProps("status")}>
                          Status
                        </Th>
                        <Th className="w-[110px]">Blocks new rentals</Th>
                        <Th className="w-[170px]">
                          <span className="sr-only">Actions</span>
                        </Th>
                      </Tr>
                    </Thead>
                    {!data ? (
                      <TableSkeleton columns={COLUMNS} rows={8} label="Loading workshop jobs" />
                    ) : (
                      <Tbody>
                        {page.rows.map((record) => (
                          <JobRow
                            key={record.id}
                            record={record}
                            machine={machinesById.get(record.machineId) ?? null}
                            machinesKnown={machinesKnown}
                            product={(() => {
                              const machine = machinesById.get(record.machineId);
                              return machine ? productName(data.products.get(machine.productId)) : null;
                            })()}
                            today={today}
                            online={online}
                            onTransition={(to) => setTransition({ record, to })}
                          />
                        ))}
                      </Tbody>
                    )}
                  </Table>
                )}
              </ListCard>
            )}
          </>
        )}
      </PageBody>

      {organizationId && (
        <MaintenanceTransitionDialog
          organizationId={organizationId}
          transition={transition}
          machine={transition ? (machinesById.get(transition.record.machineId) ?? null) : null}
          otherInProgress={
            transition
              ? records.some((r) => r.machineId === transition.record.machineId && r.status === MaintenanceStatus.in_progress && r.id !== transition.record.id)
              : false
          }
          onClose={() => setTransition(null)}
          onDone={() => void reload()}
        />
      )}

      <PickRecordDialog
        open={picking}
        onClose={() => setPicking(false)}
        title="Log maintenance"
        description="Pick the machine first. Next you'll say what the job is and when — planned, or already done."
        icon="maintenance"
        label="Machine"
        placeholder="Search by asset code or registration"
        options={loggable.map((m) => ({
          value: m.id,
          label: m.assetCode,
          description: [productName(data?.products.get(m.productId)), m.registrationNumber, m.status === MachineStatus.under_maintenance ? "Under maintenance" : null]
            .filter(Boolean)
            .join(" · "),
          keywords: m.registrationNumber,
        }))}
        emptyText="There's no machine to log against. Retired machines can't get new workshop jobs."
        hint="Retired machines aren't listed."
        requiredMessage="Choose the machine the job is for."
        confirmLabel="Continue"
        onPick={(id) => {
          const machine = machinesById.get(id);
          setPicking(false);
          if (machine) openForm(machine);
        }}
      />
      {organizationId && formMachine && (
        <MaintenanceFormDialog
          open={formOpen}
          onClose={() => setFormOpen(false)}
          organizationId={organizationId}
          machine={formMachine}
          rentals={rentalsFor(formMachine.id)}
          onSaved={() => void reload()}
        />
      )}
      {loading && !data && (
        <span role="status" className="sr-only">
          Loading workshop jobs…
        </span>
      )}
    </div>
  );
}

function JobRow({
  record,
  machine,
  machinesKnown,
  product,
  today,
  online,
  onTransition,
}: {
  record: MaintenanceRecord;
  machine: Machine | null;
  machinesKnown: boolean;
  product: string | null;
  today: string;
  online: boolean;
  onTransition: (to: MaintenanceTarget) => void;
}) {
  const typeLabel = MAINTENANCE_TYPE_LABEL[record.maintenanceType];
  const detailHref = `/maintenance/${record.id}?machineId=${record.machineId}`;
  const step = nextMaintenanceStep(record);
  const noEndDate = !record.endDate && blocksAvailability(record.status);
  const when = timing(record, today);
  // Like MaintenancePanel: no workshop writes on a retired machine.
  const writable = machine?.status !== MachineStatus.retired;
  const asset = machine?.assetCode ?? "this machine";

  return (
    <Tr>
      <Td>
        {machine ? (
          <RefCell href={`/machines/${machine.id}`} label={machine.assetCode} sub={product ?? machine.registrationNumber} />
        ) : (
          <RefCell
            label={`Machine ${record.machineId.slice(0, 8)}`}
            sub={machinesKnown ? "Not in your fleet list" : "Asset code needs the Equipment permission"}
            className="text-meta"
          />
        )}
      </Td>
      <Td>
        <UILink
          href={detailHref}
          className={cx(
            "whitespace-nowrap text-sm font-medium no-underline hover:underline",
            record.maintenanceType === MaintenanceType.breakdown ? "text-destructive" : "text-ink-strong",
          )}
        >
          {typeLabel}
        </UILink>
      </Td>
      <Td>
        <CellStack
          mono
          title={formatDateRange(record.startDate, record.endDate, "no end date")}
          titleClassName={noEndDate ? "text-destructive" : undefined}
          sub={<span className={when.late ? "font-medium text-attention" : undefined}>{when.text}</span>}
        />
      </Td>
      <Td className="text-ink-muted">
        <span className="clamp-2" title={record.notes ?? undefined}>
          {record.notes ?? <span className="italic text-disabled-text">Not specified</span>}
        </span>
      </Td>
      <Td>
        <Status domain="maintenance" value={record.status} size="sm" />
      </Td>
      <Td>
        {blocksAvailability(record.status) ? (
          <span
            className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-attention"
            title="While a job is Scheduled or In progress, no new rental can overlap its dates."
          >
            <Icon name="lock" size={12} />
            Yes
          </span>
        ) : (
          <span className="text-xs text-meta-light">No</span>
        )}
      </Td>
      <Td align="right">
        {step && writable && (
          <span className="flex items-center justify-end gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              disabled={!online}
              title={online ? undefined : OFFLINE_HINT}
              onClick={() => onTransition(step)}
            >
              {step === MaintenanceStatus.in_progress ? "Start job" : "Complete job"}
            </Button>
            <Menu
              label={`More actions for the ${typeLabel.toLowerCase()} job on ${asset}`}
              triggerSize="sm"
              items={[
                { key: "open", label: "Open job", icon: "external", href: detailHref, hint: "Every detail of the job." },
                {
                  key: "cancel",
                  label: "Cancel job",
                  icon: "close",
                  danger: true,
                  separatorBefore: true,
                  disabled: !online || !canCancelMaintenance(record),
                  hint: online ? "Kept on record as Cancelled. It stops blocking new rentals." : OFFLINE_HINT,
                  onSelect: () => onTransition(MaintenanceStatus.cancelled),
                },
              ]}
            />
          </span>
        )}
      </Td>
    </Tr>
  );
}
