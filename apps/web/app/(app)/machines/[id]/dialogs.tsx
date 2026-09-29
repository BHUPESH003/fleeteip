"use client";

import { MachineStatus } from "@fleetip/contracts/equipment";
import { MaintenanceStatus, MaintenanceType, maintenanceTypeSchema, type MaintenanceRecord } from "@fleetip/contracts/maintenance";
import type { Rental } from "@fleetip/contracts/rental";
import { ConfirmDialog, FormBanner, Input, Select, Textarea, useToast } from "@fleetip/ui";
import { useEffect, useMemo } from "react";
import { z } from "zod";
import { apiClient } from "../../../../lib/api-client";
import { describeError } from "../../../../lib/errors";
import { useAction, useForm } from "../../../../lib/form";
import { formatDate, formatDateRange, formatMoney, rentalRef, todayIsoDate } from "../../../../lib/format";
import { MAINTENANCE_TYPE_LABEL, MAINTENANCE_TYPE_OPTIONS, conflictingRental } from "../shared";
import { activeRental, inProgressJob, receivables, type MachineData } from "./derive";

interface DialogBase {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  data: MachineData;
  onChanged: () => void;
}

type WorkshopValues = Record<"maintenanceType" | "startDate" | "endDate" | "notes", string>;

function workshopInitial(today: string): WorkshopValues {
  return { maintenanceType: MaintenanceType.breakdown, startDate: today, endDate: "", notes: "" };
}

/** Field names match createMaintenanceRequestSchema so API issues land under the right field. */
function workshopSchema(machineId: string, rentals: Rental[]) {
  return z
    .object({
      maintenanceType: z.string().min(1, "Choose a reason.").pipe(maintenanceTypeSchema),
      startDate: z.string().min(1, "Pick the day the machine goes in."),
      endDate: z.string(),
      notes: z.string().max(2000, "Notes are up to 2,000 characters."),
    })
    .superRefine(({ startDate: start, endDate: end }, ctx) => {
      const blocker = start ? conflictingRental(rentals, start, end || null) : null;
      if (blocker)
        ctx.addIssue({
          code: "custom",
          path: ["startDate"],
          message: `${rentalRef(blocker.id)} is booked ${formatDateRange(blocker.startDate, blocker.endDate)}. Workshop dates can't overlap a booked rental — end or mark it off rent first, or pick later dates.`,
        });
      if (end && start && end < start) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date cannot be before the start date." });
    })
    .transform(({ maintenanceType, startDate, endDate, notes }) => ({
      machineId,
      maintenanceType,
      startDate,
      endDate: endDate || undefined,
      notes: notes.trim() || undefined,
    }));
}

/**
 * Send to workshop — three writes, said out loud: create the job (the API
 * always creates it Scheduled), mark it In progress, set the machine Under
 * maintenance. Undo reverses the last two (cancel the job, machine Active).
 */
export function WorkshopDialog({ open, onClose, organizationId, data, onChanged }: DialogBase) {
  const toast = useToast();
  const today = todayIsoDate();
  const { machine } = data;
  const schema = useMemo(() => workshopSchema(machine.id, data.rentals), [machine.id, data.rentals]);
  const form = useForm({ schema, initial: workshopInitial(today), failTitle: "Nothing was changed" });
  const { reset } = form;

  useEffect(() => {
    if (open) reset(workshopInitial(today));
  }, [open, today, reset]);

  // The confirm button stays disabled while anything is invalid, so rule errors show from the start rather than after a submit.
  const check = schema.safeParse(form.values);
  const errorOf = (name: keyof WorkshopValues) =>
    form.errors[name] ?? (check.success ? undefined : check.error.issues.find((issue) => issue.path[0] === name)?.message);

  const active = activeRental(data);

  const confirm = form.submit(async (request) => {
    const job = (await apiClient.createMaintenance(organizationId, request)) as MaintenanceRecord;
    // Partial success: the job exists now, so a failed follow-up write is a toast that says what was saved, not the banner.
    try {
      await apiClient.updateMaintenanceStatus(organizationId, job.id, MaintenanceStatus.in_progress);
      await apiClient.updateMachineStatus(organizationId, machine.id, MachineStatus.under_maintenance);
    } catch (err) {
      toast.error({
        title: `The workshop job was created, but ${machine.assetCode} isn't marked Under maintenance`,
        body: `${describeError(err).body} Use Send to workshop again or open the job in Maintenance.`,
      });
      onClose();
      onChanged();
      return;
    }
    toast.success({
      title: `${machine.assetCode} is under maintenance`,
      body: `${MAINTENANCE_TYPE_LABEL[request.maintenanceType]} job created and in progress. Status changed from Active.`,
      undo: async () => {
        // Undo runs from the toast after the dialog has closed, so its failure is a toast too.
        try {
          await apiClient.updateMaintenanceStatus(organizationId, job.id, MaintenanceStatus.cancelled);
          await apiClient.updateMachineStatus(organizationId, machine.id, MachineStatus.active);
          toast.info({ title: "Undone", body: `${machine.assetCode} is Active again and the workshop job was cancelled.` });
        } catch (err) {
          toast.error({ title: "Couldn't undo", body: describeError(err).body });
        }
        onChanged();
      },
    });
    onClose();
    onChanged();
  });

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={() => void confirm()}
      icon="maintenance"
      tone="warning"
      title={`Send ${machine.assetCode} to the workshop?`}
      description="This saves three changes:"
      consequences={[
        "Creates a workshop job with the reason and dates below, marked In progress.",
        "Sets machine status to Under maintenance — it won't show as available for new quotations or rentals.",
        active
          ? `${rentalRef(active.id)} stays Active. If the customer is going off rent, change the rental separately.`
          : "No rental is changed.",
      ]}
      cancelLabel="Keep it in service"
      confirmLabel="Send to workshop"
      busyLabel="Sending…"
      busy={form.busy}
      confirmDisabled={!form.valid}
    >
      {form.banner && (
        <FormBanner tone="error" title={form.banner.title}>
          {form.banner.body}
        </FormBanner>
      )}
      <Select label="Reason for workshop" required options={MAINTENANCE_TYPE_OPTIONS} {...form.field("maintenanceType")} error={errorOf("maintenanceType")} />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Input label="In workshop from" required type="date" mono {...form.field("startDate")} error={errorOf("startDate")} />
        <Input
          label="Expected back"
          type="date"
          mono
          min={form.values.startDate || undefined}
          {...form.field("endDate")}
          error={errorOf("endDate")}
          hint="Leave empty if not known. It can't be added later yet."
        />
      </div>
      <Textarea label="Notes" rows={2} {...form.field("notes")} error={errorOf("notes")} hint="What happened, where the machine is." />
    </ConfirmDialog>
  );
}

