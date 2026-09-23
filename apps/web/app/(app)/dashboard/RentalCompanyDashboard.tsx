"use client";

import type { AuctionSummary } from "@fleetip/contracts/auction";
import type { Invoice } from "@fleetip/contracts/billing";
import type { Product } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
import type { NotificationListResponse } from "@fleetip/contracts/notification";
import type { Organization } from "@fleetip/contracts/organization";
import type { CommercialQuotation, QuotationResponse } from "@fleetip/contracts/quotation";
import type { Rental } from "@fleetip/contracts/rental";
import { Card, ErrorState, LoadingState, Meter, PageHeader } from "@fleetip/ui";
import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { daysUntil, formatCurrencyINR } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { AttentionPanel, ActivityPanel, KpiGrid, notificationsToActivity } from "./shared";
import type { AttentionItem, KpiTileData } from "./types";

const MAX_ATTENTION_ITEMS = 5;
const RENTAL_ENDING_WINDOW_DAYS = 15;

interface DashboardData {
  machines: Machine[];
  rentals: Rental[];
  quotations: CommercialQuotation[];
  requestedQuotations: QuotationResponse[];
  invoices: Invoice[];
  invoiceBalances: Map<string, number>;
  renterNames: Map<string, string>;
  productNames: Map<string, string>;
  auctions: AuctionSummary[];
  activity: ReturnType<typeof notificationsToActivity>;
}

