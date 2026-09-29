"use client";

import { InvoiceStatus, type Invoice, type InvoiceDetail } from "@fleetip/contracts/billing";
import type { Machine } from "@fleetip/contracts/equipment";
import { OrganizationTypeCode, type Organization, type PermissionCode } from "@fleetip/contracts/organization";
import type { Rental } from "@fleetip/contracts/rental";
import {
  AttentionStrip,
  Button,
  CellStack,
  EmptyState,
  ErrorState,
  KeyFigures,
  KeyFiguresSkeleton,
  Menu,
  PageBody,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  Table,
  TableSkeleton,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  cx,
  type KeyFigure,
} from "@fleetip/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ForbiddenPage } from "../../../components/PageStates";
import { apiClient } from "../../../lib/api-client";
import { useConnection } from "../../../lib/connection";
import { OFFLINE_HINT, describeError, errorStatus } from "../../../lib/errors";
import {
  addDays,
  daysBetween,
  formatDate,
  formatDateRange,
  formatMoney,
  formatShortDate,
  plural,
  rentalRef,
  todayIsoDate,
} from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { Status, statusLabel, statusOptions } from "../../../lib/status";
import { optional, useLoad } from "../../../lib/use-load";
import {
  ListCard,
  ListSearch,
  NoMatches,
  PAGE_SIZE,
  RefCell,
  compareNumber,
  matches,
  paginate,
  quoted,
  sortRows,
  useListView,
} from "../maintenance/list-kit";
import { CreateInvoiceDialog } from "./CreateInvoiceDialog";
import { InvoiceConfirmDialog, type InvoiceConfirm } from "./InvoiceDialogs";
import { InvoiceDrawer, type InvoiceContext } from "./InvoiceDrawer";
import { customerOf, daysOverdue, effectiveStatus, isUnpaid, legalNextInvoiceStatuses, runPool } from "./shared";

interface BillingData {
  invoices: Invoice[];
  /** null when the role can't view rentals. */
  rentals: Rental[] | null;
  machineCodes: Map<string, string>;
  customerNames: Map<string, string>;
}

async function loadBilling(
  orgId: string,
  access: { rentals: boolean; machines: boolean; customers: boolean },
): Promise<BillingData> {
  // Rental labels are enrichment, not the point of this page (billing.manage/
  // .respond is) — a role without the rental permission still gets a fully
  // working invoice list.
  const [invoices, rentals, machines, renters] = await Promise.all([
    apiClient.listInvoices(orgId) as Promise<Invoice[]>,
    optional(access.rentals, () => apiClient.listRentals(orgId) as Promise<Rental[]>, null as Rental[] | null),
    optional(access.machines, () => apiClient.listMachines(orgId) as Promise<Machine[]>, [] as Machine[]),
    optional(access.customers, () => apiClient.listRenterOrganizations(orgId) as Promise<Organization[]>, [] as Organization[]),
  ]);
  return {
    invoices,
    rentals,
    machineCodes: new Map(machines.map((m) => [m.id, m.assetCode])),
    customerNames: new Map(renters.map((o) => [o.id, o.name])),
  };
}

/**
 * balanceDue (and the lazy issued → overdue flip) exist only on
 * getInvoiceDetail (plan §1, backend ticket d), so the detail is fetched
 * per issued/overdue invoice, a few at a time, after the list shows.
 */
