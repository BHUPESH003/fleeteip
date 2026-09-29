"use client";

import type { Rental } from "@fleetip/contracts/rental";
import { TransportLeg, TransportStatus, type TransportRecord, type UpdateTransportRequest } from "@fleetip/contracts/transport";
import { Button, ConfirmDialog, Dialog, FormBanner, Input, Textarea, useToast } from "@fleetip/ui";
import { useEffect, useMemo } from "react";
import { z } from "zod";
import { apiClient } from "../../../lib/api-client";
import { useAction, useForm } from "../../../lib/form";
import { formatDate, formatMoney, rentalRef, todayIsoDate } from "../../../lib/format";

/*
 * The transport actions TransportPanel offers (rentals/panels.tsx), for a
 * single leg: plan/edit, dispatch, deliver, cancel. Written again here
 * because the panel's own dialogs aren't exported; the rules are the same —
 * one record per leg per rental (a second create is a 409, so a cancelled
 * leg can't be planned again), actualDate can't be in the future, and a
 * recorded value can be corrected but not cleared (the API has no remove).
 */

export const LEG_LABEL: Record<TransportLeg, string> = { mobilization: "Mobilization", demobilization: "Demobilization" };
export const LEG_PURPOSE: Record<TransportLeg, string> = {
  mobilization: "The trip that takes the machine to site.",
  demobilization: "The trip that brings the machine back.",
};

type PlanValues = Record<"pickupLocation" | "destination" | "plannedDate" | "charges" | "transportDetails" | "notes", string>;

function planDefaults(leg: TransportLeg, rental: Rental | null, record: TransportRecord | null): PlanValues {
  const site = rental?.projectLocation ?? "";
  const charge = leg === TransportLeg.mobilization ? rental?.mobilizationCharge : rental?.demobilizationCharge;
  return {
    pickupLocation: record?.pickupLocation ?? (leg === TransportLeg.demobilization ? site : ""),
    destination: record?.destination ?? (leg === TransportLeg.mobilization ? site : ""),
    plannedDate: record?.plannedDate ?? (leg === TransportLeg.mobilization ? (rental?.startDate ?? "") : (rental?.endDate ?? "")),
    charges: record?.charges != null ? String(record.charges) : charge != null ? String(charge) : "",
    transportDetails: record?.transportDetails ?? "",
    notes: record?.notes ?? "",
  };
}

/** Field names match the request so API issues land under the right field. A recorded value can be corrected but not cleared (the API has no remove). */
function planSchema(record: TransportRecord | null) {
  return z
    .object({
      pickupLocation: z
        .string()
        .trim()
        .refine((v) => v.length <= 300, (v) => ({ message: `Pickup is up to 300 characters. This has ${v.length}.` }))
        .refine((v) => v || !record?.pickupLocation, "A recorded pickup can be corrected but not removed."),
      destination: z
        .string()
        .trim()
        .refine((v) => v.length <= 300, (v) => ({ message: `Destination is up to 300 characters. This has ${v.length}.` }))
        .refine((v) => v || !record?.destination, "A recorded destination can be corrected but not removed."),
      plannedDate: z.string().refine((v) => v || !record?.plannedDate, "A planned date can be changed but not removed."),
      charges: z
        .string()
        .trim()
        .refine((v) => v === "" || Number(v) >= 0, "Enter the charge as 0 or more, e.g. 18000, or leave it empty.")
        .refine((v) => v !== "" || record?.charges == null, "Recorded charges can be corrected but not removed. Enter 0 if there's no charge."),
      transportDetails: z
        .string()
        .trim()
        .max(1000, "Vehicle and details are up to 1,000 characters.")
        .refine((v) => v || !record?.transportDetails, "Recorded details can be corrected but not removed."),
      notes: z
        .string()
        .trim()
        .max(2000, "Notes are up to 2,000 characters.")
        .refine((v) => v || !record?.notes, "Recorded notes can be corrected but not removed."),
    })
    .transform((v) => ({
      pickupLocation: v.pickupLocation || undefined,
      destination: v.destination || undefined,
      plannedDate: v.plannedDate || undefined,
      transportDetails: v.transportDetails || undefined,
      charges: v.charges === "" ? undefined : Number(v.charges),
      notes: v.notes || undefined,
    }));
}

/**
 * Plan a leg (create) or edit its plan. Prefilled from the rental's site
 * and charges when the rental is known.
 */
