"use client";

import { MachineStatus, type Machine } from "@fleetip/contracts/equipment";
import { MaintenanceStatus, type MaintenanceRecord } from "@fleetip/contracts/maintenance";
import { Checkbox, ConfirmDialog, FormBanner, useToast } from "@fleetip/ui";
import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { describeError } from "../../../lib/errors";
import { useAction } from "../../../lib/form";
import { formatDate } from "../../../lib/format";
import { MAINTENANCE_TYPE_LABEL } from "../machines/shared";

export type MaintenanceTarget = Exclude<MaintenanceStatus, typeof MaintenanceStatus.scheduled>;

export interface MaintenanceTransition {
  record: MaintenanceRecord;
  to: MaintenanceTarget;
}

const VERB: Record<MaintenanceTarget, { title: string; confirm: string; past: string }> = {
  in_progress: { title: "Start", confirm: "Start job", past: "started" },
  completed: { title: "Complete", confirm: "Complete job", past: "completed" },
  cancelled: { title: "Cancel", confirm: "Cancel job", past: "cancelled" },
};

/** The job status that follows the current one, if any (scheduled → in progress → completed). */
export function nextMaintenanceStep(record: MaintenanceRecord): typeof MaintenanceStatus.in_progress | typeof MaintenanceStatus.completed | null {
  if (record.status === MaintenanceStatus.scheduled) return MaintenanceStatus.in_progress;
  if (record.status === MaintenanceStatus.in_progress) return MaintenanceStatus.completed;
  return null;
}

export function canCancelMaintenance(record: MaintenanceRecord): boolean {
  return record.status === MaintenanceStatus.scheduled || record.status === MaintenanceStatus.in_progress;
}

/**
 * Start / complete / cancel a workshop job. The job's status and the
 * machine's own status are stored separately, so — like MaintenancePanel —
 * the confirmation offers the matching machine write and says it's a
 * second write. Without the machine record (no Equipment permission) only
 * the job changes, and the dialog says so. None of these can be undone:
 * the API has no way back to Scheduled or out of Completed/Cancelled.
 */
export function MaintenanceTransitionDialog({
  organizationId,
  transition,
  machine,
  otherInProgress,
  onClose,
  onDone,
}: {
  organizationId: string;
  transition: MaintenanceTransition | null;
  /** The job's machine, or null when the role can't view machines. */
  machine: Machine | null;
  /** Another job on the same machine is still in progress. */
  otherInProgress: boolean;
  onClose: () => void;
  onDone: (result: { machineMoved: boolean }) => void;
}) {
  const toast = useToast();
  const [alsoMachine, setAlsoMachine] = useState(true);
  const action = useAction();

  // Which machine-status write, if any, goes with this job transition.
  const machineWrite =
    !transition || !machine || machine.status === MachineStatus.retired
      ? null
      : transition.to === MaintenanceStatus.in_progress && machine.status === MachineStatus.active
        ? MachineStatus.under_maintenance
        : (transition.to === MaintenanceStatus.completed || transition.to === MaintenanceStatus.cancelled) && machine.status === MachineStatus.under_maintenance
          ? MachineStatus.active
          : null;

  useEffect(() => {
    if (!transition) return;
    action.clear();
    // Default to the matching machine write — except handing a machine back
    // while another job on it is still running.
    setAlsoMachine(machineWrite === MachineStatus.active ? !otherInProgress : true);
    // action.clear is a new function each render; listing it would re-run this on every render.
  }, [transition, machineWrite, otherInProgress]);

  if (!transition) {
    return (
      <ConfirmDialog open={false} onClose={onClose} onConfirm={() => undefined} title="" confirmLabel="" />
    );
  }

  const { record, to } = transition;
  const typeLabel = MAINTENANCE_TYPE_LABEL[record.maintenanceType];
  const asset = machine?.assetCode ?? "the machine";
  const verb = VERB[to];

  const writeMachine = machine && machineWrite && alsoMachine ? { machine, status: machineWrite } : null;
  const confirm = () =>
    action.run(
      async () => {
        await apiClient.updateMaintenanceStatus(organizationId, record.id, to);
        if (!writeMachine) return false;
        // Partial success: the job is already updated, so a failed machine write is a toast, not "Nothing was changed".
        try {
          await apiClient.updateMachineStatus(organizationId, writeMachine.machine.id, writeMachine.status);
          return true;
        } catch (err) {
          toast.error({
            title: `The job was ${verb.past}, but ${writeMachine.machine.assetCode}'s status didn't change`,
            body: `${describeError(err).body} Change it from the machine page.`,
          });
          return false;
        }
      },
      {
        failTitle: "Nothing was changed",
        success: (machineMoved) => ({
          title: `${typeLabel} job on ${machine?.assetCode ?? "the machine"} ${verb.past}`,
          body: machineMoved
            ? `${machine?.assetCode} is now ${machineWrite === MachineStatus.active ? "Active" : "Under maintenance"}.`
            : machine
              ? `${machine.assetCode}'s own status wasn't changed.`
              : "The machine's own status wasn't changed from here.",
        }),
        onDone: (machineMoved) => {
          onClose();
          onDone({ machineMoved });
        },
      },
    );

  const jobLine =
    to === MaintenanceStatus.in_progress
      ? "Marks the job In progress. It keeps blocking new rentals over its dates."
      : to === MaintenanceStatus.completed
        ? "Marks the job Completed. Its dates aren't changed — they can't be edited after a job is created."
        : "Marks the job Cancelled. It stays on record and stops blocking new rentals.";

  const machineLine = !machine
    ? "The machine's own status isn't changed from here — your role can't view machines. Change it from the machine page if needed."
    : machineWrite
      ? alsoMachine
        ? `Also sets ${machine.assetCode} to ${machineWrite === MachineStatus.active ? "Active" : "Under maintenance"} — a second write.`
        : `${machine.assetCode} stays ${machine.status === MachineStatus.active ? "Active" : "Under maintenance"}.`
      : machine.status === MachineStatus.retired
        ? `${machine.assetCode} is retired, so its status isn't changed.`
        : `${machine.assetCode} stays ${machine.status === MachineStatus.active ? "Active" : "Under maintenance"}.`;

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={() => void confirm()}
      busy={action.busy}
      busyLabel="Saving…"
      icon={to === MaintenanceStatus.cancelled ? "close" : to === MaintenanceStatus.completed ? "check" : "maintenance"}
      tone={to === MaintenanceStatus.cancelled ? "danger" : to === MaintenanceStatus.completed ? "success" : "warning"}
      confirmVariant={to === MaintenanceStatus.cancelled ? "danger" : "primary"}
      title={`${verb.title} the ${typeLabel.toLowerCase()} job on ${asset}?`}
      description={`In the workshop from ${formatDate(record.startDate)}${record.endDate ? ` · expected back ${formatDate(record.endDate)}` : " · no end date"}`}
      consequences={[jobLine, machineLine, "This can't be undone — a job can't go back to an earlier status."]}
      cancelLabel={to === MaintenanceStatus.cancelled ? "Keep job" : "Not yet"}
      confirmLabel={verb.confirm}
    >
      {action.banner && <FormBanner title={action.banner.title}>{action.banner.body}</FormBanner>}
      {machine && machineWrite && (
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
          onChange={(event) => setAlsoMachine(event.target.checked)}
        />
      )}
    </ConfirmDialog>
  );
}