function useInvoiceDetails(organizationId: string, invoices: Invoice[] | null) {
  const [details, setDetails] = useState<Map<string, InvoiceDetail>>(new Map());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const requested = useRef(new Set<string>());
  const failedIds = useRef(new Set<string>());

  useEffect(() => {
    if (!invoices) return;
    // New unpaid invoices, plus any that failed last time (e.g. while offline —
    // the list reloads on reconnect).
    const need = invoices.filter((i) => isUnpaid(i.status) && (!requested.current.has(i.id) || failedIds.current.has(i.id)));
    if (need.length === 0) return;
    need.forEach((i) => {
      requested.current.add(i.id);
      failedIds.current.delete(i.id);
    });
    void runPool(need, 6, async (invoice) => {
      try {
        const detail = (await apiClient.getInvoiceDetail(organizationId, invoice.id)) as InvoiceDetail;
        setDetails((current) => new Map(current).set(invoice.id, detail));
        setFailed((current) => {
          if (!current.has(invoice.id)) return current;
          const next = new Set(current);
          next.delete(invoice.id);
          return next;
        });
      } catch {
        failedIds.current.add(invoice.id);
        setFailed((current) => new Set(current).add(invoice.id));
      }
    });
  }, [invoices, organizationId]);

  /** Forget one invoice's detail so the next list load fetches it again. */
  const invalidate = useCallback((id: string) => {
    requested.current.delete(id);
    setDetails((current) => {
      if (!current.has(id)) return current;
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }, []);
  const put = useCallback((detail: InvoiceDetail) => {
    requested.current.add(detail.invoice.id);
    setDetails((current) => new Map(current).set(detail.invoice.id, detail));
  }, []);

  return { details, failed, invalidate, put };
}

type StatusFilter = InvoiceStatus;
type SortKey = "invoice" | "due" | "total" | "balance";
const SORTS: Record<SortKey, "asc" | "desc"> = { invoice: "desc", due: "asc", total: "desc", balance: "desc" };

export default function BillingPage() {
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  if (!organizationId || !organizationType) {
    return (
      <div className="flex min-w-0 flex-col">
        <PageHeader title="Billing" description="Invoices raised against your rentals, and what's still owed on them." />
        <PageBody>
          <KeyFiguresSkeleton count={4} />
        </PageBody>
      </div>
    );
  }
  // Keyed by organization: the invoice-detail cache belongs to one organization.
  return (
    <BillingView
      key={organizationId}
      organizationId={organizationId}
      isRentalCompany={organizationType === OrganizationTypeCode.rental_company}
      hasPermission={hasPermission}
    />
  );
}

function BillingView({
  organizationId,
  isRentalCompany,
  hasPermission,
}: {
  organizationId: string;
  isRentalCompany: boolean;
  hasPermission: (permission: PermissionCode) => boolean;
}) {
  // A Rental Company raises and manages invoices (billing.manage); a Renter
  // reads the invoices on its own rentals (billing.respond) — the same split
  // listInvoices/getInvoiceDetail make on the server.
  const canManage = isRentalCompany && hasPermission("billing.manage");
  const canView = isRentalCompany ? hasPermission("billing.manage") : hasPermission("billing.respond");
  const canListRentals = isRentalCompany ? hasPermission("rental.manage") : hasPermission("rental.respond");
  const access = {
    rentals: canListRentals,
    // A Renter gets asset codes and the rental company's name on the rental itself.
    machines: isRentalCompany && hasPermission("equipment.manage"),
    customers: isRentalCompany && hasPermission("quotation.manage"),
  };
  const { online } = useConnection();
  const today = todayIsoDate();

  const { data, error, reload } = useLoad(
    () => loadBilling(organizationId, access),
    [organizationId, access.rentals, access.machines, access.customers],
    canView,
  );
  const { details, failed, invalidate, put } = useInvoiceDetails(organizationId, data?.invoices ?? null);
  const view = useListView<SortKey>("billing", SORTS, "invoice");
  const { get, set } = view;

  const [openId, setOpenId] = useState<string | null>(null);
  // The last invoice opened stays highlighted after its drawer closes.
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [confirm, setConfirm] = useState<InvoiceConfirm | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [createRentalId, setCreateRentalId] = useState<string | null>(null);

  const statusParam = get("status");
  const invoiceIdParam = get("invoiceId");
  const createParam = get("create");
  const rentalIdParam = get("rentalId");

  // A notification/dashboard deep link (?invoiceId=...) opens that invoice.
  // Reacting to the param in an effect matters: the link arrives via
  // router.push, a same-route query-only navigation the App Router doesn't
  // remount this page for, so a useState initializer snapshotted at first
  // mount would stay stuck at its original value (docs/decisions.md).
  const openIdRef = useRef<string | null>(null);
  openIdRef.current = openId;
  useEffect(() => {
    // Opening from the table writes the param too — only a different
    // invoice arriving from outside resets the drawer.
    if (invoiceIdParam && invoiceIdParam !== openIdRef.current) {
      setOpenId(invoiceIdParam);
      setHighlightId(invoiceIdParam);
      setPaying(false);
    }
  }, [invoiceIdParam]);

  // ?create=1&rentalId=… (Machine detail's "Raise invoice") opens the create
  // dialog with that rental preselected, then drops the params so a reload
  // or Back doesn't open it again. Same effect-keyed-on-the-param rule.
  useEffect(() => {
    if (createParam !== "1") return;
    if (canManage) {
      setCreateRentalId(rentalIdParam || null);
      setCreateOpen(true);
    }
    set({ create: null, rentalId: null }, { resetPage: false });
    // `set` changes identity with every URL change; the params are the trigger
  }, [createParam, rentalIdParam, canManage]);

  const invoices = useMemo(() => data?.invoices ?? [], [data?.invoices]);
  const rentalsById = useMemo(() => new Map((data?.rentals ?? []).map((r) => [r.id, r])), [data?.rentals]);
  const names = useMemo(() => data?.customerNames ?? new Map<string, string>(), [data?.customerNames]);
  const machineCodes = useMemo(() => data?.machineCodes ?? new Map<string, string>(), [data?.machineCodes]);

  const statusOf = useCallback((invoice: Invoice) => effectiveStatus(invoice, details.get(invoice.id), today), [details, today]);
  const balanceOf = useCallback(
    (invoice: Invoice): number | null => {
      const status = statusOf(invoice);
      if (!isUnpaid(status)) return status === InvoiceStatus.paid || status === InvoiceStatus.cancelled ? 0 : null;
      const detail = details.get(invoice.id);
      return detail ? detail.balanceDue : null;
    },
    [details, statusOf],
  );
  const counterpartOf = useCallback(
    (invoice: Invoice): { name: string; note: string } | null => {
      const rental = rentalsById.get(invoice.rentalId);
      if (!rental) return null;
      if (!isRentalCompany) return { name: rental.rentalCompanyOrganizationName ?? "Rental company", note: "Rental company" };
      const customer = customerOf(rental, names);
      return customer ? { name: customer.name, note: customer.onFleetIp ? "On FleetIP" : "Not on FleetIP · as entered" } : null;
    },
    [rentalsById, names, isRentalCompany],
  );
  const assetOf = useCallback(
    (invoice: Invoice) => {
      const rental = rentalsById.get(invoice.rentalId);
      return rental ? (machineCodes.get(rental.machineId) ?? rental.machineAssetCode ?? null) : null;
    },
    [rentalsById, machineCodes],
  );

  const filtered = useMemo(() => {
    return invoices.filter((invoice) => {
      if (statusParam && statusOf(invoice) !== (statusParam as StatusFilter)) return false;
      if (view.query) {
        const rental = rentalsById.get(invoice.rentalId);
        if (
          !matches(view.query, [
            invoice.invoiceNumber,
            rentalRef(invoice.rentalId),
            counterpartOf(invoice)?.name,
            assetOf(invoice),
            rental?.projectName,
            invoice.notes,
          ])
        ) {
          return false;
        }
      }
      return true;
    });
  }, [invoices, statusParam, statusOf, view.query, rentalsById, counterpartOf, assetOf]);

  const sorted = useMemo(() => {
    const compare =
      view.sortKey === "due"
        ? (a: Invoice, b: Invoice) => a.dueDate.localeCompare(b.dueDate)
        : view.sortKey === "total"
          ? (a: Invoice, b: Invoice) => a.totalAmount - b.totalAmount
          : view.sortKey === "balance"
            ? (a: Invoice, b: Invoice) => compareNumber(balanceOf(a), balanceOf(b))
            : (a: Invoice, b: Invoice) => a.createdAt.localeCompare(b.createdAt) || a.invoiceNumber.localeCompare(b.invoiceNumber);
    return sortRows(filtered, compare, view.sortDir, view.sortKey === "balance" ? (i) => balanceOf(i) === null : undefined);
  }, [filtered, view.sortKey, view.sortDir, balanceOf]);
  const page = paginate(sorted, view.page);

  if (!canView) {
    return (
      <ForbiddenPage
        what="billing"
        permissionHint={isRentalCompany ? "Invoices need the Billing permission." : "Seeing invoices for your rentals needs the Billing permission."}
      />
    );
  }
  if (error && errorStatus(error) === 403) {
    return <ForbiddenPage what="billing" permissionHint="Invoices need the Billing permission." />;
  }

  // ------------------------------------------------------------ figures
  const unpaid = invoices.filter((i) => isUnpaid(statusOf(i)));
  const pendingBalances = unpaid.filter((i) => !details.has(i.id) && !failed.has(i.id)).length;
  const unknownBalances = unpaid.filter((i) => failed.has(i.id)).length;
  const withBalance = unpaid.map((i) => ({ invoice: i, balance: details.get(i.id)?.balanceDue ?? null }));
  const known = withBalance.filter((x): x is { invoice: Invoice; balance: number } => x.balance !== null && x.balance > 0);
  const outstanding = known.reduce((sum, x) => sum + x.balance, 0);
  const overdue = known.filter((x) => statusOf(x.invoice) === InvoiceStatus.overdue).sort((a, b) => a.invoice.dueDate.localeCompare(b.invoice.dueDate));
  const overdueAmount = overdue.reduce((sum, x) => sum + x.balance, 0);
  const overdueCount = unpaid.filter((i) => statusOf(i) === InvoiceStatus.overdue).length;
  const weekAhead = addDays(today, 7);
  const dueSoon = known.filter((x) => statusOf(x.invoice) === InvoiceStatus.issued && x.invoice.dueDate <= weekAhead).sort((a, b) => a.invoice.dueDate.localeCompare(b.invoice.dueDate));
  const monthKey = today.slice(0, 7);
  // An invoice becomes Paid when a payment covers it, and nothing changes it
  // after that — so its last update is when it was paid.
  const paidThisMonth = invoices.filter((i) => statusOf(i) === InvoiceStatus.paid && i.updatedAt.slice(0, 7) === monthKey);
  const balancesNote = pendingBalances ? "Working out balances…" : unknownBalances ? `${plural(unknownBalances, "balance")} couldn't load` : null;
  const figureValue = (amount: number) => (pendingBalances ? <Skeleton className="h-[19px] w-24" /> : formatMoney(amount));

  const figures: KeyFigure[] = [
    {
      key: "outstanding",
      label: isRentalCompany ? "Outstanding" : "Still to pay",
      value: figureValue(outstanding),
      context: balancesNote ?? (known.length ? `On ${plural(known.length, "issued invoice")}` : "Nothing is owed on issued invoices"),
    },
    {
      key: "overdue",
      label: "Overdue",
      value: figureValue(overdueAmount),
      context: overdueCount
        ? `${plural(overdueCount, "invoice")} past the due date${overdue[0] ? ` · oldest due ${formatShortDate(overdue[0].invoice.dueDate)}` : ""}`
        : "Nothing is past its due date",
      tone: overdueAmount > 0 && !pendingBalances ? "danger" : "default",
    },
    {
      key: "soon",
      label: "Due in the next 7 days",
      value: figureValue(dueSoon.reduce((sum, x) => sum + x.balance, 0)),
      context: dueSoon.length
        ? `${plural(dueSoon.length, "invoice")} · next ${formatShortDate(dueSoon[0]?.invoice.dueDate)}`
        : "Nothing falls due this week",
    },
    {
      key: "paid",
      label: "Paid this month",
      value: formatMoney(paidThisMonth.reduce((sum, i) => sum + i.totalAmount, 0)),
      context: paidThisMonth.length
        ? `${plural(paidThisMonth.length, "invoice")} fully paid since ${formatShortDate(`${monthKey}-01`)}`
        : `No invoice fully paid since ${formatShortDate(`${monthKey}-01`)}`,
    },
  ];

  const filterParts = [
    statusParam ? statusLabel("invoice", statusParam) : null,
    view.queryLabel ? quoted(view.queryLabel) : null,
  ].filter((p): p is string => Boolean(p));
  const clearFilters = () => set({ status: null, q: null });

  // ------------------------------------------------------------ drawer + actions
  function openInvoice(id: string, pay = false) {
    setOpenId(id);
    setHighlightId(id);
    setPaying(pay);
    set({ invoiceId: id }, { resetPage: false });
  }
  function closeInvoice() {
    setOpenId(null);
    setPaying(false);
    set({ invoiceId: null }, { resetPage: false });
  }
  function afterWrite(id: string) {
    invalidate(id);
    setRefreshKey((k) => k + 1);
    void reload();
  }

  const openInvoiceRow = openId ? invoices.find((i) => i.id === openId) : undefined;
  const contextFor = (invoice: Invoice | undefined, rentalId: string | undefined): InvoiceContext => {
    const counterpart = invoice ? counterpartOf(invoice) : null;
    return {
      rentalHref: rentalId && data?.rentals ? `/rentals/${rentalId}` : null,
      customerLabel: isRentalCompany ? "Customer" : "Rental company",
      customer: counterpart?.name ?? null,
      machine: invoice ? assetOf(invoice) : null,
    };
  };

  const primary = canManage ? (
    <Button
      icon="plus"
      onClick={() => {
        setCreateRentalId(null);
        setCreateOpen(true);
      }}
      disabled={!online}
      title={online ? undefined : OFFLINE_HINT}
    >
      Create invoice
    </Button>
  ) : null;

  const columns = canManage ? 9 : 8;

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title="Billing"
        description={
          isRentalCompany
            ? "Invoices raised against your rentals, what's been paid and what's still owed."
            : "Invoices your rental companies have issued for your rentals, and what's still to pay."
        }
        actions={primary}
      />
      <PageBody>
        {data && (
          <AttentionStrip
            items={[
              {
                key: "overdue",
                count: overdueCount,
                text: `${overdueCount === 1 ? "invoice is" : "invoices are"} past the due date and not fully paid`,
                onClick: () => set({ status: InvoiceStatus.overdue }),
              },
            ]}
          />
        )}
        {data ? <KeyFigures items={figures} label="Billing figures" /> : !error && <KeyFiguresSkeleton count={4} />}

        {error ? (
          <ErrorState
            title="Invoices didn't load"
            message={describeError(error).body}
            action={
              <Button variant="secondary" size="sm" onClick={() => void reload()}>
                Try again
              </Button>
            }
          />
        ) : data && invoices.length === 0 ? (
          <section className="rounded-panel border border-border-strong bg-surface">
            <EmptyState
              variant="page"
              icon="invoice"
              title="No invoices yet"
              description={
                canManage
                  ? "Invoices are raised by hand against a rental, one billing period at a time. Create the first one for a running rental."
                  : "Invoices your rental companies issue for your rentals will appear here."
              }
              action={primary}
            />
          </section>
        ) : (
          <ListCard
            label="Invoices"
            toolbar={
              <>
                <ListSearch search={view.search} label="Search invoices" placeholder="Invoice, customer, rental, machine…" />
                <Select
                  aria-label="Status"
                  className="w-full min-[760px]:w-[190px]"
                  placeholder="All statuses"
                  value={statusParam}
                  onChange={(e) => set({ status: e.target.value || null })}
                  options={statusOptions("invoice")}
                />
                {(statusParam || view.queryLabel) && (
                  <Button variant="tertiary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
                <span className="ml-auto hidden text-[11px] text-meta-light min-[1180px]:inline">
                  Overdue includes issued invoices past their due date.
                </span>
              </>
            }
            footer={
              data && sorted.length > 0 ? (
                <Pagination page={page.page} pageCount={page.pageCount} onPageChange={view.setPage} total={sorted.length} pageSize={PAGE_SIZE} noun="invoices" />
              ) : undefined
            }
          >
            {data && sorted.length === 0 ? (
              <NoMatches noun="invoices" parts={filterParts} onClear={clearFilters} />
            ) : (
              <Table bare minWidth={canManage ? 1160 : 1040} caption="Invoices">
                <Thead>
                  <Tr>
                    <Th className="w-[140px]" {...view.sortProps("invoice")}>
                      Invoice
                    </Th>
                    <Th className="w-[150px]">Rental</Th>
                    <Th>{isRentalCompany ? "Customer" : "Rental company"}</Th>
                    <Th className="w-[180px]">Billing period</Th>
                    <Th className="w-[130px]" {...view.sortProps("due")}>
                      Due
                    </Th>
                    <Th align="right" className="w-[120px]" {...view.sortProps("total")}>
                      Total
                    </Th>
                    <Th align="right" className="w-[128px]" {...view.sortProps("balance")}>
                      Balance due
                    </Th>
                    <Th className="w-[104px]">Status</Th>
                    {canManage && (
                      <Th className="w-[190px]">
                        <span className="sr-only">Actions</span>
                      </Th>
                    )}
                  </Tr>
                </Thead>
                {!data ? (
                  <TableSkeleton columns={columns} rows={8} label="Loading invoices" />
                ) : (
                  <Tbody>
                    {page.rows.map((invoice) => {
                      const status = statusOf(invoice);
                      const detail = details.get(invoice.id);
                      const counterpart = counterpartOf(invoice);
                      const asset = assetOf(invoice);
                      const isOverdue = status === InvoiceStatus.overdue;
                      const highlighted = invoice.id === invoiceIdParam || invoice.id === openId || invoice.id === highlightId;
                      const next = legalNextInvoiceStatuses(status);
                      const dueNote =
                        status === InvoiceStatus.overdue
                          ? `${plural(Math.max(1, daysOverdue(invoice, today)), "day")} overdue`
                          : status === InvoiceStatus.issued
                            ? invoice.dueDate === today
                              ? "due today"
                              : `in ${plural(daysBetween(today, invoice.dueDate), "day")}`
                            : status === InvoiceStatus.draft
                              ? "not issued yet"
                              : status === InvoiceStatus.paid
                                ? "paid"
                                : "cancelled";
                      return (
                        <Tr key={invoice.id} selected={highlighted} className={cx(!highlighted && isOverdue && "bg-destructive-row")}>
                          <Td>
                            <button
                              type="button"
                              aria-haspopup="dialog"
                              onClick={() => openInvoice(invoice.id)}
                              className="whitespace-nowrap border-0 bg-transparent p-0 text-left font-mono text-xs font-medium text-accent-text hover:text-accent-text-hover hover:underline"
                            >
                              {invoice.invoiceNumber}
                            </button>
                          </Td>
                          <Td>
                            <RefCell href={data.rentals ? `/rentals/${invoice.rentalId}` : null} label={rentalRef(invoice.rentalId)} sub={asset ?? undefined} />
                          </Td>
                          <Td>
                            {counterpart ? (
                              <CellStack title={counterpart.name} sub={counterpart.note} />
                            ) : (
                              <span className="text-xs italic text-disabled-text">
                                {data.rentals ? "Not recorded" : "Needs the Rentals permission"}
                              </span>
                            )}
                          </Td>
                          <Td>
                            <CellStack mono title={formatDateRange(invoice.billingPeriodStart, invoice.billingPeriodEnd)} />
                          </Td>
                          <Td>
                            <CellStack
                              mono
                              title={formatDate(invoice.dueDate)}
                              titleClassName={isOverdue ? "font-semibold text-destructive" : undefined}
                              sub={<span className={isOverdue ? "font-medium text-destructive" : undefined}>{dueNote}</span>}
                            />
                          </Td>
                          <Td align="right" className="font-mono text-xs">
                            {formatMoney(invoice.totalAmount)}
                          </Td>
                          <Td align="right" className="font-mono text-xs font-semibold">
                            {isUnpaid(status) ? (
                              detail ? (
                                detail.balanceDue > 0 ? (
                                  <span className={isOverdue ? "text-destructive" : undefined}>{formatMoney(detail.balanceDue)}</span>
                                ) : (
                                  <span className="text-disabled-text">—</span>
                                )
                              ) : failed.has(invoice.id) ? (
                                <span className="font-normal text-meta-light" title="The balance comes from the invoice detail, which didn't load">
                                  Open invoice
                                </span>
                              ) : (
                                <span className="inline-flex justify-end">
                                  <Skeleton className="h-3 w-16" />
                                </span>
                              )
                            ) : (
                              <span className="text-disabled-text" title={status === InvoiceStatus.draft ? "Not issued yet" : undefined}>
                                —
                              </span>
                            )}
                          </Td>
                          <Td>
                            <Status domain="invoice" value={status} size="sm" />
                          </Td>
                          {canManage && (
                            <Td align="right">
                              <span className="flex items-center justify-end gap-1.5">
                                {status === InvoiceStatus.draft && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={!online}
                                    title={online ? undefined : OFFLINE_HINT}
                                    onClick={() => setConfirm({ kind: "issue", invoice, customer: customerOf(rentalsById.get(invoice.rentalId), names) })}
                                  >
                                    Issue
                                  </Button>
                                )}
                                {isUnpaid(status) && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={!online}
                                    title={online ? undefined : OFFLINE_HINT}
                                    onClick={() => openInvoice(invoice.id, true)}
                                  >
                                    Record payment
                                  </Button>
                                )}
                                <Menu
                                  label={`More actions for ${invoice.invoiceNumber}`}
                                  triggerSize="sm"
                                  items={[
                                    { key: "open", label: "Open invoice", icon: "invoice", hint: "Lines, payments and balance.", onSelect: () => openInvoice(invoice.id) },
                                    {
                                      key: "cancel",
                                      label: "Cancel invoice",
                                      icon: "close",
                                      danger: true,
                                      separatorBefore: true,
                                      disabled: !online || !next.includes(InvoiceStatus.cancelled),
                                      hint: !online
                                        ? OFFLINE_HINT
                                        : next.includes(InvoiceStatus.cancelled)
                                          ? "It stays on record as Cancelled. Payments aren't reversed."
                                          : status === InvoiceStatus.paid
                                            ? "Paid invoices stay on record as they are."
                                            : "This invoice is already cancelled.",
                                      onSelect: () => setConfirm({ kind: "cancel", invoice, amountPaid: detail?.amountPaid ?? null }),
                                    },
                                  ]}
                                />
                              </span>
                            </Td>
                          )}
                        </Tr>
                      );
                    })}
                  </Tbody>
                )}
              </Table>
            )}
          </ListCard>
        )}
      </PageBody>

      {openId && (
        <InvoiceDrawer
          key={openId}
          organizationId={organizationId}
          invoiceId={openId}
          invoice={openInvoiceRow}
          cached={details.get(openId)}
          context={contextFor(openInvoiceRow, openInvoiceRow?.rentalId)}
          canManage={canManage}
          online={online}
          refreshKey={refreshKey}
          paying={paying}
          onPayingChange={setPaying}
          dismissible={confirm === null}
          onClose={closeInvoice}
          onIssue={(invoice) => setConfirm({ kind: "issue", invoice, customer: customerOf(rentalsById.get(invoice.rentalId), names) })}
          onCancel={(invoice, amountPaid) => setConfirm({ kind: "cancel", invoice, amountPaid })}
          onDetail={put}
          onPaymentRecorded={(id) => {
            invalidate(id);
            void reload();
          }}
        />
      )}

      <InvoiceConfirmDialog organizationId={organizationId} confirm={confirm} onClose={() => setConfirm(null)} onDone={afterWrite} />

      {canManage && (
        <CreateInvoiceDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          organizationId={organizationId}
          rentals={data ? data.rentals : undefined}
          invoices={invoices}
          machineCodes={machineCodes}
          customerNames={names}
          initialRentalId={createRentalId}
          onCreated={() => void reload()}
          onOpenInvoice={(id) => openInvoice(id)}
        />
      )}
    </div>
  );
}
