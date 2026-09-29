"use client";

import type { Product } from "@fleetip/contracts/catalogue";
import { MachineStatus, type Machine } from "@fleetip/contracts/equipment";
import { MaintenanceStatus, type MaintenanceRecord } from "@fleetip/contracts/maintenance";
import { RentalStatus, type Rental } from "@fleetip/contracts/rental";
import {
  AttentionList,
  Button,
  DescriptionList,
  EmptyState,
  Icon,
  Menu,
  PageBody,
  PageHeader,
  Panel,
  Skeleton,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  UILink,
  cx,
  type AttentionListItem,
  type MenuItem,
} from "@fleetip/ui";
import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ForbiddenPage, PageLoadError } from "../../../../components/PageStates";
import { ApiError, apiClient } from "../../../../lib/api-client";
import { useConnection } from "../../../../lib/connection";
import { OFFLINE_HINT } from "../../../../lib/errors";
import { daysBetween, formatDate, formatDateRange, formatDateTime, plural, rentalRef, todayIsoDate } from "../../../../lib/format";
import { useListBackHref } from "../../../../lib/list-state";
import { useSession } from "../../../../lib/session-context";
import { Status } from "../../../../lib/status";
import { optional, useLoad } from "../../../../lib/use-load";
import { MaintenanceFormDialog } from "../../machines/MaintenanceFormDialog";
import { MAINTENANCE_TYPE_LABEL, blocksAvailability, productName } from "../../machines/shared";
import { DetailColumns, TEXT_LINK } from "../list-kit";
import {
  MaintenanceTransitionDialog,
  canCancelMaintenance,
  nextMaintenanceStep,
  type MaintenanceTransition,
} from "../MaintenanceTransitionDialog";

interface JobData {
  record: MaintenanceRecord;
  /** Every job on the same machine, newest start first (this one included). */
  machineJobs: MaintenanceRecord[];
  machine: Machine | null;
  product: Product | null;
  /** The machine's rentals (Rentals permission) — for the "still on rent" check and new-job overlap. */
  rentals: Rental[];
  access: { machines: boolean; rentals: boolean };
  today: string;
}

async function loadJob(
  orgId: string,
  id: string,
  machineIdParam: string | null,
  access: { machines: boolean; rentals: boolean },
): Promise<JobData> {
  // There's no GET-by-id for maintenance: the job is found in its machine's
  // list (the ?machineId= every in-app link carries) or, for a link
  // without it, in the org-wide list.
  const [scoped, machines, products, rentals] = await Promise.all([
    machineIdParam
      ? (apiClient.listMaintenanceForMachine(orgId, machineIdParam) as Promise<MaintenanceRecord[]>)
      : (apiClient.listMaintenanceRecords(orgId) as Promise<MaintenanceRecord[]>),
    optional(access.machines, () => apiClient.listMachines(orgId) as Promise<Machine[]>, [] as Machine[]),
    optional(true, () => apiClient.listProducts() as Promise<Product[]>, [] as Product[]),
    optional(access.rentals, () => apiClient.listRentals(orgId) as Promise<Rental[]>, [] as Rental[]),
  ]);
  let list = scoped;
  let record = list.find((r) => r.id === id);
  if (!record && machineIdParam) {
    // A stale ?machineId= shouldn't hide a job that exists.
    list = (await apiClient.listMaintenanceRecords(orgId)) as MaintenanceRecord[];
    record = list.find((r) => r.id === id);
  }
  if (!record) throw new ApiError("Maintenance record not found", 404, "not_found");
  const found = record;
  const machine = machines.find((m) => m.id === found.machineId) ?? null;
  return {
    record: found,
    machineJobs: list.filter((r) => r.machineId === found.machineId).sort((a, b) => b.startDate.localeCompare(a.startDate)),
    machine,
    product: machine ? (products.find((p) => p.id === machine.productId) ?? null) : null,
    rentals: rentals.filter((r) => r.machineId === found.machineId),
    access,
    today: todayIsoDate(),
  };
}

