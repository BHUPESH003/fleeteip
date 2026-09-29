"use client";

import { MachineStatus } from "@fleetip/contracts/equipment";
import { RentalStatus, type Rental } from "@fleetip/contracts/rental";
import { TransportStatus } from "@fleetip/contracts/transport";
import { WorkOrderStatus } from "@fleetip/contracts/work-order";
import {
  Button,
  ConfirmDialog,
  DescriptionList,
  Dialog,
  FormBanner,
  Input,
  Textarea,
  UILink,
  useToast,
} from "@fleetip/ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { z } from "zod";
import { apiClient } from "../../../../lib/api-client";
import { useAction, useForm } from "../../../../lib/form";
import { daysBetween, formatDate, formatDateRange, formatMoney, plural, rentalRef, todayIsoDate } from "../../../../lib/format";
import { statusLabel } from "../../../../lib/status";
import { MAINTENANCE_TYPE_LABEL } from "../../machines/shared";
import {
  assetCodeOf,
  counterpartyName,
  coverageFor,
  legsOf,
  receivables,
  startBlocker,
  verificationApplies,
  type RentalData,
} from "./derive";

interface DialogBase {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  data: RentalData;
  onChanged: () => void;
}

/**
 * The actual-date field shared by Start and Mark off rent: required, not in
 * the future (updateRentalStatusRequestSchema), and not before `notBefore`.
 */
function actualDateSchema(today: string, empty: string, notBefore?: { date: string; message: string }) {
  return z.object({
    actualDate: z
      .string()
      .min(1, empty)
      .refine((date) => date <= today, "This records what happened, so it can't be later than today.")
      .refine((date) => !notBefore || date >= notBefore.date, notBefore?.message ?? ""),
  });
}

/** One banner or field for a status change; reset each time the dialog opens. */
function useActualDateForm(open: boolean, schema: ReturnType<typeof actualDateSchema>, failTitle: string) {
  const form = useForm({ schema, initial: { actualDate: todayIsoDate() }, failTitle });
  const { reset } = form;
  useEffect(() => {
    if (open) reset({ actualDate: todayIsoDate() });
  }, [open, reset]);
  return form;
}

/** A confirm-only write whose banner clears each time the dialog opens. */
function useDialogAction(open: boolean) {
  const action = useAction();
  const { clear } = action;
  useEffect(() => {
    // clear only calls a state setter, so any render's copy will do.
    if (open) clear();
  }, [open]);
  return action;
}

function ErrorBanner({ banner }: { banner: { title: string; body: string } | null }) {
  return banner ? (
    <FormBanner tone="error" title={banner.title}>
      {banner.body}
    </FormBanner>
  ) : null;
}

function whoVerifies(rental: Rental, customer: string): string {
  return verificationApplies(rental)
    ? `${customer} is notified and asked to verify it.`
    : "The customer isn't on FleetIP, so nobody is asked to verify it.";
}

// ------------------------------------------------------------------ Start rental

