"use client";

import { MachineStatus, type Machine } from "@fleetip/contracts/equipment";
import { MaintenanceStatus, MaintenanceType, type MaintenanceRecord } from "@fleetip/contracts/maintenance";
import type { Rental } from "@fleetip/contracts/rental";
import {
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FormBanner,
  Menu,
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
  useToast,
} from "@fleetip/ui";
import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { useConnection } from "../../../lib/connection";
import { describeError, OFFLINE_HINT } from "../../../lib/errors";
import { useAction } from "../../../lib/form";
import { formatDate, formatDateRange } from "../../../lib/format";
import { Status } from "../../../lib/status";
import { MaintenanceFormDialog } from "./MaintenanceFormDialog";
import { MAINTENANCE_TYPE_LABEL, blocksAvailability } from "./shared";

type Transition = { record: MaintenanceRecord; to: Exclude<MaintenanceStatus, typeof MaintenanceStatus.scheduled> };

/**
 * One machine's workshop jobs with their status transitions (Scheduled →
 * In progress → Completed, or Cancelled). Starting or completing a job can
 * also move the machine's own status, since the two are stored separately —
 * the confirmation offers it and says which writes happen.
 */
export function MaintenancePanel({
  organizationId,
  machine,
  rentals = [],
  onMachineChanged,
  title = "Workshop jobs",
}: {
  organizationId: string;
  machine: Machine;
  /** The machine's rentals, used to stop a new job overlapping a booking. */
  rentals?: Rental[];
  onMachineChanged?: () => void;
  title?: string;
}) {
  const toast = useToast();
  const { online } = useConnection();
  const [records, setRecords] = useState<MaintenanceRecord[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [transition, setTransition] = useState<Transition | null>(null);
  const [alsoMachine, setAlsoMachine] = useState(true);
  const action = useAction();

  async function refresh() {
    try {
      const list = (await apiClient.listMaintenanceForMachine(organizationId, machine.id)) as MaintenanceRecord[];
      setRecords([...list].sort((a, b) => b.startDate.localeCompare(a.startDate)));
      setError(null);
    } catch (err) {
      setError(err);
    }
  }

  useEffect(() => {
    setRecords(null);
    void refresh();
  }, [organizationId, machine.id]);

  useEffect(() => {
    if (!transition) return;
    action.clear();
    setAlsoMachine(
      transition.to === MaintenanceStatus.in_progress
        ? machine.status === MachineStatus.active
        : transition.to !== MaintenanceStatus.cancelled || machine.status === MachineStatus.under_maintenance,
    );
    // action.clear is a new function each render; listing it would re-run this on every render.
  }, [transition, machine.status]);

  // Which machine-status write, if any, goes with this job transition.
  const machineWrite =
    !transition || machine.status === MachineStatus.retired
      ? null
      : transition.to === MaintenanceStatus.in_progress && machine.status === MachineStatus.active
        ? MachineStatus.under_maintenance
        : (transition.to === MaintenanceStatus.completed || transition.to === MaintenanceStatus.cancelled) && machine.status === MachineStatus.under_maintenance
          ? MachineStatus.active
          : null;
  const otherInProgress = (records ?? []).some((r) => r.status === MaintenanceStatus.in_progress && r.id !== transition?.record.id);

  function confirmTransition() {
    if (!transition) return;
    const { record, to } = transition;
    const writeMachine = machineWrite && alsoMachine ? machineWrite : null;
    void action.run(
      async () => {
        await apiClient.updateMaintenanceStatus(organizationId, record.id, to);
        if (!writeMachine) return false;
        // Partial success: the job is already updated, so a failed machine write is a toast, not "Nothing was changed".
        try {
          await apiClient.updateMachineStatus(organizationId, machine.id, writeMachine);
          return true;
        } catch (err) {
          toast.error({ title: `The job was updated, but ${machine.assetCode}'s status didn't change`, body: describeError(err).body });
          return false;
        }
      },
      {
        failTitle: "Nothing was changed",
        success: (machineMoved) => ({
          title: `${MAINTENANCE_TYPE_LABEL[record.maintenanceType]} job ${to === MaintenanceStatus.in_progress ? "started" : to === MaintenanceStatus.completed ? "completed" : "cancelled"}`,
          body: machineMoved
            ? `${machine.assetCode} is now ${writeMachine === MachineStatus.active ? "Active" : "Under maintenance"}.`
            : `${machine.assetCode}'s status wasn't changed.`,
        }),
        onDone: (machineMoved) => {
          setTransition(null);
          void refresh().then(() => {
            if (machineMoved) onMachineChanged?.();
          });
        },
      },
    );
  }

  if (error && !records) {
    return (
      <ErrorState
        title="Workshop jobs didn't load"
        message={describeError(error).body}
        action={
          <Button variant="secondary" size="sm" onClick={() => void refresh()}>
            Try again
          </Button>
        }
      />
    );
  }

  const canWrite = online && machine.status !== MachineStatus.retired;

  return (
    <Panel
      title={title}
      count={records?.length}
      subtitle={machine.assetCode}
      padding="none"
      actions={
        <Button
          size="sm"
          variant="secondary"
          icon="plus"
          onClick={() => setFormOpen(true)}
          disabled={!canWrite}
          title={
            machine.status === MachineStatus.retired
              ? "Retired machines can't get new workshop jobs."
              : !online
                ? OFFLINE_HINT
                : undefined
          }
        >
          Log maintenance
        </Button>
      }
    >
      {records === null ? (
        <div className="flex flex-col gap-2 px-4 py-4">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ) : records.length === 0 ? (
        <EmptyState
          title="No workshop jobs recorded"
          description="Plan a service, or log a breakdown or inspection that already happened."
        />
      ) : (
        <Table bare minWidth={680} caption={`Workshop jobs on ${machine.assetCode}`}>
          <Thead>
            <Tr>
              <Th className="w-[150px]">Reason</Th>
              <Th className="w-[170px]">Dates</Th>
              <Th>Notes</Th>
              <Th className="w-[118px]">Status</Th>
              <Th className="w-[150px]">
                <span className="sr-only">Actions</span>
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {records.map((record) => {
              const next = record.status === MaintenanceStatus.scheduled ? MaintenanceStatus.in_progress : record.status === MaintenanceStatus.in_progress ? MaintenanceStatus.completed : null;
              return (
                <Tr key={record.id}>
                  <Td>
                    <UILink
                      href={`/maintenance/${record.id}?machineId=${machine.id}`}
                      className={cx("text-sm font-medium no-underline hover:underline", record.maintenanceType === MaintenanceType.breakdown ? "text-destructive" : "text-ink-strong")}
                    >
                      {MAINTENANCE_TYPE_LABEL[record.maintenanceType]}
                    </UILink>
                    {blocksAvailability(record.status) && (
                      <span className="mt-0.5 block text-[11px] text-attention">Blocks new rentals</span>
                    )}
                  </Td>
                  <Td className={cx("font-mono text-xs", !record.endDate && record.status !== MaintenanceStatus.completed && "text-destructive")}>
                    {formatDateRange(record.startDate, record.endDate, "no end date")}
                  </Td>
                  <Td className="text-ink-muted">
                    <span className="clamp-2" title={record.notes ?? undefined}>
                      {record.notes ?? <span className="italic text-disabled-text">No notes</span>}
                    </span>
                  </Td>
                  <Td>
                    <Status domain="maintenance" value={record.status} size="sm" />
                  </Td>
                  <Td>
                    {canWrite && next && (
                      <span className="flex items-center justify-end gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => setTransition({ record, to: next })}>
                          {next === MaintenanceStatus.in_progress ? "Start job" : "Complete"}
                        </Button>
                        <Menu
                          label={`More actions for the ${MAINTENANCE_TYPE_LABEL[record.maintenanceType].toLowerCase()} job`}
                          triggerSize="sm"
                          items={[
                            {
                              key: "cancel",
                              label: "Cancel job",
                              icon: "close",
                              danger: true,
                              hint: "Kept on record as Cancelled. It stops blocking new rentals.",
                              onSelect: () => setTransition({ record, to: MaintenanceStatus.cancelled }),
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

      <MaintenanceFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        organizationId={organizationId}
        machine={machine}
        rentals={rentals}
        onSaved={() => void refresh()}
      />

      <ConfirmDialog
        open={transition !== null}
        onClose={() => setTransition(null)}
        onConfirm={confirmTransition}
        busy={action.busy}
        busyLabel="Saving…"
        icon={transition?.to === MaintenanceStatus.cancelled ? "close" : transition?.to === MaintenanceStatus.completed ? "check" : "maintenance"}
        tone={transition?.to === MaintenanceStatus.cancelled ? "danger" : transition?.to === MaintenanceStatus.completed ? "success" : "warning"}
        confirmVariant={transition?.to === MaintenanceStatus.cancelled ? "danger" : "primary"}
        title={
          transition
            ? `${transition.to === MaintenanceStatus.in_progress ? "Start" : transition.to === MaintenanceStatus.completed ? "Complete" : "Cancel"} the ${MAINTENANCE_TYPE_LABEL[transition.record.maintenanceType].toLowerCase()} job?`
            : ""
        }
        description={transition ? `${machine.assetCode} · ${formatDate(transition.record.startDate)}` : undefined}
        consequences={
          transition
            ? [
                transition.to === MaintenanceStatus.in_progress
                  ? "Marks the job In progress."
                  : transition.to === MaintenanceStatus.completed
                    ? "Marks the job Completed. Its dates aren't changed — they can't be edited after creation."
                    : "Marks the job Cancelled. It stays on record and stops blocking new rentals.",
                ...(machineWrite
                  ? [
                      alsoMachine
                        ? `Also sets ${machine.assetCode} to ${machineWrite === MachineStatus.active ? "Active" : "Under maintenance"} — a second write.`
                        : `${machine.assetCode} stays ${machine.status === MachineStatus.active ? "Active" : "Under maintenance"}.`,
                    ]
                  : []),
              ]
            : []
        }
        cancelLabel={transition?.to === MaintenanceStatus.cancelled ? "Keep job" : "Not yet"}
        confirmLabel={transition?.to === MaintenanceStatus.in_progress ? "Start job" : transition?.to === MaintenanceStatus.completed ? "Complete job" : "Cancel job"}
      >
        {action.banner && <FormBanner title={action.banner.title}>{action.banner.body}</FormBanner>}
        {machineWrite && (
          <Checkbox
            label={machineWrite === MachineStatus.active ? `Set ${machine.assetCode} back to Active` : `Set ${machine.assetCode} to Under maintenance`}
            description={
              machineWrite === MachineStatus.active
                ? otherInProgress
                  ? "Another job on this machine is still in progress — leave this unticked if the machine is still in the workshop."
                  : "The machine can be quoted and rented again."
                : "It won't show as available for new quotations or rentals while the job runs."
            }
            checked={alsoMachine}
            onChange={(e) => setAlsoMachine(e.target.checked)}
          />
        )}
      </ConfirmDialog>
    </Panel>
  );
}
