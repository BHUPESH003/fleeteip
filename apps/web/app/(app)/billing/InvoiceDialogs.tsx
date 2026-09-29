"use client";

import { InvoiceStatus, type Invoice } from "@fleetip/contracts/billing";
import { ConfirmDialog, FormBanner } from "@fleetip/ui";
import { useEffect } from "react";
import { apiClient } from "../../../lib/api-client";
import { useAction } from "../../../lib/form";
import { formatDate, formatDateRange, formatMoney, rentalRef, todayIsoDate } from "../../../lib/format";

export type InvoiceConfirm =
  | { kind: "issue"; invoice: Invoice; customer: { name: string; onFleetIp: boolean } | null }
  | { kind: "cancel"; invoice: Invoice; amountPaid: number | null };

/**
 * Issue (draft → issued) and Cancel invoice. Neither has an undo: an issued
 * invoice can't go back to draft and a cancelled one can't be reissued.
 * Recording a payment needs no confirmation (plan §5).
 */
export function InvoiceConfirmDialog({
  organizationId,
  confirm,
  onClose,
  onDone,
}: {
  organizationId: string;
  confirm: InvoiceConfirm | null;
  onClose: () => void;
  onDone: (invoiceId: string) => void;
}) {
  const action = useAction();
  const { clear } = action;
  const busy = action.busy;
  // The banner keeps its fixed title; the body is the translated failure.
  const failure = action.banner?.body ?? null;

  useEffect(() => {
    // clear only calls a state setter, so any render's copy will do.
    if (confirm) clear();
  }, [confirm]);

  if (!confirm) {
    return <ConfirmDialog open={false} onClose={onClose} onConfirm={() => undefined} title="" confirmLabel="" />;
  }

  const { invoice } = confirm;
  const number = invoice.invoiceNumber;
  const today = todayIsoDate();

  function run(status: typeof InvoiceStatus.issued | typeof InvoiceStatus.cancelled) {
    void action.run(() => apiClient.updateInvoiceStatus(organizationId, invoice.id, status), {
      failTitle: status === InvoiceStatus.issued ? "The invoice wasn't issued" : "The invoice wasn't cancelled",
      success: () => {
        if (status === InvoiceStatus.issued && confirm?.kind === "issue") {
          const customer = confirm.customer;
          return {
            title: `${number} issued`,
            body: `Status changed from Draft. ${
              customer
                ? customer.onFleetIp
                  ? `${customer.name} can see it in FleetIP now.`
                  : `${customer.name} isn't on FleetIP — send them the invoice yourself.`
                : "If the customer is on FleetIP, they can see it now."
            }`,
          };
        }
        return { title: `${number} cancelled`, body: "It stays on record as Cancelled. Recorded payments weren't reversed." };
      },
      onDone: () => {
        onClose();
        onDone(invoice.id);
      },
    });
  }

  if (confirm.kind === "issue") {
    const customer = confirm.customer;
    return (
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={() => run(InvoiceStatus.issued)}
        icon="invoice"
        tone="info"
        title={`Issue ${number}?`}
        description={`${formatMoney(invoice.totalAmount)} for ${rentalRef(invoice.rentalId)} · ${formatDateRange(invoice.billingPeriodStart, invoice.billingPeriodEnd)}`}
        consequences={[
          customer
            ? customer.onFleetIp
              ? `${customer.name} is notified and can see it in FleetIP.`
              : `${customer.name} isn't on FleetIP, so no one is notified — send them the invoice yourself.`
            : "If the customer is on FleetIP, they're notified and can see it.",
          `It counts as outstanding from now: ${formatMoney(invoice.totalAmount)} due by ${formatDate(invoice.dueDate)}.${
            invoice.dueDate < today ? " That date has already passed, so it shows as overdue straight away." : ""
          }`,
          "Its lines can't be changed after this — FleetIP has no invoice editing. To correct it, cancel it and raise a new one.",
        ]}
        cancelLabel="Keep as draft"
        confirmLabel="Issue invoice"
        busyLabel="Issuing…"
        busy={busy}
      >
        {failure && <FormBanner title="Nothing was changed">{failure}</FormBanner>}
      </ConfirmDialog>
    );
  }

  const paid = confirm.amountPaid;
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={() => run(InvoiceStatus.cancelled)}
      icon="close"
      tone="danger"
      confirmVariant="danger"
      title={`Cancel invoice ${number}?`}
      description={`${formatMoney(invoice.totalAmount)} for ${rentalRef(invoice.rentalId)} · ${formatDateRange(invoice.billingPeriodStart, invoice.billingPeriodEnd)}`}
      consequences={[
        "It stays on record as Cancelled.",
        paid && paid > 0
          ? `Payments already recorded against it aren't reversed — ${formatMoney(paid)} so far.`
          : "Payments already recorded against it aren't reversed.",
        "The rental isn't changed, and it no longer counts as outstanding.",
        "A cancelled invoice can't be issued again — raise a new one if the period still needs billing.",
      ]}
      cancelLabel="Keep invoice"
      confirmLabel="Cancel invoice"
      busyLabel="Cancelling…"
      busy={busy}
    >
      {failure && <FormBanner title="Nothing was changed">{failure}</FormBanner>}
    </ConfirmDialog>
  );
}