/** confirmed → active. Records the actual start date; the API refuses while a workshop job overlaps the rental. */
export function StartRentalDialog({ open, onClose, organizationId, data, onChanged }: DialogBase) {
  const toast = useToast();
  const { rental } = data;
  const today = todayIsoDate();
  const ref = rentalRef(rental.id);
  const schema = useMemo(() => actualDateSchema(today, "Enter the day the machine started work on site."), [today]);
  const form = useActualDateForm(open, schema, `${ref} wasn't started`);

  const date = form.values.actualDate;
  const customer = counterpartyName(data);
  const { mob } = legsOf(data);
  const job = startBlocker(data);
  const retired = data.machine?.status === MachineStatus.retired;
  const dateWarning = form.valid && date < rental.startDate ? `That's before the planned start date, ${formatDate(rental.startDate)}.` : undefined;
  const mobWarning =
    data.access.transport && (!mob || mob.status !== TransportStatus.delivered)
      ? mob
        ? `Mobilization is ${statusLabel("transport", mob.status)}, not Delivered yet.`
        : "No mobilization is recorded for this rental."
      : null;

  const confirm = form.submit(async ({ actualDate }) => {
    if (job || retired) return;
    // A workshop-job 409 names the job in its message; the hook's banner shows it.
    await apiClient.updateRentalStatus(organizationId, rental.id, RentalStatus.active, actualDate);
    toast.success({
      title: `${ref} started`,
      body: `Actual start ${formatDate(actualDate)}. Status changed from Confirmed to Active.${verificationApplies(rental) ? ` ${customer} is asked to verify the date.` : ""}`,
    });
    onClose();
    onChanged();
  });

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={() => void confirm()}
      icon="calendar_check"
      tone="info"
      title={`Start ${ref}?`}
      description={[assetCodeOf(data), customer].filter(Boolean).join(" · ")}
      consequences={[
        `Sets the rental to Active and records ${date === today ? "today" : formatDate(date)} as the actual start date.`,
        whoVerifies(rental, customer),
        "Terms lock once it starts. Logsheets can be submitted from the start date.",
        ...(job ? [] : ["FleetIP refuses to start a rental while a workshop job is booked over its dates."]),
      ]}
      cancelLabel="Not yet"
      confirmLabel="Start rental"
      busyLabel="Starting…"
      busy={form.busy}
      confirmDisabled={Boolean(job) || retired}
    >
      <ErrorBanner banner={form.banner} />
      {retired && (
        <FormBanner tone="error" title="The machine is retired">
          A retired machine can&apos;t go on rent, so this rental can&apos;t start. Cancel it instead.
        </FormBanner>
      )}
      {job && (
        <FormBanner
          tone="error"
          title="A workshop job is booked over this rental"
          action={
            <UILink href={`/maintenance/${job.id}?machineId=${job.machineId}`} className="text-xs font-medium text-accent-text hover:underline">
              Open the job
            </UILink>
          }
        >
          {MAINTENANCE_TYPE_LABEL[job.maintenanceType]}, {statusLabel("maintenance", job.status)},{" "}
          {formatDateRange(job.startDate, job.endDate, "with no end date")}. FleetIP won&apos;t start a rental over a workshop job.
          Complete or cancel the job first.
        </FormBanner>
      )}
      {mobWarning && !job && !retired && (
        <FormBanner tone="warning" title="Is the machine on site?">
          {mobWarning} Start the rental anyway if it is; transport can be updated afterwards.
        </FormBanner>
      )}
      <Input
        label="Actual start date"
        required
        type="date"
        mono
        max={today}
        {...form.field("actualDate")}
        warning={dateWarning}
        hint="The day the machine started work. Today or earlier."
      />
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------------ Mark off rent

/** active → off_rent. Records the actual end date; logsheets can't be submitted afterwards (the API needs the rental Active). */
export function OffRentDialog({ open, onClose, organizationId, data, onChanged }: DialogBase) {
  const toast = useToast();
  const { rental } = data;
  const today = todayIsoDate();
  const ref = rentalRef(rental.id);
  const started = rental.actualStartDate ?? rental.startDate;
  const schema = useMemo(
    () =>
      actualDateSchema(today, "Enter the day the machine stopped work.", {
        date: started,
        message: `The end can't be before the rental started, ${formatDate(started)}.`,
      }),
    [today, started],
  );
  const form = useActualDateForm(open, schema, `${ref} wasn't marked off rent`);

  const date = form.values.actualDate;
  const customer = counterpartyName(data);
  const { demob } = legsOf(data);
  const coverage = data.access.logsheets ? coverageFor(rental, data.logsheets, today) : null;
  const missing = coverage?.missing.length ?? 0;
  const early = rental.endDate && date < rental.endDate ? daysBetween(date, rental.endDate) : 0;
  const late = rental.endDate && date > rental.endDate ? daysBetween(rental.endDate, date) : 0;
  const dateWarning =
    form.valid && early > 0
      ? `That's ${plural(early, "day")} before the planned end, ${formatDate(rental.endDate)}. Check the notice period in the terms.`
      : form.valid && late > 0
        ? `That's ${plural(late, "day")} after the planned end, ${formatDate(rental.endDate)}.`
        : undefined;
  // A date before the start shows straight away, not only after blur.
  const beforeStart = date && date < started ? schema.safeParse(form.values).error?.issues[0]?.message : undefined;

  const confirm = form.submit(async ({ actualDate }) => {
    await apiClient.updateRentalStatus(organizationId, rental.id, RentalStatus.off_rent, actualDate);
    toast.success({
      title: `${ref} is off rent`,
      body: `Actual end ${formatDate(actualDate)}. Status changed from Active to Off rent.${verificationApplies(rental) ? ` ${customer} is asked to verify the date.` : ""}`,
    });
    onClose();
    onChanged();
  });

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={() => void confirm()}
      icon="clock"
      tone="warning"
      title={`Mark ${ref} off rent?`}
      description={[assetCodeOf(data), customer].filter(Boolean).join(" · ")}
      consequences={[
        `Records ${date === today ? "today" : formatDate(date)} as the actual end date (it can be changed below, not in the future).`,
        whoVerifies(rental, customer),
        "No more logsheets can be submitted for this rental.",
        demob
          ? `The machine stays booked until the rental is completed. Demobilization is ${statusLabel("transport", demob.status)}.`
          : "The machine stays booked until the rental is completed. Plan demobilization to bring it back.",
        "Invoices aren't changed.",
      ]}
      cancelLabel="Not yet"
      confirmLabel="Mark off rent"
      busyLabel="Saving…"
      busy={form.busy}
    >
      <ErrorBanner banner={form.banner} />
      {missing > 0 && (
        <FormBanner tone="warning" title={`${plural(missing, "day")} ${missing === 1 ? "has" : "have"} no logsheet`}>
          Logsheets can&apos;t be submitted once the rental is off rent, so log those days first if they were worked.
        </FormBanner>
      )}
      <Input
        label="Actual end date"
        required
        type="date"
        mono
        min={started}
        max={today}
        {...form.field("actualDate")}
        error={form.errors.actualDate ?? beforeStart}
        warning={dateWarning}
        hint="The last day the machine worked. Today or earlier."
      />
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------------ Complete rental

/** off_rent → completed. The work order isn't completed with it — offered as a separate step. */
export function CompleteRentalDialog({ open, onClose, organizationId, data, onChanged }: DialogBase) {
  const router = useRouter();
  const { rental, workOrder } = data;
  const action = useDialogAction(open);

  const ref = rentalRef(rental.id);
  const { demob } = legsOf(data);
  const money = data.access.billing ? receivables(data) : null;
  const woOpen = workOrder?.status === WorkOrderStatus.issued;

  function confirm() {
    void action.run(() => apiClient.updateRentalStatus(organizationId, rental.id, RentalStatus.completed), {
      failTitle: `${ref} wasn't completed`,
      success: () => ({
        title: `${ref} completed`,
        body: `Status changed from Off rent. The machine's dates are free again.${woOpen && workOrder ? ` Work order ${workOrder.referenceNumber} is still Issued.` : ""}`,
        action: woOpen && workOrder ? { label: "Open work order", onClick: () => router.push(`/work-orders/${workOrder.id}`) } : undefined,
      }),
      onDone: () => {
        onClose();
        onChanged();
      },
    });
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={confirm}
      icon="check"
      tone="success"
      title={`Complete ${ref}?`}
      description={[assetCodeOf(data), counterpartyName(data)].filter(Boolean).join(" · ")}
      consequences={[
        "Sets the rental to Completed. A completed rental can't be reopened.",
        "The machine's dates are freed for new bookings.",
        ...(workOrder
          ? [
              woOpen
                ? `Work order ${workOrder.referenceNumber} is not completed automatically. Complete it separately.`
                : `Work order ${workOrder.referenceNumber} is already ${statusLabel("work_order", workOrder.status)}.`,
            ]
          : []),
        money && money.outstanding > 0
          ? `Invoices aren't changed. ${formatMoney(money.outstanding)} is still outstanding and can still be collected.`
          : "Invoices aren't changed.",
      ]}
      cancelLabel="Not yet"
      confirmLabel="Complete rental"
      busyLabel="Completing…"
      busy={action.busy}
    >
      <ErrorBanner banner={action.banner} />
      {data.access.transport && (!demob || demob.status !== TransportStatus.delivered) && (
        <FormBanner tone="warning" title="Demobilization isn't marked Delivered">
          {demob ? `It's ${statusLabel("transport", demob.status)}.` : "No return trip is recorded."} Complete the rental anyway if the
          machine is back.
        </FormBanner>
      )}
      {woOpen && workOrder && (
        <UILink href={`/work-orders/${workOrder.id}`} className="self-start text-sm font-medium text-accent-text hover:underline">
          Open work order {workOrder.referenceNumber}
        </UILink>
      )}
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------------ Cancel rental

/** Any open status → cancelled. Frees the dates; nothing else is cancelled with it, and the customer isn't notified. */
export function CancelRentalDialog({ open, onClose, organizationId, data, onChanged }: DialogBase) {
  const router = useRouter();
  const { rental, workOrder } = data;
  const action = useDialogAction(open);

  const ref = rentalRef(rental.id);
  const asset = assetCodeOf(data);
  const woOpen = workOrder?.status === WorkOrderStatus.issued;

  function confirm() {
    void action.run(() => apiClient.updateRentalStatus(organizationId, rental.id, RentalStatus.cancelled), {
      failTitle: `${ref} wasn't cancelled`,
      success: () => ({
        title: `${ref} cancelled`,
        body: `${asset ?? "The machine"}'s dates are free again.${woOpen && workOrder ? ` Work order ${workOrder.referenceNumber} is still Issued.` : ""}`,
        action: woOpen && workOrder ? { label: "Open work order", onClick: () => router.push(`/work-orders/${workOrder.id}`) } : undefined,
      }),
      onDone: () => {
        onClose();
        onChanged();
      },
    });
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={confirm}
      icon="close"
      tone="danger"
      title={`Cancel rental ${ref}?`}
      description={[statusLabel("rental", rental.status), asset, counterpartyName(data)].filter(Boolean).join(" · ")}
      consequences={[
        "It stays on record as Cancelled. Cancelling is final.",
        `${asset ?? "The machine"}'s dates (${formatDateRange(rental.startDate, rental.endDate)}) are freed for new bookings.`,
        ...(workOrder && woOpen
          ? [`Work order ${workOrder.referenceNumber} is not cancelled automatically. Cancel it separately if the deal is off.`]
          : []),
        "Transport trips and invoices on this rental aren't changed.",
        ...(rental.status === RentalStatus.active ? ["No more logsheets can be submitted."] : []),
        ...(verificationApplies(rental) ? [`${counterpartyName(data)} isn't notified automatically.`] : []),
      ]}
      cancelLabel="Keep rental"
      confirmLabel="Cancel rental"
      busyLabel="Cancelling…"
      confirmVariant="danger"
      busy={action.busy}
    >
      <ErrorBanner banner={action.banner} />
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------------ Renter: verify / dispute actual dates

function recordedDates(rental: Rental) {
  return [
    { label: "Actual start", value: rental.actualStartDate ? formatDate(rental.actualStartDate) : null, mono: true, emptyText: "Not recorded" },
    {
      label: "Actual end",
      value: rental.actualEndDate ? formatDate(rental.actualEndDate) : null,
      mono: true,
      emptyText: "Not recorded yet",
    },
  ];
}

/** Renter (rental.respond): confirm the dates the rental company recorded. */
export function VerifyDatesDialog({ open, onClose, organizationId, data, onChanged }: DialogBase) {
  const { rental } = data;
  const action = useDialogAction(open);

  const ref = rentalRef(rental.id);
  const company = counterpartyName(data);

  function confirm() {
    void action.run(() => apiClient.verifyActualDates(organizationId, rental.id), {
      failTitle: "The dates weren't verified",
      success: () => ({ title: `Dates verified on ${ref}`, body: `${company} has been notified.` }),
      onDone: () => {
        onClose();
        onChanged();
      },
    });
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={confirm}
      icon="check"
      tone="success"
      title={`Verify the dates on ${ref}?`}
      description={`Recorded by ${company}.`}
      consequences={[
        `Actual start: ${rental.actualStartDate ? formatDate(rental.actualStartDate) : "not recorded"}.`,
        rental.actualEndDate
          ? `Actual end: ${formatDate(rental.actualEndDate)}.`
          : "Actual end: not recorded yet. You'll be asked again when the rental goes off rent.",
        `${company} is notified that you verified them.`,
        "Once verified they can't be disputed, unless new dates are recorded.",
      ]}
      cancelLabel="Not yet"
      confirmLabel="Verify dates"
      busyLabel="Verifying…"
      busy={action.busy}
    >
      <ErrorBanner banner={action.banner} />
    </ConfirmDialog>
  );
}

const REASON_MAX = 500;

/** disputeActualDatesRequestSchema: 1–500 characters. */
const disputeSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Say what's wrong with the dates, for example “The machine reached site on 14 Sep, not 12 Sep.”")
    .refine(
      (reason) => reason.length <= REASON_MAX,
      (reason) => ({ message: `Reasons are up to ${REASON_MAX} characters. This one has ${reason.length}.` }),
    ),
});

/** Renter (rental.respond): dispute the recorded dates with a reason. */
export function DisputeDatesDialog({ open, onClose, organizationId, data, onChanged }: DialogBase) {
  const toast = useToast();
  const { rental } = data;
  const form = useForm({ schema: disputeSchema, initial: { reason: "" }, failTitle: "The dispute wasn't sent" });
  const { reset } = form;

  useEffect(() => {
    if (open) reset({ reason: "" });
  }, [open, reset]);

  const ref = rentalRef(rental.id);
  const company = counterpartyName(data);
  const trimmed = form.values.reason.trim();

  const handleSubmit = form.submit(async (body) => {
    await apiClient.disputeActualDates(organizationId, rental.id, body);
    toast.success({ title: `Dates disputed on ${ref}`, body: `${company} has been notified with your reason.` });
    onClose();
    onChanged();
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Dispute the dates on ${ref}`}
      description={`Tell ${company} what's wrong. They're notified and see your reason on the rental.`}
      icon="warning"
      tone="warning"
      size="md"
      dismissible={!form.busy}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose} disabled={form.busy}>
            Cancel
          </Button>
          <Button type="submit" busy={form.busy} busyLabel="Sending…">
            Dispute dates
          </Button>
        </>
      }
    >
      <ErrorBanner banner={form.banner} />
      <DescriptionList layout="rows" items={recordedDates(rental)} />
      <Textarea
        id="dispute-reason"
        label="Reason"
        required
        rows={4}
        maxLength={REASON_MAX + 100}
        {...form.field("reason")}
        hint={`Up to ${REASON_MAX} characters. ${trimmed.length ? `${trimmed.length} so far.` : ""}`}
      />
    </Dialog>
  );
}

// ------------------------------------------------------------------ Rental Company: change planned dates

type DateValues = { startDate: string; endDate: string; reason: string };

/**
 * proposeRentalDateChangeRequestSchema, in the words users read. Confirmed:
 * start and end. Active: the end only (the start already happened).
 */
function changeDatesSchema(rental: Rental, today: string) {
  const active = rental.status === RentalStatus.active;
  const started = rental.actualStartDate ?? rental.startDate;
  return z
    .object({
      startDate: z.string(),
      endDate: z.string(),
      reason: z.string().trim().max(REASON_MAX, `Reasons are up to ${REASON_MAX} characters.`),
    })
    .superRefine((v, ctx) => {
      if (!active && !v.startDate) ctx.addIssue({ code: "custom", path: ["startDate"], message: "Enter the new start date." });
      else if (!active && v.startDate < today) ctx.addIssue({ code: "custom", path: ["startDate"], message: "The start date can't be in the past." });
      const start = active ? rental.startDate : v.startDate;
      if (v.endDate && start && v.endDate < start)
        ctx.addIssue({ code: "custom", path: ["endDate"], message: `The end can't be before the start, ${formatDate(start)}.` });
      else if (active && v.endDate && v.endDate < started)
        ctx.addIssue({ code: "custom", path: ["endDate"], message: `The end can't be before the rental started, ${formatDate(started)}.` });
    })
    .transform((v) => ({
      ...(active ? {} : { startDate: v.startDate }),
      endDate: v.endDate || null,
      ...(v.reason ? { reason: v.reason } : {}),
    }));
}

const datesOf = (rental: Rental): DateValues => ({ startDate: rental.startDate, endDate: rental.endDate ?? "", reason: "" });

/**
 * Rental Company (rental.manage), confirmed or active. With a customer on
 * FleetIP it's a proposal they accept or reject; otherwise it applies now.
 */
export function ChangeDatesDialog({ open, onClose, organizationId, data, onChanged }: DialogBase) {
  const toast = useToast();
  const { rental } = data;
  const today = todayIsoDate();
  const ref = rentalRef(rental.id);
  const customer = counterpartyName(data);
  const active = rental.status === RentalStatus.active;
  const proposal = Boolean(rental.renterOrganizationId);
  const schema = useMemo(() => changeDatesSchema(rental, today), [rental, today]);
  const form = useForm({ schema, initial: datesOf(rental), failTitle: `The dates on ${ref} weren't changed` });
  const { reset } = form;

  useEffect(() => {
    if (open) reset(datesOf(rental));
  }, [open, rental, reset]);

  const unchanged = form.values.startDate === rental.startDate && form.values.endDate === (rental.endDate ?? "");

  const save = form.submit(async (body) => {
    const updated = (await apiClient.proposeRentalDateChange(organizationId, rental.id, body)) as Rental;
    const range = formatDateRange(updated.pendingDateChange?.startDate ?? updated.startDate, updated.pendingDateChange ? updated.pendingDateChange.endDate : updated.endDate);
    toast.success(
      updated.pendingDateChange
        ? { title: `New dates sent to ${customer}`, body: `${ref} · ${range}. The rental keeps its current dates until they accept.` }
        : { title: `Dates changed on ${ref}`, body: range },
    );
    onClose();
    onChanged();
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Change the dates on ${ref}`}
      description={
        proposal
          ? `${customer} is notified and asked to accept or reject. Nothing changes until they accept.`
          : "The customer isn't on FleetIP, so the new dates apply straight away."
      }
      icon="calendar_check"
      size="md"
      dismissible={!form.busy}
      onSubmit={save}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose} disabled={form.busy}>
            Cancel
          </Button>
          <Button type="submit" busy={form.busy} busyLabel="Saving…" disabled={unchanged}>
            {proposal ? "Send to customer" : "Change dates"}
          </Button>
        </>
      }
    >
      <ErrorBanner banner={form.banner} />
      <DescriptionList layout="rows" items={[{ label: "Current dates", value: formatDateRange(rental.startDate, rental.endDate), mono: true }]} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Start date"
          type="date"
          mono
          required={!active}
          disabled={active}
          min={active ? undefined : today}
          {...form.field("startDate")}
          hint={active ? "The rental has started, so only the end can move." : undefined}
        />
        <Input
          label="End date"
          type="date"
          mono
          min={active ? (rental.actualStartDate ?? rental.startDate) : form.values.startDate || today}
          {...form.field("endDate")}
          hint={active ? "Later to extend, earlier to end early. Empty for open-ended." : "Empty for open-ended."}
        />
      </div>
      <Textarea label="Reason" rows={2} maxLength={REASON_MAX + 100} {...form.field("reason")} hint={proposal ? `Optional. ${customer} sees it.` : "Optional. Kept in the activity log."} />
    </Dialog>
  );
}

// ------------------------------------------------------------------ Rental Company: correct disputed actual dates

function correctSchema(rental: Rental, today: string) {
  const hasEnd = Boolean(rental.actualEndDate);
  return z
    .object({ actualStartDate: z.string(), actualEndDate: z.string() })
    .superRefine((v, ctx) => {
      if (!v.actualStartDate) ctx.addIssue({ code: "custom", path: ["actualStartDate"], message: "Enter the day the machine started work." });
      else if (v.actualStartDate > today)
        ctx.addIssue({ code: "custom", path: ["actualStartDate"], message: "This records what happened, so it can't be later than today." });
      if (!hasEnd) return;
      if (!v.actualEndDate) ctx.addIssue({ code: "custom", path: ["actualEndDate"], message: "Enter the last day the machine worked." });
      else if (v.actualEndDate > today)
        ctx.addIssue({ code: "custom", path: ["actualEndDate"], message: "This records what happened, so it can't be later than today." });
      else if (v.actualStartDate && v.actualEndDate < v.actualStartDate)
        ctx.addIssue({ code: "custom", path: ["actualEndDate"], message: "The end can't be before the start." });
    })
    .transform((v) => ({ actualStartDate: v.actualStartDate, ...(hasEnd ? { actualEndDate: v.actualEndDate } : {}) }));
}

const actualsOf = (rental: Rental) => ({ actualStartDate: rental.actualStartDate ?? "", actualEndDate: rental.actualEndDate ?? "" });

/** Rental Company (rental.manage): answer a dispute with corrected dates; the customer verifies again. */
export function CorrectDatesDialog({ open, onClose, organizationId, data, onChanged }: DialogBase) {
  const toast = useToast();
  const { rental } = data;
  const today = todayIsoDate();
  const ref = rentalRef(rental.id);
  const customer = counterpartyName(data);
  const schema = useMemo(() => correctSchema(rental, today), [rental, today]);
  const form = useForm({ schema, initial: actualsOf(rental), failTitle: `The dates on ${ref} weren't corrected` });
  const { reset } = form;

  useEffect(() => {
    if (open) reset(actualsOf(rental));
  }, [open, rental, reset]);

  const save = form.submit(async (body) => {
    await apiClient.correctActualDates(organizationId, rental.id, body);
    toast.success({ title: `Corrected dates sent to ${customer}`, body: `${ref} · they're asked to verify them again.` });
    onClose();
    onChanged();
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Correct the actual dates on ${ref}`}
      description={`${customer} disputed these dates. Correct them and they're asked to verify again.`}
      icon="edit"
      size="md"
      dismissible={!form.busy}
      onSubmit={save}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose} disabled={form.busy}>
            Cancel
          </Button>
          <Button type="submit" busy={form.busy} busyLabel="Sending…">
            Send corrected dates
          </Button>
        </>
      }
    >
      <ErrorBanner banner={form.banner} />
      {rental.actualDatesDisputeReason && (
        <FormBanner tone="warning" title="Their reason">
          &ldquo;{rental.actualDatesDisputeReason}&rdquo;
        </FormBanner>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Actual start date" type="date" mono required max={today} {...form.field("actualStartDate")} />
        {rental.actualEndDate && <Input label="Actual end date" type="date" mono required max={today} {...form.field("actualEndDate")} />}
      </div>
    </Dialog>
  );
}
