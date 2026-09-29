"use client";

import { MachineStatus } from "@fleetip/contracts/equipment";
import { MaintenanceStatus, MaintenanceType, maintenanceTypeSchema, type MaintenanceRecord } from "@fleetip/contracts/maintenance";
import type { Rental } from "@fleetip/contracts/rental";
import { Checkbox, ConfirmDialog, FormBanner, Input, Select, Textarea, useToast } from "@fleetip/ui";
import { useEffect, useMemo } from "react";
import { z } from "zod";
import { apiClient } from "../../../../lib/api-client";
import { describeError } from "../../../../lib/errors";
import { useAction, useForm } from "../../../../lib/form";
import { formatDate, formatMoney, rentalRef, todayIsoDate } from "../../../../lib/format";
import { MAINTENANCE_TYPE_LABEL, MAINTENANCE_TYPE_OPTIONS } from "../shared";
import { activeRental, inProgressJob, receivables, type MachineData } from "./derive";

interface DialogBase {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  data: MachineData;
  onChanged: () => void;
}

type WorkshopValues = Record<"maintenanceType" | "startDate" | "endDate" | "notes", string> & { linkRental: boolean };

function workshopInitial(today: string, active: Rental | null): WorkshopValues {
  // A machine going in while on rent is almost always a breakdown on site, so the link to that rental starts ticked.
  return { maintenanceType: MaintenanceType.breakdown, startDate: today, endDate: "", notes: "", linkRental: Boolean(active) };
}

/**
 * Field names match createMaintenanceRequestSchema so API issues land under
 * the right field. Overlaps with other rentals are the API's to refuse: its
 * 409 names the rental and lands under "startDate".
 */
function workshopSchema(machineId: string, active: Rental | null) {
  return z
    .object({
      maintenanceType: z.string().min(1, "Choose a reason.").pipe(maintenanceTypeSchema),
      startDate: z.string().min(1, "Pick the day the machine goes in."),
      endDate: z.string(),
      notes: z.string().max(2000, "Notes are up to 2,000 characters."),
      linkRental: z.boolean(),
    })
    .refine(({ startDate, endDate }) => !endDate || !startDate || endDate >= startDate, {
      path: ["endDate"],
      message: "End date cannot be before the start date.",
    })
    .transform(({ maintenanceType, startDate, endDate, notes, linkRental }) => ({
      machineId,
      maintenanceType,
      startDate,
      endDate: endDate || undefined,
      notes: notes.trim() || undefined,
      rentalId: linkRental && active ? active.id : undefined,
    }));
}

/**
 * Send to workshop — one write (the API creates the job In progress and sets
 * the machine Under maintenance in one transaction). Undo is one write too:
 * cancel the job and set the machine Active together.
 */
export function WorkshopDialog({ open, onClose, organizationId, data, onChanged }: DialogBase) {
  const toast = useToast();
  const today = todayIsoDate();
  const { machine } = data;
  const active = activeRental(data);
  const schema = useMemo(() => workshopSchema(machine.id, active), [machine.id, active]);
  // eager: the confirm button stays disabled while anything is invalid, so rule errors show from the start.
  const form = useForm({ schema, initial: workshopInitial(today, active), failTitle: "Nothing was changed", eager: true });
  const { reset } = form;

  useEffect(() => {
    if (open) reset(workshopInitial(today, active));
  }, [open, today, active, reset]);

  const confirm = form.submit(async (request) => {
    const job = (await apiClient.sendToWorkshop(organizationId, request)) as MaintenanceRecord;
    toast.success({
      title: `${machine.assetCode} is under maintenance`,
      body: `${MAINTENANCE_TYPE_LABEL[request.maintenanceType]} job created and in progress${request.rentalId ? ` against ${rentalRef(request.rentalId)}` : ""}. Status changed from Active.`,
      undo: async () => {
        // Undo runs from the toast after the dialog has closed, so its failure is a toast too.
        try {
          await apiClient.updateMaintenanceStatus(organizationId, job.id, MaintenanceStatus.cancelled, MachineStatus.active);
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
      description="This saves two changes together:"
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
      <Select label="Reason for workshop" required options={MAINTENANCE_TYPE_OPTIONS} {...form.field("maintenanceType")} />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Input label="In workshop from" required type="date" mono {...form.field("startDate")} />
        <Input
          label="Expected back"
          type="date"
          mono
          min={form.values.startDate || undefined}
          {...form.field("endDate")}
          hint="Leave empty if not known. It can't be added later yet."
        />
      </div>
      <Textarea label="Notes" rows={2} {...form.field("notes")} hint="What happened, where the machine is." />
      {active && (
        <Checkbox
          label={`Log it against ${rentalRef(active.id)}`}
          description="The job shows on that rental's Workshop tab, and the rental's dates don't block it."
          checked={form.values.linkRental}
          onChange={(event) => form.set("linkRental", event.target.checked)}
        />
      )}
    </ConfirmDialog>
  );
}

/**
 * Mark job complete — one write: the job Completed and the machine Active
 * together, or only the machine status when no job is in progress.
 * Completing is final, so there's no Undo.
 */
export function CompleteJobDialog({ open, onClose, organizationId, data, onChanged }: DialogBase) {
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
        if (job) await apiClient.updateMaintenanceStatus(organizationId, job.id, MaintenanceStatus.completed, MachineStatus.active);
        else await apiClient.updateMachineStatus(organizationId, machine.id, MachineStatus.active);
      },
      {
        failTitle: "Nothing was changed",
        success: () => ({
          title: `${machine.assetCode} is Active again`,
          body: job ? `${MAINTENANCE_TYPE_LABEL[job.maintenanceType]} job completed. Status changed from Under maintenance.` : "Status changed from Under maintenance.",
        }),
        onDone: () => {
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
      description={job ? "This makes two changes together:" : "No workshop job is in progress on this machine, so only the status changes:"}
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

/** Retire — final (the API refuses to leave Retired). The API also refuses while a rental is booked or a workshop job is open, and its 409 names it. */
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
