"use client";

import { InvoiceStatus, type CreateInvoiceRequest, type Invoice } from "@fleetip/contracts/billing";
import { RateUnit, RentalStatus, type Rental } from "@fleetip/contracts/rental";
import {
  Alert,
  Button,
  Dialog,
  FieldMessage,
  FormBanner,
  FormSection,
  IconButton,
  Input,
  SearchSelect,
  Textarea,
  useToast,
} from "@fleetip/ui";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { z } from "zod";
import { ApiError, apiClient } from "../../../lib/api-client";
import { useForm } from "../../../lib/form";
import {
  addDays,
  daysBetween,
  formatDate,
  formatDateRange,
  formatMoney,
  formatRateUnit,
  formatShortDate,
  rentalRef,
  todayIsoDate,
} from "../../../lib/format";
import { statusLabel } from "../../../lib/status";
import { customerOf } from "./shared";

export interface CreateInvoiceDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  /** Rentals to invoice: undefined while loading, null when the role can't list rentals. */
  rentals: Rental[] | null | undefined;
  /** Existing invoices — the suggested period follows the rental's last one; overlaps are warned about. */
  invoices: Invoice[];
  /** Asset codes by machine id (a Rental Company's rentals don't carry machineAssetCode). */
  machineCodes: Map<string, string>;
  customerNames: Map<string, string>;
  /** Preselects the rental (?create=1&rentalId=…, e.g. Machine detail's "Raise invoice"). */
  initialRentalId?: string | null;
  onCreated: (invoice: Invoice) => void;
  onOpenInvoice?: (invoiceId: string) => void;
}

type LineField = "description" | "quantity" | "rate";
const LINE_FIELDS: LineField[] = ["description", "quantity", "rate"];
type LineCell = `lineItems.${number}.${LineField}`;
type LineRow = Record<LineField, string>;

/**
 * Field names are the request paths, so the API's 400 issues land under the
 * right input. Line cells are keyed by index ("lineItems.0.rate");
 * `lineItems` holds one stable id per line for React keys.
 */
type InvoiceValues = {
  rentalId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  dueDate: string;
  taxAmount: string;
  adjustmentAmount: string;
  notes: string;
  lineItems: string[];
} & { [cell: LineCell]: string };

const cell = (index: number, field: LineField): LineCell => `lineItems.${index}.${field}`;

let lineSeq = 0;
function newLineId(): string {
  lineSeq += 1;
  return `line-${lineSeq}`;
}

function blankInvoice(rentalId: string): InvoiceValues {
  return {
    rentalId,
    billingPeriodStart: "",
    billingPeriodEnd: "",
    dueDate: "",
    taxAmount: "",
    adjustmentAmount: "",
    notes: "",
    lineItems: ["line-0"],
    "lineItems.0.description": "",
    "lineItems.0.quantity": "",
    "lineItems.0.rate": "",
  };
}

function lastDayOfMonth(iso: string): string {
  return new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0)).toISOString().slice(0, 10);
}

const STATUS_RANK: Record<RentalStatus, number> = { active: 0, off_rent: 1, confirmed: 2, completed: 3, cancelled: 4 };

interface Suggestion {
  rentalId: string;
  periodStart: string;
  periodEnd: string;
  line: LineRow;
  basis: string;
}

/**
 * Editable defaults for a rental: the period starts the day after its last
 * (non-cancelled) invoice ended — or when the rental started — and runs to
 * the end of that month (or the rental's end); the first line uses the
 * rental's own rate and unit. Labelled as a suggestion in the form.
 */
