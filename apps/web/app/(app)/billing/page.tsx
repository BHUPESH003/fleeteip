"use client";

import type { Invoice, InvoiceDetail, InvoiceStatus } from "@fleetip/contracts/billing";
import type { Rental } from "@fleetip/contracts/rental";
import {
  AllocationBar,
  type AllocationTone,
  AttentionStrip,
  Badge,
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
import { useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { daysUntil, formatCurrencyINR, formatDate } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { CreateInvoiceDialog } from "./CreateInvoiceDialog";
import { INVOICE_STATUS_MAP, legalNextInvoiceStatuses } from "./shared";

type Filter = "all" | InvoiceStatus;

const STATUS_SEGMENTS: { key: InvoiceStatus; label: string; tone: AllocationTone }[] = [
  { key: "draft", label: "Draft", tone: "neutral" },
  { key: "issued", label: "Issued", tone: "on-rent" },
  { key: "overdue", label: "Overdue", tone: "attention" },
  { key: "paid", label: "Paid", tone: "available" },
  { key: "cancelled", label: "Cancelled", tone: "out-of-service" },
];

/**
 * The `overdue` status transition is server-only (see shared.ts) — an
 * invoice can sit at status "issued" past its due date until whatever job
 * flips it. This badge is derived client-side straight from the real
 * dueDate, independent of the stored status, so "due soon"/"overdue" is
 * immediately visible even before that transition runs.
 */
function DueSoonBadge({ invoice }: { invoice: Invoice }) {
  if (invoice.status !== "issued") return null;
  const days = daysUntil(invoice.dueDate);
  if (days < 0) return <Badge tone="danger">{Math.abs(days)}d overdue</Badge>;
  if (days <= 7) return <Badge tone="warning">Due in {days}d</Badge>;
  return null;
}

function InvoiceRow({
  invoice,
  organizationId,
  canManage,
  rentalLabel,
  onChanged,
  highlighted,
}: {
  invoice: Invoice;
  organizationId: string;
  canManage: boolean;
  rentalLabel: string;
  onChanged: () => void;
  highlighted?: boolean;
}) {
  const [expanded, setExpanded] = useState(Boolean(highlighted));
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

  // A notification/dashboard deep link (?invoiceId=...) — open this one row
  // without the reader having to find and expand it themselves. Billing has
  // no [id] detail page, unlike every other resource; this is the closest
  // equivalent an expand-in-place list can offer. A plain useState
  // initializer for `expanded` isn't enough here: this link arrives via
  // router.push, a same-route query-only navigation the App Router doesn't
  // remount this page for, so an initializer snapshotted at first mount
  // would stay stuck at its original value.
  useEffect(() => {
    if (highlighted) {
      setExpanded(true);
      void load();
    }
  }, [highlighted]);

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
      <Tr className={highlighted ? "bg-info-bg" : undefined}>
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
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={invoice.status} map={INVOICE_STATUS_MAP} />
            <DueSoonBadge invoice={invoice} />
          </div>
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
  const { currentMembership, hasPermission } = useSession();
  const searchParams = useSearchParams();
  const highlightedInvoiceId = searchParams.get("invoiceId");
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  const canManage = organizationType === "rental_company";
  // Rental labels are enrichment, not the point of this page (billing.manage/
  // .respond is) — a role without rental.manage/.respond still gets a fully
  // working invoice list, just with rentalLabel() falling back to "—".
  const canListRentals = canManage ? hasPermission("rental.manage") : hasPermission("rental.respond");

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
        canListRentals ? (apiClient.listRentals(orgId) as Promise<Rental[]>) : Promise.resolve([]),
      ]);
      setInvoices(invoiceList);
      setRentals(rentalList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoices");
    }
  }

  useEffect(() => {
    if (organizationId) void load(organizationId);
  }, [organizationId, canListRentals]);

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

  // Recomputed from the real dueDate rather than mirroring the `overdue`
  // segment count as-is — that status transition is server-only (see
  // shared.ts) and can lag, same reasoning as `DueSoonBadge` above.
  const trueOverdueCount = invoices.filter(
    (i) => i.status === "overdue" || (i.status === "issued" && daysUntil(i.dueDate) < 0),
  ).length;
  const dueSoonCount = invoices.filter(
    (i) => i.status === "issued" && daysUntil(i.dueDate) >= 0 && daysUntil(i.dueDate) <= 7,
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Billing"
        description={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`}
        actions={canManage ? <Button onClick={() => setCreateOpen(true)}>Create invoice</Button> : undefined}
      />

      <AllocationBar
        total={{ count: invoices.length, label: "All invoices" }}
        segments={STATUS_SEGMENTS.map((s) => ({
          key: s.key,
          count: invoices.filter((i) => i.status === s.key).length,
          label: s.label,
          tone: s.tone,
        }))}
        active={filter === "all" ? null : filter}
        onSelect={(key) => setFilter((key ?? "all") as Filter)}
      />

      <AttentionStrip
        items={[
          {
            key: "overdue",
            count: trueOverdueCount,
            text: `invoice${trueOverdueCount === 1 ? "" : "s"} overdue`,
            onClick: () => setFilter("overdue"),
          },
          {
            key: "due-soon",
            count: dueSoonCount,
            text: `invoice${dueSoonCount === 1 ? "" : "s"} due within 7 days`,
            onClick: () => setFilter("issued"),
          },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Invoice number, customer…"
          className="w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
                highlighted={invoice.id === highlightedInvoiceId}
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
