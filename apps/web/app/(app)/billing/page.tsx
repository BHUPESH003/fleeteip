"use client";

import type {
  CreateInvoiceLineItem,
  Invoice,
  InvoiceDetail,
  InvoiceStatus,
} from "@fleetip/contracts/billing";
import type { Rental } from "@fleetip/contracts/rental";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
} from "@fleetip/ui";
import { type FormEvent, useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { useSession } from "../../../lib/session-context";

const STATUS_TONE: Record<InvoiceStatus, "success" | "warning" | "neutral" | "danger"> = {
  draft: "neutral",
  issued: "warning",
  paid: "success",
  overdue: "danger",
  cancelled: "danger",
};

function CreateInvoiceForm({
  organizationId,
  rentals,
  onCreated,
}: {
  organizationId: string;
  rentals: Rental[];
  onCreated: () => void;
}) {
  const [lineItems, setLineItems] = useState<CreateInvoiceLineItem[]>([
    { description: "", quantity: 1, rate: 0 },
  ]);
  const [error, setError] = useState<string | null>(null);

  function updateLineItem(index: number, patch: Partial<CreateInvoiceLineItem>) {
    setLineItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const taxAmount = form.get("taxAmount");
    const adjustmentAmount = form.get("adjustmentAmount");

    try {
      await apiClient.createInvoice(organizationId, {
        rentalId: String(form.get("rentalId")),
        billingPeriodStart: String(form.get("billingPeriodStart")),
        billingPeriodEnd: String(form.get("billingPeriodEnd")),
        dueDate: String(form.get("dueDate")),
        taxAmount: taxAmount ? Number(taxAmount) : undefined,
        adjustmentAmount: adjustmentAmount ? Number(adjustmentAmount) : undefined,
        lineItems: lineItems.filter((item) => item.description),
      });
      formElement.reset();
      setLineItems([{ description: "", quantity: 1, rate: 0 }]);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice");
    }
  }

  if (rentals.length === 0) {
    return (
      <Card className="mb-8 mt-4">
        <EmptyState title="No rentals to bill" description="Create a rental before invoicing it." />
      </Card>
    );
  }

  return (
    <Card className="mb-8 mt-4">
      <h2 className="mb-4 text-lg font-medium text-gray-900">Create an invoice</h2>
      {error && <ErrorState message={error} />}
      <form onSubmit={handleCreate} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Rental</label>
            <select
              name="rentalId"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {rentals.map((rental) => (
                <option key={rental.id} value={rental.id}>
                  {rental.clientSnapshot?.name ??
                    `Renter ${rental.renterOrganizationId?.slice(0, 8)}`}{" "}
                  · {rental.startDate}
                </option>
              ))}
            </select>
          </div>
          <Input label="Billing period start" name="billingPeriodStart" type="date" required />
          <Input label="Billing period end" name="billingPeriodEnd" type="date" required />
          <Input label="Due date" name="dueDate" type="date" required />
          <Input label="Tax amount" name="taxAmount" type="number" step="0.01" />
          <Input label="Adjustment (+/-)" name="adjustmentAmount" type="number" step="0.01" />
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-gray-700">Line items</span>
          <div className="flex flex-col gap-2">
            {lineItems.map((item, index) => (
              <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_1fr]">
                <input
                  placeholder="Description"
                  value={item.description}
                  onChange={(event) => updateLineItem(index, { description: event.target.value })}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  placeholder="Quantity"
                  value={item.quantity}
                  onChange={(event) =>
                    updateLineItem(index, { quantity: Number(event.target.value) })
                  }
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Rate"
                  value={item.rate}
                  onChange={(event) => updateLineItem(index, { rate: Number(event.target.value) })}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              setLineItems((prev) => [...prev, { description: "", quantity: 1, rate: 0 }])
            }
            className="mt-2 text-xs font-medium text-blue-600 hover:underline"
          >
            + Add line item
          </button>
        </div>

        <div>
          <Button type="submit">Create invoice</Button>
        </div>
      </form>
    </Card>
  );
}

function InvoiceRow({
  invoice,
  organizationId,
  canManage,
  onChanged,
}: {
  invoice: Invoice;
  organizationId: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setDetail((await apiClient.getInvoiceDetail(organizationId, invoice.id)) as InvoiceDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoice");
    }
  }

  async function toggle() {
    setExpanded((prev) => !prev);
    if (!expanded) await load();
  }

  async function handleStatus(status: "issued" | "cancelled") {
    try {
      await apiClient.updateInvoiceStatus(organizationId, invoice.id, status);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update invoice");
    }
  }

  async function handlePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await apiClient.recordPayment(organizationId, invoice.id, {
        amount: Number(form.get("amount")),
        paidDate: String(form.get("paidDate")),
        method: form.get("method") ? String(form.get("method")) : undefined,
      });
      event.currentTarget.reset();
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment");
    }
  }

  return (
    <>
      <tr className="border-b border-gray-100">
        <td className="py-2 pr-4 font-medium text-gray-900">
          {invoice.invoiceNumber}
          <span className="block text-xs font-normal text-gray-500 sm:hidden">
            Due {invoice.dueDate}
          </span>
        </td>
        <td className="hidden py-2 pr-4 sm:table-cell">
          {invoice.billingPeriodStart} → {invoice.billingPeriodEnd}
        </td>
        <td className="py-2 pr-4">{invoice.totalAmount}</td>
        <td className="hidden py-2 pr-4 sm:table-cell">{invoice.dueDate}</td>
        <td className="py-2 pr-4">
          <Badge tone={STATUS_TONE[invoice.status]}>{invoice.status}</Badge>
        </td>
        <td className="py-2 pr-4">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-2">
            <button
              onClick={() => void toggle()}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              {expanded ? "Hide" : "Details"}
            </button>
            {canManage && invoice.status === "draft" && (
              <button
                onClick={() => void handleStatus("issued")}
                className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                Issue
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-100 bg-gray-50">
          <td colSpan={6} className="px-4 py-4">
            {error && <ErrorState message={error} />}
            {detail && (
              <>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">Line items</h3>
                <ul className="mb-3 flex flex-col gap-1 text-sm">
                  {detail.lineItems.map((item) => (
                    <li key={item.id}>
                      {item.description} — {item.quantity} × {item.rate} = {item.amount}
                    </li>
                  ))}
                </ul>
                <p className="mb-3 text-sm text-gray-700">
                  Paid {detail.amountPaid} · Balance due {detail.balanceDue}
                </p>
                {detail.payments.length > 0 && (
                  <>
                    <h3 className="mb-2 text-sm font-semibold text-gray-900">Payments</h3>
                    <ul className="mb-3 flex flex-col gap-1 text-sm">
                      {detail.payments.map((payment) => (
                        <li key={payment.id}>
                          {payment.paidDate} — {payment.amount} ({payment.method ?? "—"})
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {canManage && (invoice.status === "issued" || invoice.status === "overdue") && (
                  <form
                    onSubmit={(event) => void handlePayment(event)}
                    className="flex flex-wrap items-end gap-3"
                  >
                    <Input label="Amount" name="amount" type="number" step="0.01" required />
                    <Input label="Paid date" name="paidDate" type="date" required />
                    <Input label="Method" name="method" />
                    <Button type="submit">Record payment</Button>
                  </form>
                )}
              </>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function BillingPage() {
  const { currentMembership } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!organizationId) return;
    setInvoices((await apiClient.listInvoices(organizationId)) as Invoice[]);
  }

  useEffect(() => {
    if (!organizationId || !organizationType) return;
    void (async () => {
      try {
        setInvoices((await apiClient.listInvoices(organizationId)) as Invoice[]);
        if (organizationType === "rental_company") {
          setRentals((await apiClient.listRentals(organizationId)) as Rental[]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load invoices");
      } finally {
        setLoading(false);
      }
    })();
  }, [organizationId, organizationType]);

  if (!organizationId || !organizationType) return null;

  return (
    <>
      <PageHeader
        title="Billing"
        description={
          organizationType === "rental_company"
            ? "Invoice your Rentals and track payments."
            : "Invoices issued for your Rentals."
        }
      />
      {loading ? (
        <LoadingState label="Loading invoices…" />
      ) : (
        <>
          {error && <ErrorState message={error} />}
          {organizationType === "rental_company" && (
            <CreateInvoiceForm
              organizationId={organizationId}
              rentals={rentals}
              onCreated={() => void refresh()}
            />
          )}
          <Card>
            <h2 className="mb-4 text-lg font-medium text-gray-900">Invoices</h2>
            {invoices.length === 0 ? (
              <EmptyState title="No invoices yet" description="Nothing to show yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500">
                      <th className="py-2 pr-4 font-medium">Invoice</th>
                      <th className="hidden py-2 pr-4 font-medium sm:table-cell">Period</th>
                      <th className="py-2 pr-4 font-medium">Total</th>
                      <th className="hidden py-2 pr-4 font-medium sm:table-cell">Due</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => (
                      <InvoiceRow
                        key={invoice.id}
                        invoice={invoice}
                        organizationId={organizationId}
                        canManage={organizationType === "rental_company"}
                        onChanged={() => void refresh()}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