function suggestFor(rental: Rental, invoices: Invoice[], asset: string | null): Suggestion {
  const ref = rentalRef(rental.id);
  const previous = invoices
    .filter((i) => i.rentalId === rental.id && i.status !== InvoiceStatus.cancelled)
    .sort((a, b) => b.billingPeriodEnd.localeCompare(a.billingPeriodEnd))[0];
  const rentalStart = rental.actualStartDate ?? rental.startDate;
  const rentalEnd = rental.actualEndDate ?? rental.endDate;
  const start = previous ? addDays(previous.billingPeriodEnd, 1) : rentalStart;
  const monthEnd = lastDayOfMonth(start);
  const cappedByRental = Boolean(rentalEnd && rentalEnd < monthEnd);
  let end = cappedByRental && rentalEnd ? rentalEnd : monthEnd;
  if (end < start) end = start;
  const days = daysBetween(start, end) + 1;
  const quantity =
    rental.rateUnit === RateUnit.week ? days / 7 : rental.rateUnit === RateUnit.month ? days / Number(monthEnd.slice(8, 10)) : days;
  return {
    rentalId: rental.id,
    periodStart: start,
    periodEnd: end,
    line: {
      description: `${asset ? `Rent for ${asset}` : `Rent on ${ref}`}, ${formatShortDate(start)} to ${formatShortDate(end)}`,
      quantity: String(Math.round(quantity * 100) / 100),
      rate: String(rental.rate),
    },
    basis: `${
      previous
        ? `The period starts the day after ${previous.invoiceNumber} ended (${formatShortDate(previous.billingPeriodEnd)})`
        : `The period starts when ${ref} started (${formatShortDate(rentalStart)})`
    } and runs to ${cappedByRental ? `the rental's end (${formatShortDate(end)})` : "the end of that month"}. The first line uses ${ref}'s rate of ${formatMoney(rental.rate)} ${formatRateUnit(rental.rateUnit)}${
      rental.rateUnit === RateUnit.shift ? ", counted as one shift a day" : ""
    }.`,
  };
}

const num = (value: string | undefined) => (value === undefined || value.trim() === "" ? null : Number(value));

/**
 * Mirrors createInvoiceRequestSchema: period end ≥ start (error on the end),
 * due date ≥ period end (error on the due date), at least one line, each line
 * a description (≤ 300), quantity > 0 and rate ≥ 0; tax ≥ 0 and an
 * adjustment that may be negative; notes ≤ 2000. Issues are raised in the
 * order the form reads, so the first one is the field that gets focus.
 */
const createInvoiceSchema = z
  .custom<InvoiceValues>()
  .superRefine((v, ctx) => {
    const fail = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (!v.rentalId.trim()) fail("rentalId", "Choose the rental this invoice is for.");
    if (!v.billingPeriodStart) fail("billingPeriodStart", "Pick the first day this invoice covers.");
    if (!v.billingPeriodEnd) fail("billingPeriodEnd", "Pick the last day this invoice covers.");
    else if (v.billingPeriodStart && v.billingPeriodEnd < v.billingPeriodStart)
      fail("billingPeriodEnd", `The period can't end before it starts (${formatShortDate(v.billingPeriodStart)}). Pick a later date.`);
    if (!v.dueDate) fail("dueDate", "Pick the date payment is due.");
    else if (v.billingPeriodEnd && v.dueDate < v.billingPeriodEnd)
      fail("dueDate", `Due date can't be before the billing period ends (${formatShortDate(v.billingPeriodEnd)}).`);
    v.lineItems.forEach((_, index) => {
      const description = (v[cell(index, "description")] ?? "").trim();
      const quantity = num(v[cell(index, "quantity")]);
      const rate = num(v[cell(index, "rate")]);
      if (!description) fail(cell(index, "description"), "Describe the line, e.g. Rent for 30 days.");
      else if (description.length > 300) fail(cell(index, "description"), `Descriptions are up to 300 characters. This has ${description.length}.`);
      if (quantity === null) fail(cell(index, "quantity"), "Enter the quantity.");
      else if (!(quantity > 0)) fail(cell(index, "quantity"), "Enter a quantity above 0, e.g. 30.");
      if (rate === null) fail(cell(index, "rate"), "Enter the rate.");
      else if (!(rate >= 0)) fail(cell(index, "rate"), "Enter a rate of ₹0 or more.");
    });
    if (v.lineItems.length === 0) fail("lineItems", "Add at least one line — for example, days on rent.");
    const tax = num(v.taxAmount);
    const adjustment = num(v.adjustmentAmount);
    if (tax !== null && !(tax >= 0)) fail("taxAmount", "Enter tax as ₹0 or more, or leave it empty.");
    if (adjustment !== null && Number.isNaN(adjustment)) fail("adjustmentAmount", "Enter the adjustment as a number — negative for a discount, e.g. -500.");
    const notes = v.notes.trim();
    if (notes.length > 2000) fail("notes", `Notes are up to 2,000 characters. This has ${notes.length.toLocaleString("en-IN")}.`);
  })
  .transform(
    (v): CreateInvoiceRequest => ({
      rentalId: v.rentalId.trim(),
      billingPeriodStart: v.billingPeriodStart,
      billingPeriodEnd: v.billingPeriodEnd,
      dueDate: v.dueDate,
      taxAmount: num(v.taxAmount) ?? undefined,
      adjustmentAmount: num(v.adjustmentAmount) ?? undefined,
      notes: v.notes.trim() || undefined,
      lineItems: v.lineItems.map((_, index) => ({
        description: (v[cell(index, "description")] ?? "").trim(),
        quantity: Number(v[cell(index, "quantity")]),
        rate: Number(v[cell(index, "rate")]),
      })),
    }),
  );

