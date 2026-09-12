"use client";

import type { Invoice, InvoiceDetail, InvoiceStatus } from "@fleetip/contracts/billing";
import type { Rental } from "@fleetip/contracts/rental";
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  StatusBadge,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@fleetip/ui";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { formatCurrencyINR, formatDate } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { CreateInvoiceDialog } from "./CreateInvoiceDialog";
import { INVOICE_STATUS_MAP, legalNextInvoiceStatuses } from "./shared";

type Filter = "all" | InvoiceStatus;
const FILTERS: Filter[] = ["all", "draft", "issued", "overdue", "paid", "cancelled"];

function InvoiceRow({
  invoice,
  organizationId,
  canManage,
  rentalLabel,
  onChanged,
}: {
  invoice: Invoice;
  organizationId: string;
  canManage: boolean;
  rentalLabel: string;
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
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await apiClient.recordPayment(organizationId, invoice.id, {
        amount: Number(form.get("amount")),
        paidDate: String(form.get("paidDate")),
        method: form.get("method") ? String(form.get("method")) : undefined,
      });
      formElement.reset();
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment");
    }
  }

  return (
    <>
      <Tr>
        <Td className="font-mono">
          {invoice.invoiceNumber}
          <span className="block text-xs font-normal text-meta sm:hidden">Due {formatDate(invoice.dueDate)}</span>
        </Td>
        <Td className="hidden sm:table-cell">{rentalLabel}</Td>
        <Td className="hidden font-mono sm:table-cell">
          {formatDate(invoice.billingPeriodStart)} → {formatDate(invoice.billingPeriodEnd)}
        </Td>
        <Td className="font-mono">{formatCurrencyINR(invoice.totalAmount)}</Td>
        <Td className="hidden font-mono sm:table-cell">{formatDate(invoice.dueDate)}</Td>
        <Td>
          <StatusBadge status={invoice.status} map={INVOICE_STATUS_MAP} />
        </Td>
        <Td>
          <button type="button" onClick={() => void toggle()} className="text-xs font-medium text-accent-text">
            {expanded ? "Hide" : "Details"}
          </button>
        </Td>
      </Tr>
      {expanded && (
        <Tr>
          <Td colSpan={7} className="bg-surface-sunk">
            {error && <ErrorState message={error} />}
            {detail && (
              <div className="flex flex-col gap-3 py-1">
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-meta">Line items</h3>
                  <ul className="flex flex-col gap-0.5 text-sm text-ink">
                    {detail.lineItems.map((item) => (
                      <li key={item.id}>
                        {item.description} — {item.quantity} × {formatCurrencyINR(item.rate)} ={" "}
                        {formatCurrencyINR(item.amount)}
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-sm text-ink">
                  Paid {formatCurrencyINR(detail.amountPaid)} · Balance due {formatCurrencyINR(detail.balanceDue)}
                </p>
                {detail.payments.length > 0 && (
                  <div>
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-meta">Payments</h3>
                    <ul className="flex flex-col gap-0.5 text-sm text-ink">
                      {detail.payments.map((payment) => (
                        <li key={payment.id}>
                          {formatDate(payment.paidDate)} — {formatCurrencyINR(payment.amount)} (
                          {payment.method ?? "—"})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {canManage && (
                  <div className="flex flex-wrap items-center gap-2">
                    {legalNextInvoiceStatuses(invoice.status).map((next) => (
                      <Button key={next} size="sm" variant="secondary" onClick={() => void handleStatus(next)}>
                        {next === "issued" ? "Issue" : "Cancel invoice"}
                      </Button>
                    ))}
                  </div>
                )}
                {canManage && (invoice.status === "issued" || invoice.status === "overdue") && (
                  <form onSubmit={handlePayment} className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
                    <Input label="Amount" name="amount" type="number" step="0.01" required />
                    <Input label="Paid date" name="paidDate" type="date" required />
                    <Input label="Method" name="method" />
                    <Button type="submit" size="sm">
                      Record payment
                    </Button>
                  </form>
                )}
              </div>
            )}
          </Td>
        </Tr>
      )}
    </>
  );
}

export default function BillingPage() {
  const { currentMembership } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  const canManage = organizationType === "rental_company";

  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  async function load(orgId: string) {
    try {
      const [invoiceList, rentalList] = await Promise.all([
        apiClient.listInvoices(orgId) as Promise<Invoice[]>,
        apiClient.listRentals(orgId) as Promise<Rental[]>,
      ]);
      setInvoices(invoiceList);
      setRentals(rentalList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoices");
    }
  }

  useEffect(() => {
    if (organizationId) void load(organizationId);
  }, [organizationId]);

  const rentalById = useMemo(() => new Map(rentals.map((r) => [r.id, r])), [rentals]);

  function rentalLabel(rentalId: string): string {
    const rental = rentalById.get(rentalId);
    if (!rental) return "—";
    const customer = canManage
      ? (rental.clientSnapshot?.name ?? `Renter ${rental.renterOrganizationId?.slice(0, 8) ?? ""}…`)
      : (rental.rentalCompanyOrganizationName ?? "Rental company");
    return `${rental.machineAssetCode ?? rental.machineId.slice(0, 8)} · ${customer}`;
  }

  const filtered = useMemo(() => {
    if (!invoices) return [];
    const q = search.trim().toLowerCase();
    return invoices.filter((invoice) => {
      if (filter !== "all" && invoice.status !== filter) return false;
      if (!q) return true;
      const haystack = [invoice.invoiceNumber, rentalLabel(invoice.rentalId)].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [invoices, filter, search, rentalById]);

  if (!organizationId || !organizationType) return <LoadingState label="Loading…" />;
  if (error) return <ErrorState message={error} />;
  if (!invoices) return <LoadingState label="Loading invoices…" />;

  const issuedCount = invoices.filter((i) => i.status === "issued").length;
  const overdueCount = invoices.filter((i) => i.status === "overdue").length;
  const paidCount = invoices.filter((i) => i.status === "paid").length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Billing"
        description={`${invoices.length} invoices · ${issuedCount} issued · ${overdueCount} overdue · ${paidCount} paid`}
        actions={canManage ? <Button onClick={() => setCreateOpen(true)}>Create invoice</Button> : undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Invoice number, customer…"
          className="w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {FILTERS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={[
              "rounded-control border px-3 py-1.5 text-xs font-semibold capitalize",
              filter === key
                ? "border-ink-strong bg-ink-strong text-white"
                : "border-border-strong bg-surface text-ink-muted hover:bg-surface-sunk",
            ].join(" ")}
          >
            {key} · {key === "all" ? invoices.length : invoices.filter((i) => i.status === key).length}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No invoices match these filters"
          description={canManage ? "Create one above to get started." : "Invoices issued for your rentals will show up here."}
        />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Invoice</Th>
              <Th className="hidden sm:table-cell">Rental</Th>
              <Th className="hidden sm:table-cell">Period</Th>
              <Th>Total</Th>
              <Th className="hidden sm:table-cell">Due</Th>
              <Th>Status</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {filtered.map((invoice) => (
              <InvoiceRow
                key={invoice.id}
                invoice={invoice}
                organizationId={organizationId}
                canManage={canManage}
                rentalLabel={rentalLabel(invoice.rentalId)}
                onChanged={() => void load(organizationId)}
              />
            ))}
          </Tbody>
        </Table>
      )}

      {canManage && (
        <CreateInvoiceDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          organizationId={organizationId}
          rentals={rentals}
          onCreated={() => void load(organizationId)}
        />
      )}
    </div>
  );
}