export function RentalCompanyDashboard() {
  const { session, currentMembership, hasPermission } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const organizationId = currentMembership?.organizationId;

  // This dashboard is a cross-domain summary, not one page "about" a single
  // permission — a custom role missing any one of these still deserves a
  // working page, just without that section's data (see docs/decisions.md,
  // same fix as quotations/page.tsx's canListMachines).
  const canListMachines = hasPermission("equipment.manage");
  const canListRentals = hasPermission("rental.manage");
  const canListQuotations = hasPermission("quotation.manage");
  const canListInvoices = hasPermission("billing.manage");
  const canListAuctions = hasPermission("auction.participate");
  const canRespondToRfq = hasPermission("rfq.respond");

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [
          machines,
          rentals,
          quotations,
          invoices,
          notifications,
          renterOrgs,
          products,
          auctions,
          requestedQuotations,
        ] = await Promise.all([
          canListMachines
            ? (apiClient.listMachines(organizationId) as Promise<Machine[]>)
            : Promise.resolve([]),
          canListRentals
            ? (apiClient.listRentals(organizationId) as Promise<Rental[]>)
            : Promise.resolve([]),
          canListQuotations
            ? (apiClient.listQuotations(organizationId) as Promise<CommercialQuotation[]>)
            : Promise.resolve([]),
          canListInvoices
            ? (apiClient.listInvoices(organizationId) as Promise<Invoice[]>)
            : Promise.resolve([]),
          apiClient.listNotifications(organizationId) as Promise<NotificationListResponse>,
          canListQuotations
            ? (apiClient.listRenterOrganizations(organizationId) as Promise<Organization[]>)
            : Promise.resolve([]),
          apiClient.listProducts() as Promise<Product[]>,
          canListAuctions
            ? (apiClient.listAuctionsForOrganization(organizationId) as Promise<AuctionSummary[]>)
            : Promise.resolve([]),
          canRespondToRfq
            ? (apiClient.listRequestedQuotations(organizationId) as Promise<QuotationResponse[]>)
            : Promise.resolve([]),
        ]);

        const unpaidInvoices = invoices.filter(
          (invoice) => invoice.status === "issued" || invoice.status === "overdue",
        );
        const invoiceDetails = await Promise.all(
          unpaidInvoices.map((invoice) => apiClient.getInvoiceDetail(organizationId, invoice.id)),
        );
        const invoiceBalances = new Map(
          unpaidInvoices.map((invoice, index) => [
            invoice.id,
            (invoiceDetails[index] as { balanceDue: number } | undefined)?.balanceDue ??
              invoice.totalAmount,
          ]),
        );

        if (cancelled) return;
        setData({
          machines,
          rentals,
          quotations,
          requestedQuotations,
          invoices,
          invoiceBalances,
          renterNames: new Map(renterOrgs.map((org) => [org.id, org.name])),
          productNames: new Map(products.map((product) => [product.id, product.name])),
          auctions,
          activity: notificationsToActivity(notifications.notifications),
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load dashboard");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Loading dashboard…" />;

  const {
    machines,
    rentals,
    quotations,
    requestedQuotations,
    invoices,
    invoiceBalances,
    renterNames,
    productNames,
    auctions,
    activity,
  } = data;

  const auctionsSelected = auctions.filter((a) => a.needsAttention);
  // Dropped once a quotation actually exists for the response — same
  // cross-reference as the Quotations page's "Requested" filter, so this
  // stops nagging the moment it's been acted on (even in draft).
  const fulfilledResponseIds = new Set(
    quotations.filter((q) => q.quotationResponseId).map((q) => q.quotationResponseId as string),
  );
  const pendingQuotationRequests = requestedQuotations.filter(
    (r) => !fulfilledResponseIds.has(r.id),
  );

  const activeRentalMachineIds = new Set(
    rentals
      .filter((r) => r.status === "active" || r.status === "confirmed")
      .map((r) => r.machineId),
  );
  const availableMachines = machines.filter(
    (m) => m.status === "active" && !activeRentalMachineIds.has(m.id),
  );
  const onRentCount = activeRentalMachineIds.size;
  const maintenanceMachines = machines.filter((m) => m.status === "under_maintenance");
  const retiredMachines = machines.filter((m) => m.status === "retired");
  const totalMachines = machines.length || 1;

  const awaitingAcceptance = quotations.filter((q) => q.status === "sent" && !q.renterAcceptedAt);
  const quotationsOpen = quotations.filter(
    (q) => q.status === "sent" || q.status === "negotiating",
  );

  const overdueInvoices = invoices.filter((i) => i.status === "overdue");
  const outstandingTotal = [...invoiceBalances.values()].reduce((sum, v) => sum + v, 0);
  const overdueTotal = overdueInvoices.reduce(
    (sum, invoice) => sum + (invoiceBalances.get(invoice.id) ?? 0),
    0,
  );

  const counterpartyName = (org: {
    renterOrganizationId: string | null;
    clientSnapshot: { name: string } | null;
  }) =>
    (org.renterOrganizationId && renterNames.get(org.renterOrganizationId)) ||
    org.clientSnapshot?.name ||
    "Renter";

  // Tiles for a section the caller can't see are omitted, not zeroed —
  // "Machines: 0" would misreport "no permission" as "no fleet".
  const kpis: KpiTileData[] = [
    ...(canListMachines
      ? [
          {
            label: "Machines",
            value: String(machines.length),
            note: `${retiredMachines.length} retired`,
          },
          {
            label: "Available",
            value: String(availableMachines.length),
            note: "derived: no active rental",
            noteTone: "success" as const,
          },
          {
            label: "On rent",
            value: String(onRentCount),
            note: `${Math.round((onRentCount / totalMachines) * 100)}% of fleet`,
          },
          {
            label: "Maintenance",
            value: String(maintenanceMachines.length),
            note: maintenanceMachines.length > 0 ? "unavailable while in maintenance" : undefined,
            noteTone: "warning" as const,
          },
        ]
      : []),
    ...(canListQuotations
      ? [
          {
            label: "Quotations open",
            value: String(quotationsOpen.length),
            note: `${awaitingAcceptance.length} awaiting acceptance`,
            noteTone: awaitingAcceptance.length > 0 ? ("warning" as const) : undefined,
          },
        ]
      : []),
    ...(canListInvoices
      ? [
          {
            label: "Outstanding",
            value: formatCurrencyINR(outstandingTotal),
            note: overdueTotal > 0 ? `${formatCurrencyINR(overdueTotal)} overdue` : undefined,
            noteTone: "danger" as const,
          },
        ]
      : []),
    ...(canListAuctions
      ? [
          {
            label: "Auctions",
            value: String(auctions.length),
            note:
              auctionsSelected.length > 0
                ? `${auctionsSelected.length} selected — proceed`
                : undefined,
            noteTone: "success" as const,
            href: "/auctions",
          },
        ]
      : []),
  ];

  const attention: AttentionItem[] = [
    ...pendingQuotationRequests.map((response): AttentionItem => ({
      ref: `RFQ-${response.requirementId.slice(0, 8).toUpperCase()}`,
      title: "Quotation requested",
      detail: `Renter asked you to formalize a quotation${response.indicativeRate ? ` · your indicative rate ${response.indicativeRate}/${response.indicativeRateUnit}` : ""}`,
      state: response.quotationRequestedAt ? `${Math.abs(daysUntil(response.quotationRequestedAt))}d ago` : "New",
      tone: "warning",
      actionLabel: "Quote",
      href: `/quotations?requirementId=${response.requirementId}`,
    })),
    ...overdueInvoices.map((invoice): AttentionItem => {
      const rental = rentals.find((r) => r.id === invoice.rentalId);
      const overdueDays = Math.abs(daysUntil(invoice.dueDate));
      return {
        ref: invoice.invoiceNumber,
        title: "Payment overdue",
        detail: `${rental ? counterpartyName(rental) : "Renter"} · ${formatCurrencyINR(invoiceBalances.get(invoice.id) ?? invoice.totalAmount)} · due ${invoice.dueDate}`,
        state: `Overdue ${overdueDays}d`,
        tone: "danger",
        actionLabel: "Record",
        href: `/billing?invoiceId=${invoice.id}`,
      };
    }),
    ...awaitingAcceptance.map((q): AttentionItem => ({
      ref: q.referenceNumber,
      title: "Awaiting renter acceptance",
      detail: `${counterpartyName(q)} · validity ends ${q.validityDate}`,
      state: `${Math.max(daysUntil(q.validityDate), 0)}d`,
      tone: "warning",
      actionLabel: "Follow up",
      href: `/quotations/${q.id}`,
    })),
    ...maintenanceMachines.map((m): AttentionItem => ({
      ref: m.assetCode,
      title: "Blocked by maintenance",
      detail: `${productNames.get(m.productId) ?? "Machine"} · reg ${m.registrationNumber}`,
      state: "Blocking",
      tone: "danger",
      actionLabel: "Update",
      href: `/machines/${m.id}`,
    })),
    ...rentals
      .filter(
        (r) =>
          r.status === "active" &&
          r.endDate &&
          daysUntil(r.endDate) >= 0 &&
          daysUntil(r.endDate) <= RENTAL_ENDING_WINDOW_DAYS,
      )
      .map((r): AttentionItem => ({
        ref: `RN-${r.id.slice(0, 8).toUpperCase()}`,
        title: "Rental ends soon",
        detail: `${counterpartyName(r)} · notice ${r.noticePeriodDays ?? "—"} days`,
        state: `${daysUntil(r.endDate as string)}d`,
        tone: "warning",
        actionLabel: "Plan",
        href: `/rentals/${r.id}`,
      })),
    ...auctionsSelected.map((a): AttentionItem => ({
      ref: `AU-${a.id.slice(0, 8).toUpperCase()}`,
      title: "Selected in auction",
      detail: `${a.requirementProjectName ?? "Requirement"} · proceed to a commercial quotation`,
      state: "Selected",
      tone: "success",
      actionLabel: "Open",
      href: `/auctions?requirementId=${a.requirementId}&auctionId=${a.id}`,
    })),
  ].slice(0, MAX_ATTENTION_ITEMS);

  const fleetMix = [
    {
      label: "On rent",
      count: onRentCount,
      pct: (onRentCount / totalMachines) * 100,
      tone: "info" as const,
    },
    {
      label: "Available",
      count: availableMachines.length,
      pct: (availableMachines.length / totalMachines) * 100,
      tone: "success" as const,
    },
    {
      label: "Under maintenance",
      count: maintenanceMachines.length,
      pct: (maintenanceMachines.length / totalMachines) * 100,
      tone: "warning" as const,
    },
    {
      label: "Retired",
      count: retiredMachines.length,
      pct: (retiredMachines.length / totalMachines) * 100,
      tone: "neutral" as const,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Operations overview"
        description={`Welcome, ${session?.user.displayName ?? ""} · ${currentMembership?.organization.name ?? ""}`}
      />
      <KpiGrid kpis={kpis} />
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.4fr_1fr]">
        <AttentionPanel title="Requires attention" items={attention} />
        <div className="flex flex-col gap-3.5">
          {canListMachines && (
            <Card>
              <div className="mb-3 flex items-baseline gap-2">
                <h2 className="text-sm font-semibold text-ink">Fleet availability</h2>
                <span className="text-xs text-meta-light">
                  derived from machine status + active rentals
                </span>
              </div>
              <Meter segments={fleetMix} />
            </Card>
          )}
          <ActivityPanel items={activity} />
        </div>
      </div>
    </div>
  );
}