/** Raise an invoice by hand for one billing period. Saved as a Draft. */
export function CreateInvoiceDialog({
  open,
  onClose,
  organizationId,
  rentals,
  invoices,
  machineCodes,
  customerNames,
  initialRentalId,
  onCreated,
  onOpenInvoice,
}: CreateInvoiceDialogProps) {
  const toast = useToast();
  const today = todayIsoDate();

  const form = useForm({ schema: createInvoiceSchema, initial: blankInvoice(""), failTitle: "The invoice wasn't created" });
  const { values, set, reset, online } = form;
  // A 404 on create means the rental isn't this organization's: said under the
  // rental field, which the hook's generic "can't find that record" banner can't do.
  const [rentalMissing, setRentalMissing] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<(Suggestion & { keptPeriod: boolean; keptLines: boolean }) | null>(null);
  const edited = useRef({ period: false, lines: false });
  const suggestedFor = useRef("");

  const lineValue = (index: number, field: LineField) => values[cell(index, field)] ?? "";

  function replaceLines(rows: LineRow[]) {
    set("lineItems", rows.map(() => newLineId()));
    rows.forEach((row, index) => LINE_FIELDS.forEach((field) => set(cell(index, field), row[field])));
  }

  // Reset on open and on close — clearing on close means a stale rental from
  // the last time can't feed the suggestion effect when it opens again.
  useEffect(() => {
    reset(blankInvoice(open ? (initialRentalId ?? "") : ""));
    setRentalMissing(null);
    setSuggestion(null);
    edited.current = { period: false, lines: false };
    suggestedFor.current = "";
  }, [open, initialRentalId, reset]);

  const rentalId = values.rentalId;
  const rental = rentals?.find((r) => r.id === rentalId) ?? null;
  const assetOf = (r: Rental) => machineCodes.get(r.machineId) ?? r.machineAssetCode ?? null;

  // Suggest a period and a first line for the chosen rental (once per rental).
  useEffect(() => {
    if (!open || !rental || suggestedFor.current === rental.id) return;
    suggestedFor.current = rental.id;
    const next = suggestFor(rental, invoices, assetOf(rental));
    if (!edited.current.period) {
      set("billingPeriodStart", next.periodStart);
      set("billingPeriodEnd", next.periodEnd);
    }
    if (!edited.current.lines) replaceLines([next.line]);
    setSuggestion({ ...next, keptPeriod: edited.current.period, keptLines: edited.current.lines });
    // assetOf reads the latest machine codes
  }, [open, rental, invoices]);

  const ref = rental ? rentalRef(rental.id) : rentalId ? rentalRef(rentalId) : "the rental";

  // ------------------------------------------------------------ totals and warnings
  const { errors } = form;
  let subtotal = 0;
  values.lineItems.forEach((_, index) => {
    const quantity = num(lineValue(index, "quantity"));
    const rate = num(lineValue(index, "rate"));
    if (quantity !== null && rate !== null && quantity > 0 && rate >= 0) subtotal += quantity * rate;
  });
  const tax = num(values.taxAmount);
  const adjustment = num(values.adjustmentAmount);
  const taxValid = tax !== null && tax >= 0;
  const adjustmentValid = adjustment !== null && !Number.isNaN(adjustment);
  const total = subtotal + (taxValid ? tax : 0) + (adjustmentValid ? adjustment : 0);

  const warnings: Partial<Record<keyof InvoiceValues, string>> = {};
  const { billingPeriodStart: periodStart, billingPeriodEnd: periodEnd, dueDate } = values;
  if (rental && periodStart) {
    const rentalStart = rental.actualStartDate ?? rental.startDate;
    if (periodStart < rentalStart) warnings.billingPeriodStart = `${ref} started on ${formatDate(rentalStart)} — this period starts before that.`;
  }
  if (rental && periodStart && periodEnd && periodEnd >= periodStart) {
    const rentalEnd = rental.actualEndDate ?? rental.endDate;
    const overlap = invoices.find(
      (i) => i.rentalId === rental.id && i.status !== InvoiceStatus.cancelled && i.billingPeriodStart <= periodEnd && periodStart <= i.billingPeriodEnd,
    );
    if (overlap)
      warnings.billingPeriodEnd = `${overlap.invoiceNumber} already covers ${formatDateRange(overlap.billingPeriodStart, overlap.billingPeriodEnd)}. Check you aren't billing the same days twice.`;
    else if (rentalEnd && periodEnd > rentalEnd) warnings.billingPeriodEnd = `${ref} ends on ${formatDate(rentalEnd)} — this period runs past it.`;
  }
  if (dueDate && (!periodEnd || dueDate >= periodEnd) && dueDate < today)
    warnings.dueDate = "This date has already passed — the invoice shows as overdue as soon as it's issued.";
  if ((values.adjustmentAmount.trim() === "" || adjustmentValid) && subtotal > 0 && total <= 0)
    warnings.adjustmentAmount = `This makes the total ${formatMoney(total)}. Check the adjustment.`;

  function bindTop(key: "billingPeriodStart" | "billingPeriodEnd" | "dueDate" | "taxAmount" | "adjustmentAmount" | "notes") {
    const field = form.field(key);
    return {
      ...field,
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (key === "billingPeriodStart" || key === "billingPeriodEnd") edited.current.period = true;
        set(key, event.target.value);
      },
      warning: warnings[key],
    };
  }

  function bindCell(index: number, field: LineField) {
    const name = cell(index, field);
    return {
      ...form.field(name),
      onChange: (event: { target: { value: string } }) => {
        edited.current.lines = true;
        set(name, event.target.value);
      },
    };
  }

  function setRental(value: string) {
    set("rentalId", value);
    setRentalMissing(null);
  }

  function addLine() {
    edited.current.lines = true;
    const index = values.lineItems.length;
    set("lineItems", [...values.lineItems, newLineId()]);
    LINE_FIELDS.forEach((field) => set(cell(index, field), ""));
  }

  /** Cells are keyed by index, so the lines after this one move up a place. */
  function removeLine(index: number) {
    edited.current.lines = true;
    for (let next = index + 1; next < values.lineItems.length; next += 1) {
      LINE_FIELDS.forEach((field) => set(cell(next - 1, field), lineValue(next, field)));
    }
    set("lineItems", values.lineItems.filter((_, i) => i !== index));
  }

  const save = form.submit(async (input) => {
    setRentalMissing(null);
    let created: Invoice;
    try {
      created = (await apiClient.createInvoice(organizationId, input)) as Invoice;
    } catch (err) {
      // A 404 means the rental id (typed or stale) isn't this organization's: say it under the field, not in a banner.
      if (err instanceof ApiError && err.status === 404) return setRentalMissing(`${ref} isn't one of your organization's rentals. Pick another rental.`);
      throw err;
    }
    toast.success({
      title: `Invoice ${created.invoiceNumber} created as a draft`,
      body: `${formatMoney(created.totalAmount)} for ${rentalRef(created.rentalId)} · ${formatDateRange(created.billingPeriodStart, created.billingPeriodEnd)}. Issue it when it's ready to send.`,
      action: onOpenInvoice ? { label: "Open", onClick: () => onOpenInvoice(created.id) } : undefined,
    });
    onCreated(created);
    onClose();
  });

  const rentalOptions = useMemo(
    () =>
      [...(rentals ?? [])]
        .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.startDate.localeCompare(a.startDate))
        .map((r) => {
          const customer = customerOf(r, customerNames);
          return {
            value: r.id,
            label: `${rentalRef(r.id)} · ${machineCodes.get(r.machineId) ?? r.machineAssetCode ?? "machine"}`,
            description: [customer?.name, statusLabel("rental", r.status), formatDateRange(r.startDate, r.endDate)].filter(Boolean).join(" · "),
            keywords: [customer?.name, r.projectName, r.projectLocation].filter(Boolean).join(" "),
          };
        }),
    [rentals, machineCodes, customerNames],
  );

  const noRentals = Array.isArray(rentals) && rentals.length === 0;
  const lineAmount = (index: number) => {
    const quantity = num(lineValue(index, "quantity"));
    const rate = num(lineValue(index, "rate"));
    return quantity !== null && rate !== null && quantity > 0 && rate >= 0 ? formatMoney(quantity * rate) : "—";
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create an invoice"
      description="Invoices are entered by hand, one billing period at a time. It's saved as a Draft — issuing it is a separate step."
      icon="invoice"
      tone="info"
      size="lg"
      dismissible={!form.busy}
      onSubmit={save}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose} disabled={form.busy}>
            Cancel
          </Button>
          <Button type="submit" busy={form.busy} busyLabel="Creating…" disabled={noRentals || !online} title={online ? undefined : "You're offline — nothing can be saved yet."}>
            Create invoice
          </Button>
        </>
      }
    >
      {form.banner && (
        <FormBanner tone="error" title={form.banner.title}>
          {form.banner.body}
        </FormBanner>
      )}
      {!online && (
        <FormBanner tone="warning" title="You're offline">
          Nothing can be saved until the connection is back. Your entries are kept.
        </FormBanner>
      )}
      {noRentals ? (
        <FormBanner tone="info" title="There's no rental to invoice yet">
          Invoices are raised against a rental. Create a rental first.
        </FormBanner>
      ) : (
        <>
          <FormSection title="Rental and billing period">
            <div data-field="rentalId">
              {rentals === null ? (
                <Input
                  label="Rental ID"
                  required
                  mono
                  {...form.field("rentalId")}
                  onChange={(event) => setRental(event.target.value)}
                  error={errors.rentalId ?? rentalMissing ?? undefined}
                  hint="Your role can't list rentals (that needs the Rentals permission). Paste the rental's ID."
                />
              ) : (
                <SearchSelect
                  label="Rental"
                  name="rentalId"
                  required
                  options={rentalOptions}
                  loading={rentals === undefined}
                  value={rentalId}
                  onChange={setRental}
                  onBlur={form.field("rentalId").onBlur}
                  placeholder="Search by rental, machine or customer"
                  emptyText="No rental matches."
                  error={errors.rentalId ?? rentalMissing ?? undefined}
                  hint={
                    rental
                      ? `${statusLabel("rental", rental.status)} · ${formatDateRange(rental.startDate, rental.endDate)} · ${formatMoney(rental.rate)} ${formatRateUnit(rental.rateUnit)}`
                      : "Running and returning rentals are listed first."
                  }
                />
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div data-field="periodStart">
                <Input label="Period starts" required type="date" mono {...bindTop("billingPeriodStart")} />
              </div>
              <div data-field="periodEnd">
                <Input label="Period ends" required type="date" mono min={values.billingPeriodStart || undefined} {...bindTop("billingPeriodEnd")} />
              </div>
              <div data-field="dueDate">
                <Input
                  label="Due date"
                  required
                  type="date"
                  mono
                  min={values.billingPeriodEnd || undefined}
                  {...bindTop("dueDate")}
                  hint={rental?.paymentTerms ? `Payment terms on ${ref}: “${rental.paymentTerms}”` : "On or after the period ends."}
                />
              </div>
            </div>
            {suggestion && suggestion.rentalId === rentalId && (
              <Alert tone="info" title="Suggested from the rental — change anything that's different">
                {suggestion.basis}
                {suggestion.keptPeriod || suggestion.keptLines
                  ? ` Your own ${[suggestion.keptPeriod && "dates", suggestion.keptLines && "lines"].filter(Boolean).join(" and ")} were kept.`
                  : ""}
              </Alert>
            )}
          </FormSection>

          <FormSection
            title="Lines"
            description="What you're charging for. Each line's amount is its quantity times its rate."
            className="border-t border-border pt-4"
          >
            <div className="flex flex-col gap-2">
              {values.lineItems.length > 0 && (
                <div
                  aria-hidden="true"
                  className="hidden gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-meta sm:grid sm:grid-cols-[minmax(0,1fr)_84px_124px_104px_28px]"
                >
                  <span>
                    Description <span className="font-normal normal-case tracking-normal text-destructive">required</span>
                  </span>
                  <span>
                    Qty <span className="font-normal normal-case tracking-normal text-destructive">required</span>
                  </span>
                  <span>
                    Rate <span className="font-normal normal-case tracking-normal text-destructive">required</span>
                  </span>
                  <span className="text-right">Amount</span>
                  <span />
                </div>
              )}
              {values.lineItems.map((lineId, index) => (
                <div
                  key={lineId}
                  role="group"
                  aria-label={`Line ${index + 1}`}
                  className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[minmax(0,1fr)_84px_124px_104px_28px]"
                >
                  <Input
                    aria-label={`Line ${index + 1} description`}
                    aria-required
                    placeholder="Description, e.g. Rent for 30 days"
                    {...bindCell(index, "description")}
                  />
                  <Input
                    aria-label={`Line ${index + 1} quantity`}
                    aria-required
                    placeholder="Qty"
                    mono
                    inputMode="decimal"
                    {...bindCell(index, "quantity")}
                  />
                  <Input
                    aria-label={`Line ${index + 1} rate in rupees`}
                    aria-required
                    placeholder="Rate"
                    prefix="₹"
                    mono
                    inputMode="decimal"
                    {...bindCell(index, "rate")}
                  />
                  <span className="flex h-[34px] items-center justify-end font-mono text-sm text-ink" aria-label={`Line ${index + 1} amount`}>
                    {lineAmount(index)}
                  </span>
                  <span className="flex h-[34px] items-center justify-end">
                    <IconButton
                      icon="close"
                      label={`Remove line ${index + 1}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => removeLine(index)}
                    />
                  </span>
                </div>
              ))}
              {errors.lineItems && <FieldMessage tone="error">{errors.lineItems}</FieldMessage>}
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="plus"
                  name="lineItems"
                  onClick={addLine}
                >
                  Add line
                </Button>
              </div>
            </div>
          </FormSection>

          <FormSection title="Tax, adjustment and total" className="border-t border-border pt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div data-field="taxAmount">
                <Input label="Tax" prefix="₹" mono inputMode="decimal" {...bindTop("taxAmount")} hint="The tax amount in rupees — FleetIP doesn't work it out." />
              </div>
              <div data-field="adjustmentAmount">
                <Input
                  label="Adjustment"
                  prefix="₹"
                  mono
                  inputMode="decimal"
                  {...bindTop("adjustmentAmount")}
                  hint="Negative for a discount or credit, e.g. -500."
                />
              </div>
            </div>
            <dl aria-label="Invoice total" className="m-0 flex flex-col gap-1.5 rounded-panel border border-border-strong bg-surface-sunk px-3.5 py-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd className="m-0 font-mono text-ink">{formatMoney(subtotal)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">Tax</dt>
                <dd className="m-0 font-mono text-ink">{formatMoney(taxValid ? tax : 0)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">Adjustment</dt>
                <dd className="m-0 font-mono text-ink">{formatMoney(adjustmentValid ? adjustment : 0)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-border pt-1.5">
                <dt className="font-semibold text-ink">Total</dt>
                <dd className="m-0 font-mono text-[15px] font-semibold text-ink" aria-live="polite">
                  {formatMoney(total)}
                </dd>
              </div>
            </dl>
          </FormSection>

          <div data-field="notes" className="border-t border-border pt-4">
            <Textarea label="Notes" rows={2} {...bindTop("notes")} hint="Up to 2,000 characters." />
          </div>
        </>
      )}
    </Dialog>
  );
}
