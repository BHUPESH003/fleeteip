"use client";

import {
  CommercialQuotationStatus,
  type CommercialQuotation,
  type CreateQuotationOfferRequest,
  type QuotationOffer,
} from "@fleetip/contracts/quotation";
import type { RateUnit } from "@fleetip/contracts/rental";
import {
  Alert,
  Button,
  ConfirmDialog,
  Dialog,
  FormBanner,
  Input,
  Select,
  Textarea,
  useToast,
  type DialogTone,
  type IconName,
  type ToastInput,
} from "@fleetip/ui";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { z } from "zod";
import { apiClient } from "../../../../lib/api-client";
import { useConnection } from "../../../../lib/connection";
import { formatDateRange, formatRate, todayIsoDate } from "../../../../lib/format";
import { useAction, useForm } from "../../../../lib/form";
import { RATE_UNIT_OPTIONS } from "../../requirements/shared";

/** Shared shell: runs one write, keeps the dialog open with the reason if it fails, toasts on success. */
export function ActionConfirm({
  open,
  onClose,
  title,
  description,
  consequences,
  icon,
  tone,
  confirmLabel,
  busyLabel,
  cancelLabel,
  confirmVariant,
  failureTitle,
  run,
  success,
  onDone,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  consequences: ReactNode[];
  icon: IconName;
  tone: DialogTone;
  confirmLabel: string;
  busyLabel: string;
  cancelLabel: string;
  confirmVariant?: "primary" | "danger";
  failureTitle: string;
  run: () => Promise<unknown>;
  /** Built after the write, so it can name what came back. */
  success: (result: unknown) => ToastInput | Promise<ToastInput>;
  onDone: () => void;
  children?: ReactNode;
}) {
  const { online } = useConnection();
  const action = useAction();
  const { clear } = action;

  useEffect(() => {
    if (open) clear();
    // `clear` isn't memoised in lib/form.ts, so it can't be a dep (it would wipe the banner on every render).
  }, [open]);

  async function confirm() {
    // The toast can be built asynchronously, so it's made inside the call; a failure there shows like a failed write.
    await action.run(async () => success(await run()), {
      failTitle: failureTitle,
      success: (toastInput) => toastInput,
      onDone: () => {
        onDone();
        onClose();
      },
    });
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={confirm}
      icon={icon}
      tone={tone}
      title={title}
      description={description}
      consequences={consequences}
      cancelLabel={cancelLabel}
      confirmLabel={confirmLabel}
      busyLabel={busyLabel}
      confirmVariant={confirmVariant}
      busy={action.busy}
      confirmDisabled={!online}
    >
      {!online && (
        <FormBanner tone="warning" title="You're offline">
          Nothing can be saved until the connection is back.
        </FormBanner>
      )}
      {action.banner && (
        <FormBanner tone="error" title="Nothing was changed">
          {action.banner.body}
        </FormBanner>
      )}
      {children}
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------------ counter-offer

/** Dates carry forward from the quotation; the offer itself is price and notes. */
function counterOfferSchema(quotation: CommercialQuotation) {
  return z
    .object({
      rate: z
        .string()
        .trim()
        .min(1, "Enter the rate you're offering.")
        .refine((raw) => Number(raw) > 0, "Enter a rate above ₹0."),
      rateUnit: z.string().min(1, "Choose what the rate is per."),
      notes: z.string().trim().max(1000, "Notes are up to 1,000 characters."),
    })
    .transform(
      (values): CreateQuotationOfferRequest => ({
        rate: Number(values.rate),
        rateUnit: values.rateUnit as RateUnit,
        startDate: quotation.startDate,
        endDate: quotation.endDate ?? undefined,
        notes: values.notes || undefined,
      }),
    );
}

/**
 * A counter-offer carries price and notes only. Dates carry forward
 * unchanged — the server ignores dates on an offer (makeOffer uses the
 * quotation's own), and dates change only through the alternate-dates
 * request. createQuotationOfferRequestSchema has no "not in the past" rule
 * for the carried start date on purpose (a long negotiation must still be
 * able to counter).
 */
export function CounterOfferDialog({
  open,
  onClose,
  organizationId,
  quotation,
  defaultUnit,
  otherParty,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  quotation: CommercialQuotation;
  defaultUnit: RateUnit;
  otherParty: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const initial = { rate: "", rateUnit: defaultUnit as string, notes: "" };
  const schema = useMemo(() => counterOfferSchema(quotation), [quotation]);
  const form = useForm({ schema, initial, failTitle: "The counter-offer wasn't sent" });
  const { busy, online, reset } = form;

  useEffect(() => {
    if (open) reset({ rate: "", rateUnit: defaultUnit, notes: "" });
  }, [open, defaultUnit, reset]);

  const handleSubmit = form.submit(async (body) => {
    const offer = (await apiClient.makeOffer(organizationId, quotation.id, body)) as QuotationOffer;
    toast.success({
      title: `Counter-offer sent on ${quotation.referenceNumber}`,
      body: `${formatRate(offer.rate, offer.rateUnit)}. ${otherParty} is notified.`,
    });
    onDone();
    onClose();
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Make a counter-offer on ${quotation.referenceNumber}`}
      description={`The current rate is ${formatRate(quotation.rate, quotation.rateUnit)}. Your offer goes to ${otherParty} to accept or counter.`}
      icon="quotation"
      size="md"
      dismissible={!busy}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" busy={busy} busyLabel="Sending…" disabled={!online} title={!online ? "You're offline." : undefined}>
            Send counter-offer
          </Button>
        </>
      }
    >
      {form.banner && (
        <FormBanner tone="error" title="The counter-offer wasn't sent">
          {form.banner.body}
        </FormBanner>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div data-field="rate">
          <Input label="Rate" required prefix="₹" mono inputMode="decimal" {...form.field("rate")} />
        </div>
        <div data-field="rateUnit">
          <Select label="Rate is" required options={RATE_UNIT_OPTIONS} {...form.field("rateUnit")} />
        </div>
      </div>
      <div data-field="notes">
        <Textarea label="Notes" rows={2} {...form.field("notes")} hint="What the rate includes, or why it changed." />
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs leading-[1.5] text-ink-soft">
        <li>Dates stay {formatDateRange(quotation.startDate, quotation.endDate)} — dates change only by proposing new dates.</li>
        <li>It replaces any offer still pending, which is marked Superseded.</li>
        <li>
          {quotation.status === CommercialQuotationStatus.sent ? "The first offer moves the quotation to Negotiating. " : ""}
          Nothing changes on the quotation until the offer is accepted.
        </li>
      </ul>
    </Dialog>
  );
}

// ------------------------------------------------------------------ propose alternate dates

const proposeDatesSchema = z
  .object({
    startDate: z.string().min(1, "Pick the new start date."),
    endDate: z.string(),
    reason: z.string().trim().max(500, "Reasons are up to 500 characters."),
  })
  .refine((values) => !values.endDate || !values.startDate || values.endDate >= values.startDate, {
    message: "The end date can't be before the start date.",
    path: ["endDate"],
  })
  .transform((values) => ({ startDate: values.startDate, endDate: values.endDate || undefined, reason: values.reason || undefined }));

/**
 * The one sanctioned channel for changing a quotation's dates once they're
 * locked at creation. proposeAlternateDatesRequestSchema: end on or after
 * start; no "not in the past" rule. The Renter must accept before the
 * dates change.
 */
export function ProposeDatesDialog({
  open,
  onClose,
  organizationId,
  quotation,
  customer,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  quotation: CommercialQuotation;
  customer: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const initial = { startDate: quotation.startDate, endDate: quotation.endDate ?? "", reason: "" };
  const form = useForm({ schema: proposeDatesSchema, initial, failTitle: "The dates weren't proposed" });
  const { busy, online, reset, values } = form;
  // Not a field rule: it only shows after a submit, in the banner.
  const [unchangedTried, setUnchangedTried] = useState(false);

  useEffect(() => {
    if (!open) return;
    reset({ startDate: quotation.startDate, endDate: quotation.endDate ?? "", reason: "" });
    setUnchangedTried(false);
  }, [open, quotation.startDate, quotation.endDate, reset]);

  const today = todayIsoDate();
  const unchanged = values.startDate === quotation.startDate && (values.endDate || null) === quotation.endDate;
  const startWarning = values.startDate && values.startDate < today ? "This date has passed. You can propose it, but check it with the customer." : undefined;

  const handleSubmit = form.submit(async (body) => {
    setUnchangedTried(unchanged);
    if (unchanged) return;
    await apiClient.proposeAlternateDates(organizationId, quotation.id, body);
    toast.success({
      title: `New dates proposed on ${quotation.referenceNumber}`,
      body: `${formatDateRange(body.startDate, body.endDate ?? null)} — waiting for ${customer} to accept.`,
    });
    onDone();
    onClose();
  });
  const failure = form.banner?.body ?? (unchangedTried && unchanged ? "These are the dates the quotation already has. Change at least one." : null);
  const bind = form.field;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Propose new dates on ${quotation.referenceNumber}`}
      description={`Now ${formatDateRange(quotation.startDate, quotation.endDate)}. The dates change only if ${customer} accepts.`}
      icon="calendar_check"
      size="md"
      dismissible={!busy}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" busy={busy} busyLabel="Proposing…" disabled={!online} title={!online ? "You're offline." : undefined}>
            Propose dates
          </Button>
        </>
      }
    >
      {failure && (
        <FormBanner tone="error" title="Nothing was proposed">
          {failure}
        </FormBanner>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div data-field="startDate">
          <Input label="New start date" required type="date" mono {...bind("startDate")} warning={startWarning} />
        </div>
        <div data-field="endDate">
          <Input label="New end date" type="date" mono min={values.startDate || undefined} {...bind("endDate")} hint="Leave empty for open-ended." />
        </div>
      </div>
      <div data-field="reason">
        <Textarea label="Reason" rows={2} {...bind("reason")} hint="Shown to the customer, e.g. the machine is on another job until then." />
      </div>
    </Dialog>
  );
}

/** Small read-only summary of a pending date proposal, shared by the card and the confirm. */
export function ProposedDates({ quotation }: { quotation: CommercialQuotation }) {
  if (!quotation.proposedAlternateStartDate) return null;
  return (
    <Alert tone="warning" icon="calendar_check" title="New dates proposed">
      <span className="font-mono">{formatDateRange(quotation.proposedAlternateStartDate, quotation.proposedAlternateEndDate)}</span> instead of{" "}
      <span className="font-mono">{formatDateRange(quotation.startDate, quotation.endDate)}</span>.
      {quotation.alternateDateReason ? ` Reason: ${quotation.alternateDateReason}` : " No reason given."}
    </Alert>
  );
}