export function TransportPlanDialog({
  open,
  onClose,
  organizationId,
  rentalId,
  rental,
  leg,
  record,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  rentalId: string;
  /** null when the role can't view the rental — no prefill, no date warnings. */
  rental: Rental | null;
  leg: TransportLeg;
  record: TransportRecord | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const schema = useMemo(() => planSchema(record), [record]);
  const ref = rentalRef(rentalId);
  const form = useForm({
    schema,
    initial: planDefaults(leg, rental, record),
    failTitle: "The trip wasn't saved",
    // A 409 here is always the one-record-per-leg rule.
    statusCopy: {
      409: {
        title: `${ref} already has a ${leg} record`,
        body: "FleetIP keeps one record per leg, so it can't be planned twice — a cancelled leg can't be planned again either. Reload to see it.",
      },
    },
  });
  const { reset, banner } = form;

  useEffect(() => {
    if (!open) return;
    reset(planDefaults(leg, rental, record));
    // defaults are read once per opening
  }, [open]);

  const planned = form.values.plannedDate;
  const plannedWarning =
    planned && rental && leg === TransportLeg.mobilization && planned > rental.startDate
      ? `That's after ${ref} starts (${formatDate(rental.startDate)}). The machine would arrive late.`
      : planned && rental && leg === TransportLeg.demobilization && rental.endDate && planned < rental.endDate
        ? `That's before ${ref} ends (${formatDate(rental.endDate)}).`
        : undefined;

  const save = form.submit(async (body) => {
    if (record) await apiClient.updateTransport(organizationId, rentalId, leg, body);
    else await apiClient.createTransport(organizationId, rentalId, { leg, ...body });
    toast.success({
      title: record ? `${LEG_LABEL[leg]} plan updated` : `${LEG_LABEL[leg]} planned`,
      body: `${ref}${body.plannedDate ? ` · ${formatDate(body.plannedDate)}` : " · no date set yet"}.`,
    });
    onSaved();
    onClose();
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${record ? "Edit" : "Plan"} ${leg} · ${ref}`}
      description={LEG_PURPOSE[leg]}
      icon="transport"
      size="md"
      dismissible={!form.busy}
      onSubmit={save}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose} disabled={form.busy}>
            Cancel
          </Button>
          <Button type="submit" busy={form.busy} busyLabel="Saving…">
            {record ? "Save plan" : `Plan ${leg}`}
          </Button>
        </>
      }
    >
      {banner && <FormBanner title={banner.title}>{banner.body}</FormBanner>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Pickup" {...form.field("pickupLocation")} placeholder={leg === TransportLeg.mobilization ? "Yard or depot" : "Site"} />
        <Input label="Destination" {...form.field("destination")} placeholder={leg === TransportLeg.mobilization ? "Site" : "Yard or depot"} />
        <Input
          label="Planned date"
          type="date"
          mono
          {...form.field("plannedDate")}
          warning={form.errors.plannedDate ? undefined : plannedWarning}
          hint={rental ? (leg === TransportLeg.mobilization ? `${ref} starts ${formatDate(rental.startDate)}.` : rental.endDate ? `${ref} ends ${formatDate(rental.endDate)}.` : `${ref} is open-ended.`) : undefined}
        />
        <Input
          label="Charges"
          prefix="₹"
          mono
          inputMode="decimal"
          {...form.field("charges")}
          hint={
            rental && !record
              ? (leg === TransportLeg.mobilization ? rental.mobilizationCharge : rental.demobilizationCharge) != null
                ? `Prefilled from ${ref}'s terms.`
                : `${ref} has no ${leg} charge in its terms.`
              : undefined
          }
        />
      </div>
      <Input label="Vehicle / details" {...form.field("transportDetails")} placeholder="e.g. Low-bed trailer, driver name" />
      <Textarea label="Notes" rows={2} {...form.field("notes")} />
    </Dialog>
  );
}

function deliverSchema(today: string) {
  return z
    .object({
      actualDate: z
        .string()
        .min(1, "Pick the day it arrived.")
        .refine((v) => v <= today, "This records what happened, so it can't be later than today."),
    })
    .transform(({ actualDate }) => ({ status: TransportStatus.delivered, actualDate }) satisfies UpdateTransportRequest);
}

/** Mark delivered — records the actual date (today or earlier, never the future). */
export function DeliverTransportDialog({
  open,
  onClose,
  organizationId,
  record,
  rental,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  record: TransportRecord;
  rental: Rental | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const today = todayIsoDate();
  const schema = useMemo(() => deliverSchema(today), [today]);
  const form = useForm({ schema, initial: { actualDate: today }, failTitle: "Nothing was changed" });
  const { reset } = form;

  useEffect(() => {
    if (open) reset({ actualDate: todayIsoDate() });
  }, [open, reset]);

  const ref = rentalRef(record.rentalId);
  const date = form.values.actualDate;
  // The confirm button stays disabled while the date is invalid, so its rule error shows from the start rather than after a submit.
  const check = schema.safeParse(form.values);
  const error = form.errors.actualDate ?? (check.success ? undefined : check.error.issues[0]?.message);
  const warning =
    !error && record.plannedDate && date < record.plannedDate
      ? `That's before the planned date (${formatDate(record.plannedDate)}). Save it if the trip arrived early.`
      : undefined;

  const confirm = form.submit(async (body) => {
    await apiClient.updateTransport(organizationId, record.rentalId, record.leg, body);
    toast.success({ title: `${LEG_LABEL[record.leg]} delivered`, body: `${ref} · arrived ${formatDate(body.actualDate)}.` });
    onSaved();
    onClose();
  });

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      icon="transport"
      tone="success"
      title={`Mark ${record.leg} for ${ref} delivered?`}
      description={`${record.pickupLocation ?? "Pickup not recorded"} → ${record.destination ?? "destination not recorded"}`}
      consequences={[
        "Records the date below as the trip's actual date and sets it Delivered.",
        rental
          ? rental.renterOrganizationId
            ? "The customer is notified that the trip was delivered."
            : "No one else is notified — this customer isn't on FleetIP."
          : "If the customer is on FleetIP, they're notified that the trip was delivered.",
        "The rental's own status isn't changed.",
      ]}
      cancelLabel="Not yet"
      confirmLabel="Mark delivered"
      busyLabel="Saving…"
      busy={form.busy}
      confirmDisabled={!form.valid}
      onConfirm={() => void confirm()}
    >
      {form.banner && <FormBanner title={form.banner.title}>{form.banner.body}</FormBanner>}
      <Input
        label="Delivered on"
        required
        type="date"
        mono
        max={today}
        {...form.field("actualDate")}
        error={error}
        warning={warning}
        hint="Today or earlier."
      />
    </ConfirmDialog>
  );
}

/** Cancel a leg — final: FleetIP keeps one record per leg, so it can't be planned again. */
export function CancelTransportDialog({
  open,
  onClose,
  organizationId,
  record,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  record: TransportRecord;
  onSaved: () => void;
}) {
  const action = useAction();

  useEffect(() => {
    if (open) action.clear();
    // action.clear is a new function each render; listing it would re-run this on every render.
  }, [open]);

  const ref = rentalRef(record.rentalId);
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      icon="close"
      tone="danger"
      title={`Cancel ${record.leg} for ${ref}?`}
      description={`${LEG_LABEL[record.leg]} · ${record.status === TransportStatus.dispatched ? "already dispatched" : "planned"}${record.plannedDate ? ` for ${formatDate(record.plannedDate)}` : ""}`}
      consequences={[
        "The trip record stays, marked Cancelled.",
        `This leg can't be planned again on ${ref} — FleetIP keeps one record per leg.`,
        ...(record.charges != null ? [`Its charges (${formatMoney(record.charges)}) stay on the record.`] : []),
        "The rental itself isn't changed.",
      ]}
      cancelLabel="Keep trip"
      confirmLabel="Cancel trip"
      confirmVariant="danger"
      busyLabel="Cancelling…"
      busy={action.busy}
      onConfirm={() =>
        void action.run(() => apiClient.updateTransport(organizationId, record.rentalId, record.leg, { status: TransportStatus.cancelled }), {
          failTitle: "Nothing was changed",
          success: () => ({ title: `${LEG_LABEL[record.leg]} cancelled`, body: `${ref} · the trip is kept as Cancelled.` }),
          onDone: () => {
            onSaved();
            onClose();
          },
        })
      }
    >
      {action.banner && <FormBanner title={action.banner.title}>{action.banner.body}</FormBanner>}
    </ConfirmDialog>
  );
}