/**
 * Mark job complete — two writes (job Completed, machine Active), or only
 * the status write when no job is in progress. Completing is final, so
 * there's no Undo.
 */
export function CompleteJobDialog({ open, onClose, organizationId, data, onChanged }: DialogBase) {
  const toast = useToast();
  const { machine } = data;
  const job = inProgressJob(data);
  const active = activeRental(data);
  const action = useAction();

  useEffect(() => {
    if (open) action.clear();
    // action.clear is a new function each render; listing it would re-run this on every render.
  }, [open]);

  const confirm = () =>
    action.run(
      async () => {
        if (job) await apiClient.updateMaintenanceStatus(organizationId, job.id, MaintenanceStatus.completed);
        // Partial success: once the job is completed (or when there's no job), a failed status write is a toast, not "Nothing was changed".
        try {
          await apiClient.updateMachineStatus(organizationId, machine.id, MachineStatus.active);
          return true;
        } catch (err) {
          toast.error({
            title: job ? `The job is completed, but ${machine.assetCode} is still Under maintenance` : `Couldn't set ${machine.assetCode} to Active`,
            body: describeError(err).body,
          });
          return false;
        }
      },
      {
        failTitle: "Nothing was changed",
        onDone: (activeAgain) => {
          if (activeAgain)
            toast.success({
              title: `${machine.assetCode} is Active again`,
              body: job ? `${MAINTENANCE_TYPE_LABEL[job.maintenanceType]} job completed. Status changed from Under maintenance.` : "Status changed from Under maintenance.",
            });
          onClose();
          onChanged();
        },
      },
    );

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={() => void confirm()}
      icon="check"
      tone="success"
      title={job ? `Mark the ${MAINTENANCE_TYPE_LABEL[job.maintenanceType].toLowerCase()} job complete?` : `Set ${machine.assetCode} back to Active?`}
      description={job ? "This makes two changes at once:" : "No workshop job is in progress on this machine, so only the status changes:"}
      consequences={[
        ...(job
          ? [
              `Sets the job (in since ${formatDate(job.startDate)}) to Completed. Its dates aren't changed — FleetIP can't edit a job's dates yet.`,
            ]
          : []),
        "Sets machine status back to Active — it can be quoted and rented again.",
        ...(active ? [`${rentalRef(active.id)} is not changed.`] : []),
      ]}
      cancelLabel="Not yet"
      confirmLabel={job ? "Mark complete" : "Set to Active"}
      busyLabel="Saving…"
      busy={action.busy}
    >
      {action.banner && (
        <FormBanner tone="error" title={action.banner.title}>
          {action.banner.body}
        </FormBanner>
      )}
    </ConfirmDialog>
  );
}

/** Retire — final (the API refuses to leave Retired). Guarded here against booked rentals; the API doesn't check. */
export function RetireDialog({
  open,
  onClose,
  organizationId,
  data,
  onChanged,
  productLabel,
}: DialogBase & { productLabel: string | null }) {
  const { machine } = data;
  const action = useAction();
  const money = data.access.billing ? receivables(data) : null;

  useEffect(() => {
    if (open) action.clear();
    // action.clear is a new function each render; listing it would re-run this on every render.
  }, [open]);

  const confirm = () =>
    action.run(() => apiClient.updateMachineStatus(organizationId, machine.id, MachineStatus.retired), {
      failTitle: "Nothing was changed",
      success: () => ({
        title: `${machine.assetCode} retired`,
        body: `Status changed from ${machine.status === MachineStatus.active ? "Active" : "Under maintenance"}. History is kept.`,
      }),
      onDone: () => {
        onClose();
        onChanged();
      },
    });

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={() => void confirm()}
      icon="retire"
      tone="danger"
      title={`Retire ${machine.assetCode}?`}
      description={[productLabel, machine.registrationNumber].filter(Boolean).join(" · ")}
      consequences={[
        "It won't appear in availability searches, on new quotations or rentals.",
        "Rental, workshop, logsheet and invoice history stays as it is.",
        ...(money && money.outstanding > 0 ? [`${formatMoney(money.outstanding)} outstanding on its rentals can still be collected.`] : []),
        "Retiring is final — a retired machine can't be made Active again.",
      ]}
      cancelLabel="Keep active"
      confirmLabel="Retire machine"
      busyLabel="Retiring…"
      confirmVariant="danger"
      busy={action.busy}
    >
      {action.banner && (
        <FormBanner tone="error" title={action.banner.title}>
          {action.banner.body}
        </FormBanner>
      )}
    </ConfirmDialog>
  );
}