export default function MaintenanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const machineIdParam = searchParams.get("machineId");
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  // Maintenance is Rental-Company-only by design: every MaintenanceService
  // method needs maintenance.manage and there is no renter-facing
  // counterpart (docs/decisions.md). Machine names are enrichment — a role
  // without equipment.manage still gets a working page.
  const canView = hasPermission("maintenance.manage");
  const access = { machines: hasPermission("equipment.manage"), rentals: hasPermission("rental.manage") };

  const { data, error, loading, reload } = useLoad(
    () => loadJob(organizationId!, id, machineIdParam, access),
    [organizationId, id, machineIdParam, access.machines, access.rentals],
    Boolean(organizationId) && canView,
  );

  if (currentMembership && !canView) {
    return (
      <ForbiddenPage
        what="maintenance"
        permissionHint="Workshop records need the Maintenance permission. They're kept by the rental company that owns the fleet."
      />
    );
  }
  if (error) {
    return (
      <PageLoadError
        error={error}
        onRetry={() => void reload()}
        notFound={{
          title: "We can't find this workshop job",
          body: "It may belong to another organization, or the link is wrong. Workshop jobs are never deleted — a cancelled one would still open.",
        }}
        forbidden={{ what: "maintenance", permissionHint: "Workshop records need the Maintenance permission." }}
        serverTitle="This workshop job didn't load"
        backHref="/maintenance"
        backLabel="Back to maintenance"
      />
    );
  }
  if (loading || !data || !organizationId) return <JobSkeleton />;

  // Keyed by id: dialogs and local state reset when another job opens (the
  // App Router doesn't remount on a changed [id]).
  return <JobView key={id} data={data} organizationId={organizationId} reload={reload} />;
}

