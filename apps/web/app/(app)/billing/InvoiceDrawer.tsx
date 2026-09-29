"use client";

import { InvoiceStatus, type Invoice, type InvoiceDetail, type RecordPaymentRequest } from "@fleetip/contracts/billing";
import {
  Button,
  DescriptionList,
  Drawer,
  ErrorState,
  FormBanner,
  Input,
  KeyFigures,
  Menu,
  Skeleton,
  Table,
  Tbody,
  Td,
  Textarea,
  Th,
  Thead,
  Tr,
  UILink,
  useToast,
  type MenuItem,
} from "@fleetip/ui";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ApiError, apiClient } from "../../../lib/api-client";
import { OFFLINE_HINT, describeError, errorStatus } from "../../../lib/errors";
import { useForm } from "../../../lib/form";
import {
  formatDate,
  formatDateRange,
  formatDateTime,
  formatMoney,
  formatNumber,
  plural,
  rentalRef,
  todayIsoDate,
} from "../../../lib/format";
import { Status } from "../../../lib/status";
import { SectionLabel, TEXT_LINK } from "../maintenance/list-kit";
import { daysOverdue, effectiveStatus, isUnpaid } from "./shared";

export interface InvoiceContext {
  rentalHref: string | null;
  customerLabel: string;
  customer: string | null;
  machine: string | null;
}

/**
 * Invoice detail: line items, payments, amount paid, balance due — the
 * only place balanceDue exists (plan §1). Loaded fresh on open (which is
 * also what flips an issued invoice past its due date to overdue).
 * Actions for billing.manage: Issue (draft), Record payment
 * (issued/overdue, no confirmation), Cancel invoice (in the menu).
 */
