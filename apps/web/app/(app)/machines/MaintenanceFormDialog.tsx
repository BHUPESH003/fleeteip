"use client";

import type { Machine } from "@fleetip/contracts/equipment";
import { MaintenanceStatus, maintenanceTypeSchema, type CreateMaintenanceRequest, type MaintenanceRecord } from "@fleetip/contracts/maintenance";
import type { Rental } from "@fleetip/contracts/rental";
import { Button, Dialog, FormBanner, Input, RadioGroup, Select, Textarea, useToast } from "@fleetip/ui";
import { useEffect, useMemo } from "react";
import { z } from "zod";
import { apiClient } from "../../../lib/api-client";
import { useForm } from "../../../lib/form";
import { formatDate, formatDateRange, rentalRef, todayIsoDate } from "../../../lib/format";
import { MAINTENANCE_TYPE_OPTIONS, conflictingRental } from "./shared";

type Outcome = typeof MaintenanceStatus.scheduled | typeof MaintenanceStatus.completed;

type Values = { outcome: Outcome } & Record<"maintenanceType" | "startDate" | "endDate" | "notes", string>;

function initialValues(today: string): Values {
  return { outcome: MaintenanceStatus.scheduled, maintenanceType: "", startDate: today, endDate: "", notes: "" };
}

/** Field names match the request so API issues land under the right field. */
function maintenanceSchema(machine: Machine, rentals: Rental[], today: string) {
  return z
    .object({
      outcome: z.enum([MaintenanceStatus.scheduled, MaintenanceStatus.completed]),
      maintenanceType: z.string().min(1, "Choose what kind of job this is.").pipe(maintenanceTypeSchema),
      startDate: z.string().min(1, "Pick the day the job starts or started."),
      endDate: z.string(),
      notes: z.string().superRefine((notes, ctx) => {
        if (notes.length > 2000) ctx.addIssue({ code: "custom", message: `Notes are up to 2,000 characters. This has ${notes.length.toLocaleString("en-IN")}.` });
      }),
    })
    .superRefine(({ outcome, startDate: start, endDate: end }, ctx) => {
      const completed = outcome === MaintenanceStatus.completed;
      const blocker = start ? conflictingRental(rentals, start, end || null) : null;
      const message =
        end && start && end < start
          ? "The end date can't be before the start date."
          : completed && !end
            ? "A completed job needs the day it finished."
            : completed && end > today
              ? "A completed job can't finish in the future. Pick today or earlier, or plan it instead."
              : blocker
                ? `${rentalRef(blocker.id)} is booked ${formatDateRange(blocker.startDate, blocker.endDate)}. Workshop dates can't overlap a booked rental.`
                : null;
      if (message) ctx.addIssue({ code: "custom", path: ["endDate"], message });
    })
    .transform(({ outcome, maintenanceType, startDate, endDate, notes }) => ({
      outcome,
      request: {
        machineId: machine.id,
        maintenanceType,
        startDate,
        endDate: endDate || undefined,
        notes: notes.trim() || undefined,
      } satisfies CreateMaintenanceRequest,
    }));
}

/**
 * Log or plan a workshop job without changing the machine's status (use
 * "Send to workshop" for that). The API always creates jobs as Scheduled,
 * so logging one that already happened takes three writes — create, mark
 * In progress, mark Completed — and the form says so.
 */
export function MaintenanceFormDialog({
  open,
  onClose,
  organizationId,
  machine,
  rentals,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  machine: Machine;
  /** This machine's rentals — a job can't overlap a booked rental (the API returns 409). */
  rentals: Rental[];
  onSaved: (record: MaintenanceRecord) => void;
}) {
  const toast = useToast();
  const today = todayIsoDate();
  const schema = useMemo(() => maintenanceSchema(machine, rentals, today), [machine, rentals, today]);
  const form = useForm({ schema, initial: initialValues(today), failTitle: "The workshop job wasn't saved" });
  const { reset } = form;
  const { outcome, startDate: start } = form.values;
  const completed = outcome === MaintenanceStatus.completed;

  useEffect(() => {
    if (open) reset(initialValues(today));
  }, [open, today, reset]);

  const save = form.submit(async ({ outcome, request }) => {
    // A create failure is the form's to show; after that the job exists.
    let record = (await apiClient.createMaintenance(organizationId, request)) as MaintenanceRecord;
    if (outcome === MaintenanceStatus.completed) {
      // Partial success: a failed status write after the create must say exactly what was saved, not "wasn't saved".
      let started = false;
      try {
        await apiClient.updateMaintenanceStatus(organizationId, record.id, MaintenanceStatus.in_progress);
        started = true;
        record = (await apiClient.updateMaintenanceStatus(organizationId, record.id, MaintenanceStatus.completed)) as MaintenanceRecord;
      } catch {
        toast.error({
          title: "The job was saved, but it isn't marked completed",
          body: `It's recorded as ${started ? "In progress" : "Scheduled"} from ${formatDate(request.startDate)}. Open it in Maintenance to complete it.`,
        });
        onSaved(record);
        onClose();
        return;
      }
    }
    toast.success({
      title: outcome === MaintenanceStatus.completed ? `Workshop job logged on ${machine.assetCode}` : `Workshop job planned on ${machine.assetCode}`,
      body: `${MAINTENANCE_TYPE_OPTIONS.find((o) => o.value === request.maintenanceType)?.label} · ${formatDateRange(request.startDate, request.endDate ?? null, "no end date")}. Machine status didn't change.`,
    });
    onSaved(record);
    onClose();
  });

  // The end date's conflicts show as soon as a date is picked, not on blur.
  const endField = form.field("endDate");

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Log maintenance on ${machine.assetCode}`}
      description="Record a job that already happened, or plan one. The machine's status doesn't change — use Send to workshop for a machine going in now."
      icon="maintenance"
      tone="warning"
      size="md"
      dismissible={!form.busy}
      onSubmit={save}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose} disabled={form.busy}>
            Cancel
          </Button>
          <Button type="submit" busy={form.busy} busyLabel="Saving…">
            {completed ? "Log completed job" : "Plan job"}
          </Button>
        </>
      }
    >
      {form.banner && (
        <FormBanner tone="error" title={form.banner.title}>
          {form.banner.body}
        </FormBanner>
      )}
      <RadioGroup
        label="This job is"
        required
        name="maintenance-outcome"
        value={outcome}
        onChange={(v) => form.set("outcome", v as Outcome)}
        options={[
          { value: MaintenanceStatus.scheduled, label: "Planned", description: "Saved as Scheduled. It blocks new rentals over its dates." },
          { value: MaintenanceStatus.completed, label: "Already done", description: "Saved in three steps: created, marked In progress, then Completed." },
        ]}
      />
      <Select
        label="Reason"
        required
        placeholder="Choose a reason"
        options={MAINTENANCE_TYPE_OPTIONS}
        {...form.field("maintenanceType")}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="From"
          required
          type="date"
          mono
          {...form.field("startDate")}
          hint="Past dates are fine for a job that already happened."
        />
        <Input
          label={completed ? "Finished on" : "Expected back"}
          required={completed}
          type="date"
          mono
          {...endField}
          min={start || undefined}
          onChange={(e) => {
            endField.onChange(e);
            if (e.target.value) endField.onBlur();
          }}
          hint={completed ? undefined : "Leave empty if the return date isn't known yet."}
        />
      </div>
      <Textarea
        label="Notes"
        rows={3}
        {...form.field("notes")}
        hint="What was done or found, parts replaced, hour-meter reading."
      />
    </Dialog>
  );
}