function JobView({ data, organizationId, reload }: { data: JobData; organizationId: string; reload: () => Promise<void> }) {
  const { online } = useConnection();
  const backHref = useListBackHref("maintenance", "/maintenance");
  const [transition, setTransition] = useState<MaintenanceTransition | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const { record, machine, today } = data;
  const typeLabel = MAINTENANCE_TYPE_LABEL[record.maintenanceType];
  const asset = machine?.assetCode ?? null;
  const productLabel = productName(data.product);
  const step = nextMaintenanceStep(record);
  const retired = machine?.status === MachineStatus.retired;
  const blocking = blocksAvailability(record.status);
  const otherInProgress = data.machineJobs.some((r) => r.status === MaintenanceStatus.in_progress && r.id !== record.id);
  const activeRental = data.rentals.find((r) => r.status === RentalStatus.active) ?? null;
  const writeBlocked = !online ? OFFLINE_HINT : retired ? `${asset} is retired, so its workshop jobs can't change.` : null;

  const primary = step ? (
    <Button
      icon={step === MaintenanceStatus.in_progress ? "maintenance" : "check"}
      onClick={() => setTransition({ record, to: step })}
      disabled={Boolean(writeBlocked)}
      title={writeBlocked ?? undefined}
    >
      {step === MaintenanceStatus.in_progress ? "Start job" : "Complete job"}
    </Button>
  ) : null;

  const menuItems: MenuItem[] = [
    {
      key: "log",
      label: asset ? `Log another job on ${asset}` : "Log another job",
      icon: "plus",
      disabled: !machine || retired || !online,
      hint: !online
        ? OFFLINE_HINT
        : !machine
          ? "Needs the Equipment permission to load the machine."
          : retired
            ? "Retired machines can't get new workshop jobs."
            : "Plan a job or record one that already happened. Machine status doesn't change.",
      onSelect: () => setFormOpen(true),
    },
    ...(machine
      ? [{ key: "machine", label: `Open ${machine.assetCode}`, icon: "machine" as const, href: `/machines/${machine.id}?tab=workshop`, hint: "Rentals, logsheets and status of the machine." }]
      : []),
    {
      key: "all",
      label: "All workshop jobs on this machine",
      icon: "maintenance",
      href: `/maintenance?machine=${record.machineId}`,
      hint: "Start, complete or plan jobs for the machine in one place.",
    },
    {
      key: "cancel",
      label: "Cancel job",
      icon: "close",
      danger: true,
      separatorBefore: true,
      disabled: !canCancelMaintenance(record) || Boolean(writeBlocked),
      hint: !canCancelMaintenance(record)
        ? "Completed and cancelled jobs stay on record as they are."
        : (writeBlocked ?? "Kept on record as Cancelled. It stops blocking new rentals."),
      onSelect: () => setTransition({ record, to: MaintenanceStatus.cancelled }),
    },
  ];

  // Needs attention — derived from what loaded; FleetIP sends no reminders.
  const attention: AttentionListItem[] = [];
  if (record.status === MaintenanceStatus.in_progress && !record.endDate) {
    attention.push({
      key: "no-end",
      severity: "error",
      title: "This job has no expected return date",
      context: `In the workshop since ${formatDate(record.startDate)} (${plural(Math.max(1, daysBetween(record.startDate, today) + 1), "day")}). FleetIP can't add an end date after a job is created, so ${asset ?? "the machine"} can't be promised to anyone until the job is completed.`,
      action: step === MaintenanceStatus.completed && !writeBlocked ? { label: "Complete job", onClick: () => setTransition({ record, to: MaintenanceStatus.completed }) } : undefined,
    });
  }
  if (record.status === MaintenanceStatus.scheduled && record.startDate < today) {
    attention.push({
      key: "late-start",
      severity: "warning",
      title: `The job was due to start on ${formatDate(record.startDate)}`,
      context: "It's still Scheduled, so it keeps blocking new rentals over its dates. Start it, or cancel it if it isn't happening.",
      action: !writeBlocked ? { label: "Start job", onClick: () => setTransition({ record, to: MaintenanceStatus.in_progress }) } : undefined,
    });
  }
  if (record.status === MaintenanceStatus.in_progress && record.endDate && record.endDate < today) {
    attention.push({
      key: "overrun",
      severity: "warning",
      title: `The machine was expected back on ${formatDate(record.endDate)}`,
      context: "The job is still In progress. Complete it once the machine is back — its dates can't be changed.",
      action: !writeBlocked ? { label: "Complete job", onClick: () => setTransition({ record, to: MaintenanceStatus.completed }) } : undefined,
    });
  }
  if (record.status === MaintenanceStatus.in_progress && activeRental) {
    attention.push({
      key: "on-rent",
      severity: "warning",
      title: `${rentalRef(activeRental.id)} is still Active while the machine is in the workshop`,
      context: "Workshop jobs don't carry a rental, so this job can't be linked to it. Decide with the customer whether the rental goes off rent.",
      action: { label: `Open ${rentalRef(activeRental.id)}`, href: `/rentals/${activeRental.id}` },
    });
  }
  if (!blocking && machine?.status === MachineStatus.under_maintenance && !data.machineJobs.some((r) => r.status === MaintenanceStatus.in_progress)) {
    attention.push({
      key: "machine-stuck",
      severity: "warning",
      title: `${machine.assetCode} is still marked Under maintenance`,
      context: "No workshop job on it is in progress, so it can't be quoted or rented for no recorded reason. Set it back to Active from the machine page.",
      action: { label: `Open ${machine.assetCode}`, href: `/machines/${machine.id}` },
    });
  }

  const length =
    record.status === MaintenanceStatus.in_progress
      ? `${plural(Math.max(1, daysBetween(record.startDate, today) + 1), "day")} so far`
      : record.endDate
        ? `${plural(daysBetween(record.startDate, record.endDate) + 1, "day")}${record.status === MaintenanceStatus.scheduled ? " planned" : ""}`
        : null;

  const otherJobs = data.machineJobs.filter((r) => r.id !== record.id);

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        breadcrumbs={[
          { label: "Maintenance", href: backHref },
          { label: `${asset ?? "Machine"} · ${typeLabel}` },
        ]}
        title={`${typeLabel} · ${formatDate(record.startDate)}`}
        meta={
          <>
            <Status domain="maintenance" value={record.status} />
            {blocking && (
              <span
                className="inline-flex items-center gap-1 text-xs font-medium text-attention"
                title="While a job is Scheduled or In progress, no new rental can overlap its dates."
              >
                <Icon name="lock" size={12} />
                Blocks new rentals
              </span>
            )}
          </>
        }
        description={
          <span>
            Workshop job on{" "}
            {machine ? (
              <UILink href={`/machines/${machine.id}?tab=workshop`} className={cx("font-mono", TEXT_LINK)}>
                {machine.assetCode}
              </UILink>
            ) : (
              <span className="font-mono">machine {record.machineId.slice(0, 8)}</span>
            )}
            {productLabel ? ` · ${productLabel}` : ""}
          </span>
        }
        actions={
          <>
            {primary}
            <Menu label={`More actions for the ${typeLabel.toLowerCase()} job`} items={menuItems} width={320} />
          </>
        }
      />

      <PageBody>
        <AttentionList items={attention} note="Worked out when this page opened. FleetIP doesn't send reminders for these." />

        <DetailColumns
          asideLabel="Machine and other jobs"
          main={
            <Panel title="Workshop job" subtitle="as recorded" padding="none">
              <div className="flex flex-col gap-3 px-4 py-3.5">
                <DescriptionList
                  layout="grid"
                  items={[
                    {
                      label: "Machine",
                      value: machine ? (
                        <UILink href={`/machines/${machine.id}`} className={TEXT_LINK}>
                          {machine.assetCode}
                        </UILink>
                      ) : null,
                      mono: true,
                      emptyText: data.access.machines ? "Not in your fleet list" : "Needs the Equipment permission",
                    },
                    { label: "Product", value: productLabel },
                    { label: "Reason", value: typeLabel },
                    { label: "Status", value: <Status domain="maintenance" value={record.status} size="sm" /> },
                    { label: "In the workshop from", value: formatDate(record.startDate), mono: true },
                    {
                      label: "Expected back",
                      value: record.endDate ? (
                        formatDate(record.endDate)
                      ) : blocking ? (
                        <span className="font-sans font-medium text-destructive">No end date</span>
                      ) : null,
                      mono: true,
                    },
                    { label: "Length", value: length, mono: true, emptyText: "Open-ended" },
                    {
                      label: "Blocks new rentals",
                      value: blocking ? "Yes — no new rental can overlap these dates while it's open" : "No — it's closed",
                    },
                    { label: "Notes", value: record.notes, wide: true },
                    { label: "Recorded", value: formatDateTime(record.createdAt), mono: true },
                    { label: "Last updated", value: formatDateTime(record.updatedAt), mono: true },
                  ]}
                />
                <span className="flex items-start gap-1.5 text-[11px] leading-[1.45] text-meta">
                  <Icon name="lock" size={12} className="mt-px text-meta-light" />
                  A job&apos;s dates can&apos;t be edited after it&apos;s created — FleetIP has no way to change them yet. Only its
                  status moves: Scheduled, In progress, then Completed or Cancelled.
                </span>
              </div>
            </Panel>
          }
          aside={
            <>
              <Panel title="Machine" padding="none">
                <div className="px-4 py-3">
                  {machine ? (
                    <DescriptionList
                      layout="rows"
                      items={[
                        {
                          label: "Asset code",
                          value: (
                            <UILink href={`/machines/${machine.id}`} className={TEXT_LINK}>
                              {machine.assetCode}
                            </UILink>
                          ),
                          mono: true,
                        },
                        { label: "Machine status", value: <Status domain="machine" value={machine.status} size="sm" /> },
                        { label: "Product", value: productLabel },
                        { label: "Registration", value: machine.registrationNumber, mono: true },
                        {
                          label: "Current rental",
                          value: activeRental ? (
                            <UILink href={`/rentals/${activeRental.id}`} className={TEXT_LINK}>
                              {rentalRef(activeRental.id)}
                            </UILink>
                          ) : null,
                          mono: true,
                          emptyText: data.access.rentals ? "None active" : "Needs the Rentals permission",
                        },
                      ]}
                    />
                  ) : (
                    <p className="m-0 text-xs leading-[1.5] text-ink-soft">
                      {data.access.machines
                        ? "This machine isn't in your fleet list."
                        : "The machine's asset code and status need the Equipment permission, so changing a job here only changes the job."}
                    </p>
                  )}
                </div>
              </Panel>

              <Panel
                title="Other jobs on this machine"
                count={otherJobs.length}
                padding="none"
                actions={
                  <UILink href={`/maintenance?machine=${record.machineId}`} className={cx("text-xs", TEXT_LINK)}>
                    All jobs
                  </UILink>
                }
              >
                {otherJobs.length === 0 ? (
                  <EmptyState title="No other workshop jobs" description="This is the only job recorded on the machine." />
                ) : (
                  <Table bare minWidth={320} caption="Other workshop jobs on this machine">
                    <Thead>
                      <Tr>
                        <Th>Job</Th>
                        <Th className="w-[110px]">Status</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {otherJobs.slice(0, 6).map((job) => (
                        <Tr key={job.id}>
                          <Td>
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <UILink
                                href={`/maintenance/${job.id}?machineId=${job.machineId}`}
                                className="whitespace-nowrap text-sm font-medium text-ink-strong no-underline hover:underline"
                              >
                                {MAINTENANCE_TYPE_LABEL[job.maintenanceType]}
                              </UILink>
                              <span className="font-mono text-[11px] text-meta-light">
                                {formatDateRange(job.startDate, job.endDate, "no end date")}
                              </span>
                            </div>
                          </Td>
                          <Td>
                            <Status domain="maintenance" value={job.status} size="sm" />
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                )}
              </Panel>
            </>
          }
        />
      </PageBody>

      <MaintenanceTransitionDialog
        organizationId={organizationId}
        transition={transition}
        machine={machine}
        otherInProgress={otherInProgress}
        onClose={() => setTransition(null)}
        onDone={() => void reload()}
      />
      {machine && (
        <MaintenanceFormDialog
          open={formOpen}
          onClose={() => setFormOpen(false)}
          organizationId={organizationId}
          machine={machine}
          rentals={data.rentals}
          onSaved={() => void reload()}
        />
      )}
    </div>
  );
}

/** Matches the page: header band, then a main card and an aside. */
function JobSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading workshop job" className="flex flex-col">
      <div className="flex flex-col gap-3.5 border-b border-border-header bg-surface px-6 pb-4 pt-3.5 max-[760px]:px-4">
        <Skeleton className="h-2.5 w-[200px]" />
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-1 flex-col gap-[9px]">
            <Skeleton className="h-5 w-[280px] max-w-[80%]" />
            <Skeleton className="h-3 w-[360px] max-w-[90%]" />
          </div>
          <Skeleton className="h-[34px] w-[150px] rounded-control" />
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-3.5 px-6 py-4 max-[760px]:px-4">
        <div className="h-[320px] min-w-0 flex-[1_1_560px] rounded-panel border border-border-soft bg-surface" />
        <div className="h-[220px] min-w-0 flex-[1_1_300px] rounded-panel border border-border-soft bg-surface min-[1180px]:max-w-[380px]" />
      </div>
      <span role="status" className="px-6 text-xs text-meta">
        Loading workshop job…
      </span>
    </div>
  );
}