export function InvoiceDrawer({
  organizationId,
  invoiceId,
  invoice,
  cached,
  context,
  canManage,
  online,
  refreshKey,
  paying,
  onPayingChange,
  dismissible,
  onClose,
  onIssue,
  onCancel,
  onDetail,
  onPaymentRecorded,
}: {
  organizationId: string;
  invoiceId: string;
  /** The list row, shown while the detail loads. */
  invoice: Invoice | undefined;
  cached: InvoiceDetail | undefined;
  context: InvoiceContext;
  canManage: boolean;
  online: boolean;
  /** Bumped by the page after a write so the detail reloads. */
  refreshKey: number;
  paying: boolean;
  onPayingChange: (paying: boolean) => void;
  /** False while a confirmation is open on top, so Esc only closes that. */
  dismissible: boolean;
  onClose: () => void;
  onIssue: (invoice: Invoice) => void;
  onCancel: (invoice: Invoice, amountPaid: number | null) => void;
  onDetail: (detail: InvoiceDetail) => void;
  onPaymentRecorded: (invoiceId: string) => void;
}) {
  const [detail, setDetail] = useState<InvoiceDetail | null>(cached ?? null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const onDetailRef = useRef(onDetail);
  onDetailRef.current = onDetail;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const fresh = (await apiClient.getInvoiceDetail(organizationId, invoiceId)) as InvoiceDetail;
      setDetail(fresh);
      onDetailRef.current(fresh);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // load() reads the latest invoiceId/organizationId
  }, [invoiceId, organizationId, refreshKey]);

  const today = todayIsoDate();
  const current = detail?.invoice ?? invoice;
  const status = current ? effectiveStatus(current, detail, today) : null;
  const number = current?.invoiceNumber ?? "Invoice";

  const menuItems: MenuItem[] = current
    ? [
        ...(context.rentalHref
          ? [{ key: "rental", label: `Open ${rentalRef(current.rentalId)}`, icon: "rental" as const, href: context.rentalHref, hint: "Terms, logsheets and transport." }]
          : []),
        {
          key: "cancel",
          label: "Cancel invoice",
          icon: "close",
          danger: true,
          separatorBefore: Boolean(context.rentalHref),
          disabled: !online || !status || !(status === InvoiceStatus.draft || isUnpaid(status)),
          hint: !online
            ? OFFLINE_HINT
            : status === InvoiceStatus.paid
              ? "Paid invoices stay on record as they are."
              : status === InvoiceStatus.cancelled
                ? "This invoice is already cancelled."
                : "It stays on record as Cancelled. Payments aren't reversed.",
          onSelect: () => onCancel(current, detail?.amountPaid ?? null),
        },
      ]
    : [];

  const footer =
    canManage && current && status && !paying && (status === InvoiceStatus.draft || isUnpaid(status)) ? (
      <>
        {status === InvoiceStatus.draft && (
          <Button icon="invoice" onClick={() => onIssue(current)} disabled={!online} title={online ? undefined : OFFLINE_HINT}>
            Issue invoice
          </Button>
        )}
        {isUnpaid(status) && (
          <Button icon="payment" onClick={() => onPayingChange(true)} disabled={!online || !detail} title={online ? undefined : OFFLINE_HINT}>
            Record payment
          </Button>
        )}
      </>
    ) : undefined;

  return (
    <Drawer
      open
      onClose={onClose}
      kicker="Invoice"
      title={<span className="font-mono">{number}</span>}
      dismissible={dismissible}
      footer={footer}
    >
      <div className="flex flex-col gap-4 px-[18px] py-4">
        {!current && loading ? (
          <DrawerSkeleton />
        ) : error && !detail ? (
          <ErrorState
            title={errorStatus(error) === 404 ? "We can't find this invoice" : "This invoice didn't load"}
            message={
              errorStatus(error) === 404
                ? "It may belong to another organization, or the link is wrong. Invoices are never deleted."
                : describeError(error).body
            }
            action={
              errorStatus(error) === 404 ? undefined : (
                <Button variant="secondary" size="sm" onClick={() => void load()}>
                  Try again
                </Button>
              )
            }
          />
        ) : current && status ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Status domain="invoice" value={status} />
              <span className="text-xs text-meta">
                {status === InvoiceStatus.overdue
                  ? `Due ${formatDate(current.dueDate)} · ${plural(Math.max(1, daysOverdue(current, today)), "day")} overdue`
                  : status === InvoiceStatus.issued
                    ? `Due ${formatDate(current.dueDate)}`
                    : status === InvoiceStatus.draft
                      ? "Not issued yet"
                      : status === InvoiceStatus.paid
                        ? "Paid in full"
                        : "Kept on record as cancelled"}
              </span>
              {canManage && menuItems.length > 0 && (
                <Menu className="ml-auto" label={`More actions for ${number}`} items={menuItems} width={292} triggerSize="sm" />
              )}
            </div>

            {detail ? (
              <KeyFigures
                label="Invoice amounts"
                items={[
                  { key: "total", label: "Total", value: formatMoney(current.totalAmount), context: `${plural(detail.lineItems.length, "line")} · tax ${formatMoney(current.taxAmount)}` },
                  { key: "paid", label: "Paid", value: formatMoney(detail.amountPaid), context: detail.payments.length ? plural(detail.payments.length, "payment") : "Nothing recorded yet" },
                  {
                    key: "balance",
                    label: "Balance due",
                    value: formatMoney(Math.max(0, detail.balanceDue)),
                    context:
                      detail.balanceDue < 0
                        ? `${formatMoney(-detail.balanceDue)} paid over the total`
                        : status === InvoiceStatus.draft
                          ? "Once issued"
                          : status === InvoiceStatus.cancelled
                            ? "Not collected — cancelled"
                            : detail.balanceDue === 0
                              ? "Nothing left to pay"
                              : `By ${formatDate(current.dueDate)}`,
                    tone: status === InvoiceStatus.overdue && detail.balanceDue > 0 ? "danger" : "default",
                  },
                ]}
              />
            ) : (
              <Skeleton className="h-[78px] rounded-panel" />
            )}

            {paying && detail && canManage && (
              <PaymentForm
                organizationId={organizationId}
                invoice={current}
                detail={detail}
                online={online}
                onCancel={() => onPayingChange(false)}
                onRecorded={() => {
                  onPayingChange(false);
                  onPaymentRecorded(current.id);
                  void load();
                }}
              />
            )}

            <DescriptionList
              layout="rows"
              items={[
                {
                  label: "Rental",
                  value: context.rentalHref ? (
                    <UILink href={context.rentalHref} className={TEXT_LINK}>
                      {rentalRef(current.rentalId)}
                    </UILink>
                  ) : (
                    rentalRef(current.rentalId)
                  ),
                  mono: true,
                },
                { label: context.customerLabel, value: context.customer },
                { label: "Machine", value: context.machine, mono: true },
                { label: "Billing period", value: formatDateRange(current.billingPeriodStart, current.billingPeriodEnd), mono: true },
                { label: "Due date", value: formatDate(current.dueDate), mono: true },
                { label: "Raised", value: formatDateTime(current.createdAt), mono: true },
                { label: "Notes", value: current.notes, emptyText: "No notes" },
              ]}
            />

            <section aria-label="Line items" className="flex flex-col gap-2">
              <SectionLabel>Line items</SectionLabel>
              {detail ? (
                <div className="overflow-hidden rounded-panel border border-border-strong">
                  <Table bare minWidth={380} caption={`Line items on ${number}`}>
                    <Thead>
                      <Tr>
                        <Th className="!px-3">Description</Th>
                        <Th align="right" className="w-[64px] !px-3">
                          Qty
                        </Th>
                        <Th align="right" className="w-[92px] !px-3">
                          Rate
                        </Th>
                        <Th align="right" className="w-[100px] !px-3">
                          Amount
                        </Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {detail.lineItems.map((line) => (
                        <Tr key={line.id}>
                          <Td className="!px-3 text-xs">{line.description}</Td>
                          <Td align="right" className="!px-3 font-mono text-xs">
                            {formatNumber(line.quantity, 2)}
                          </Td>
                          <Td align="right" className="!px-3 font-mono text-xs">
                            {formatMoney(line.rate)}
                          </Td>
                          <Td align="right" className="!px-3 font-mono text-xs font-medium">
                            {formatMoney(line.amount)}
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                  <dl className="m-0 flex flex-col gap-1 border-t border-border bg-surface-sunk px-3 py-2.5 text-xs">
                    <TotalRow label="Subtotal" value={formatMoney(current.subtotal)} />
                    <TotalRow label="Tax" value={formatMoney(current.taxAmount)} />
                    <TotalRow label="Adjustment" value={formatMoney(current.adjustmentAmount)} />
                    <TotalRow label="Total" value={formatMoney(current.totalAmount)} strong />
                  </dl>
                </div>
              ) : (
                <Skeleton className="h-24 rounded-panel" />
              )}
            </section>

            <section aria-label="Payments" className="flex flex-col gap-2">
              <SectionLabel>Payments</SectionLabel>
              {!detail ? (
                <Skeleton className="h-16 rounded-panel" />
              ) : detail.payments.length === 0 ? (
                <p className="m-0 text-xs leading-[1.5] text-ink-soft">
                  {status === InvoiceStatus.draft ? "Payments can be recorded once the invoice is issued." : "No payments recorded yet."}
                </p>
              ) : (
                <div className="overflow-hidden rounded-panel border border-border-strong">
                  <Table bare minWidth={380} caption={`Payments on ${number}`}>
                    <Thead>
                      <Tr>
                        <Th className="w-[104px] !px-3">Paid on</Th>
                        <Th className="!px-3">Method · reference</Th>
                        <Th align="right" className="w-[104px] !px-3">
                          Amount
                        </Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {detail.payments.map((payment) => (
                        <Tr key={payment.id}>
                          <Td className="!px-3 font-mono text-xs">{formatDate(payment.paidDate)}</Td>
                          <Td className="!px-3 text-xs">
                            <span className="block">{payment.method ?? <span className="italic text-disabled-text">Method not recorded</span>}</span>
                            {(payment.reference || payment.notes) && (
                              <span className="block text-[11px] text-meta-light">{[payment.reference, payment.notes].filter(Boolean).join(" · ")}</span>
                            )}
                          </Td>
                          <Td align="right" className="!px-3 font-mono text-xs font-medium">
                            {formatMoney(payment.amount)}
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              )}
            </section>

            {!canManage && (
              <p className="m-0 text-[11px] leading-[1.5] text-meta-light">
                Read-only. The rental company issues invoices and records the payments they receive.
              </p>
            )}
          </>
        ) : null}
      </div>
    </Drawer>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? "flex items-baseline justify-between gap-3 border-t border-border pt-1.5" : "flex items-baseline justify-between gap-3"}>
      <dt className={strong ? "font-semibold text-ink" : "text-ink-muted"}>{label}</dt>
      <dd className={strong ? "m-0 font-mono text-sm font-semibold text-ink" : "m-0 font-mono text-ink"}>{value}</dd>
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-[78px] rounded-panel" />
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-24 rounded-panel" />
      <span role="status" className="text-xs text-meta">
        Loading invoice…
      </span>
    </div>
  );
}

type PaymentValues = Record<"amount" | "paidDate" | "method" | "reference" | "notes", string>;

/**
 * Mirrors recordPaymentRequestSchema: amount > 0, paid date required,
 * method ≤ 100, reference ≤ 200, notes ≤ 1000.
 */
const paymentSchema = z
  .object({
    amount: z
      .string()
      .trim()
      .min(1, "Enter the amount received.")
      .refine((value) => Number(value) > 0, "Enter an amount above ₹0, e.g. 25000."),
    paidDate: z.string().min(1, "Pick the day the money arrived."),
    method: z.string().trim().max(100, "Method is up to 100 characters."),
    reference: z.string().trim().max(200, "Reference is up to 200 characters."),
    notes: z
      .string()
      .trim()
      .refine(
        (value) => value.length <= 1000,
        (value) => ({ message: `Notes are up to 1,000 characters. This has ${value.length.toLocaleString("en-IN")}.` }),
      ),
  })
  .transform(
    (values): RecordPaymentRequest => ({
      amount: Number(values.amount),
      paidDate: values.paidDate,
      method: values.method || undefined,
      reference: values.reference || undefined,
      notes: values.notes || undefined,
    }),
  );

/**
 * Record payment — no confirmation (plan §5). Paying more than the balance
 * and a future date are warnings only (the API accepts both).
 */
function PaymentForm({
  organizationId,
  invoice,
  detail,
  online,
  onCancel,
  onRecorded,
}: {
  organizationId: string;
  invoice: Invoice;
  detail: InvoiceDetail;
  online: boolean;
  onCancel: () => void;
  onRecorded: () => void;
}) {
  const toast = useToast();
  const today = todayIsoDate();
  const balance = Math.max(0, detail.balanceDue);
  const form = useForm({
    schema: paymentSchema,
    initial: { amount: balance > 0 ? String(balance) : "", paidDate: today, method: "", reference: "", notes: "" } satisfies PaymentValues,
    failTitle: "The payment wasn't recorded",
  });
  // The API's only 409 here is "not Issued/Overdue any more", and it has its own
  // title naming the invoice, which `conflicts` (per-field only) can't express.
  const [notPayable, setNotPayable] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // After the drawer's own open-focus (which runs after child effects).
    const frame = requestAnimationFrame(() => {
      amountRef.current?.focus();
      amountRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const { values } = form;
  const amount = values.amount.trim() === "" ? null : Number(values.amount);
  const warnings: Partial<PaymentValues> = {};
  if (amount !== null && amount > 0 && amount > balance)
    warnings.amount =
      balance > 0
        ? `That's ${formatMoney(amount - balance)} more than the ${formatMoney(balance)} balance. It's recorded as entered and the invoice is marked Paid.`
        : "Nothing is left to pay on this invoice. It's recorded as entered.";
  if (values.paidDate && values.paidDate > today) warnings.paidDate = "That date hasn't happened yet. Check it — it's saved as entered.";

  const submit = form.submit(async (input) => {
    setNotPayable(false);
    let updated: Invoice;
    try {
      updated = (await apiClient.recordPayment(organizationId, invoice.id, input)) as Invoice;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) return setNotPayable(true);
      throw err;
    }
    const left = balance - input.amount;
    toast.success({
      title: `Payment recorded on ${invoice.invoiceNumber}`,
      body: `${formatMoney(input.amount)} received ${formatDate(input.paidDate)}. ${
        updated?.status === InvoiceStatus.paid || left <= 0 ? `${invoice.invoiceNumber} is now Paid.` : `Balance now ${formatMoney(left)}.`
      }`,
    });
    onRecorded();
  });

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-label={`Record a payment on ${invoice.invoiceNumber}`}
      className="flex flex-col gap-3 rounded-panel border border-border-strong bg-surface-sunk px-3.5 py-3"
    >
      <span className="text-sm font-semibold text-ink">Record a payment</span>
      {notPayable && (
        <FormBanner tone="error" title={`${invoice.invoiceNumber} can't take payments now`}>
          Payments can only be recorded while an invoice is Issued or Overdue. Reload to see its current status.
        </FormBanner>
      )}
      {form.banner && (
        <FormBanner tone="error" title={form.banner.title}>
          {form.banner.body}
        </FormBanner>
      )}
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <Input ref={amountRef} label="Amount" required prefix="₹" mono inputMode="decimal" {...form.field("amount")} warning={warnings.amount} hint={balance > 0 ? `Prefilled with the ${formatMoney(balance)} balance.` : undefined} />
        <Input label="Paid on" required type="date" mono {...form.field("paidDate")} warning={warnings.paidDate} hint="The day the money arrived." />
        <Input label="Method" placeholder="e.g. NEFT, cheque, UPI" {...form.field("method")} />
        <Input label="Reference" placeholder="e.g. UTR or cheque number" {...form.field("reference")} />
      </div>
      <Textarea label="Notes" rows={2} {...form.field("notes")} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="tertiary" onClick={onCancel} disabled={form.busy}>
          Cancel
        </Button>
        <Button type="submit" icon="payment" busy={form.busy} busyLabel="Saving…" disabled={!online} title={online ? undefined : OFFLINE_HINT}>
          Record payment
        </Button>
      </div>
    </form>
  );
}
