"use client";

import type { Machine } from "@fleetip/contracts/equipment";
import { MaintenanceStatus, MaintenanceType, maintenanceTypeSchema, type CreateMaintenanceRequest, type MaintenanceRecord } from "@fleetip/contracts/maintenance";
import { RentalStatus, type Rental } from "@fleetip/contracts/rental";
import { Button, Checkbox, Dialog, FormBanner, Input, RadioGroup, Select, Textarea, useToast } from "@fleetip/ui";
import { useEffect, useMemo } from "react";
import { z } from "zod";
import { apiClient } from "../../../lib/api-client";
import { useForm } from "../../../lib/form";
import { formatDateRange, rentalRef, todayIsoDate } from "../../../lib/format";
import { MAINTENANCE_TYPE_OPTIONS } from "./shared";

type Outcome = typeof MaintenanceStatus.scheduled | typeof MaintenanceStatus.completed;

type Values = { outcome: Outcome; linkRental: boolean } & Record<"maintenanceType" | "startDate" | "endDate" | "notes", string>;

function initialValues(today: string): Values {
  return { outcome: MaintenanceStatus.scheduled, maintenanceType: "", startDate: today, endDate: "", notes: "", linkRental: false };
}

/**
 * Field names match the request so API issues land under the right field.
 * Overlaps with a booked rental are the API's to refuse: its 409 names the
 * rental and lands under "startDate".
 */
function maintenanceSchema(machine: Machine, active: Rental | null, today: string) {
  return z
    .object({
      outcome: z.enum([MaintenanceStatus.scheduled, MaintenanceStatus.completed]),
      maintenanceType: z.string().min(1, "Choose what kind of job this is.").pipe(maintenanceTypeSchema),
      startDate: z.string().min(1, "Pick the day the job starts or started."),
      endDate: z.string(),
      notes: z.string().superRefine((notes, ctx) => {
        if (notes.length > 2000) ctx.addIssue({ code: "custom", message: `Notes are up to 2,000 characters. This has ${notes.length.toLocaleString("en-IN")}.` });
      }),
      linkRental: z.boolean(),
    })
    .superRefine(({ outcome, startDate: start, endDate: end }, ctx) => {
      const completed = outcome === MaintenanceStatus.completed;
      const message =
        end && start && end < start
          ? "The end date can't be before the start date."
          : completed && !end
            ? "A completed job needs the day it finished."
            : completed && end > today
              ? "A completed job can't finish in the future. Pick today or earlier, or plan it instead."
              : null;
      if (message) ctx.addIssue({ code: "custom", path: ["endDate"], message });
    })
    .transform(({ outcome, maintenanceType, startDate, endDate, notes, linkRental }) => ({
      outcome,
      request: {
        machineId: machine.id,
        maintenanceType,
        startDate,
        endDate: endDate || undefined,
        notes: notes.trim() || undefined,
        rentalId: linkRental && active ? active.id : undefined,
      } satisfies CreateMaintenanceRequest,
    }));
}

/**
 * Log or plan a workshop job without changing the machine's status (use
 * "Send to workshop" for that). One write either way: planned jobs are
 * created Scheduled, jobs that already happened are created Completed.
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
  /** This machine's rentals — an active one can be linked (a breakdown on site). */
  rentals: Rental[];
  onSaved: (record: MaintenanceRecord) => void;
}) {
  const toast = useToast();
  const today = todayIsoDate();
  const active = rentals.find((r) => r.machineId === machine.id && r.status === RentalStatus.active) ?? null;
  const schema = useMemo(() => maintenanceSchema(machine, active, today), [machine, active, today]);
  const form = useForm({ schema, initial: initialValues(today), failTitle: "The workshop job wasn't saved" });
  const { reset } = form;
  const { outcome, startDate: start } = form.values;
  const completed = outcome === MaintenanceStatus.completed;

  useEffect(() => {
    if (open) reset(initialValues(today));
  }, [open, today, reset]);

  const save = form.submit(async ({ outcome, request }) => {
    const record =
      outcome === MaintenanceStatus.completed
        ? ((await apiClient.logCompletedMaintenance(organizationId, request)) as MaintenanceRecord)
        : ((await apiClient.createMaintenance(organizationId, request)) as MaintenanceRecord);
    toast.success({
      title: outcome === MaintenanceStatus.completed ? `Workshop job logged on ${machine.assetCode}` : `Workshop job planned on ${machine.assetCode}`,
      body: `${MAINTENANCE_TYPE_OPTIONS.find((o) => o.value === request.maintenanceType)?.label} · ${formatDateRange(request.startDate, request.endDate ?? null, "no end date")}. Machine status didn't change.`,
    });
    onSaved(record);
    onClose();
  });

  // The end date's conflicts show as soon as a date is picked, not on blur.
  const endField = form.field("endDate");
  const typeField = form.field("maintenanceType");

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
          { value: MaintenanceStatus.completed, label: "Already done", description: "Saved as Completed. It doesn't block rentals." },
        ]}
      />
      <Select
        label="Reason"
        required
        placeholder="Choose a reason"
        options={MAINTENANCE_TYPE_OPTIONS}
        {...typeField}
        onChange={(e) => {
          typeField.onChange(e);
          // A breakdown while the machine is on rent almost always happened on that rental.
          if (active && e.target.value === MaintenanceType.breakdown) form.set("linkRental", true);
        }}
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
      {active && (
        <Checkbox
          label={`Log it against ${rentalRef(active.id)}`}
          description={`${rentalRef(active.id)} is on rent now. A linked job shows on its Workshop tab, and its dates don't block the job.`}
          checked={form.values.linkRental}
          onChange={(event) => form.set("linkRental", event.target.checked)}
        />
      )}
    </Dialog>
  );
}
