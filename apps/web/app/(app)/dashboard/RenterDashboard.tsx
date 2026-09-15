"use client";

import type { AuctionSummary } from "@fleetip/contracts/auction";
import type { NotificationListResponse } from "@fleetip/contracts/notification";
import type { Organization } from "@fleetip/contracts/organization";
import type { CommercialQuotation, QuotationResponse } from "@fleetip/contracts/quotation";
import type { Rental } from "@fleetip/contracts/rental";
import type { Requirement } from "@fleetip/contracts/rfq";
import type { Invoice } from "@fleetip/contracts/billing";
import { Card, LoadingState, PageHeader } from "@fleetip/ui";
import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { daysUntil, formatCurrencyINR } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { AttentionPanel, ActivityPanel, KpiGrid, notificationsToActivity } from "./shared";
import type { AttentionItem, KpiTileData } from "./types";

const MAX_ATTENTION_ITEMS = 5;
const INVOICE_DUE_SOON_DAYS = 7;

interface DashboardData {
  requirements: Requirement[];
  responseCounts: Map<string, { total: number; interested: number }>;
  quotations: CommercialQuotation[];
  rentals: Rental[];
  invoices: Invoice[];
  invoiceBalances: Map<string, number>;
  rentalCompanyNames: Map<string, string>;
  auctions: AuctionSummary[];
  activity: ReturnType<typeof notificationsToActivity>;
}

export function RenterDashboard() {
  const { session, currentMembership, hasPermission } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const organizationId = currentMembership?.organizationId;

  // This dashboard is a cross-domain summary, not one page "about" a single
  // permission — a custom role missing any one of these still deserves a
  // working page, just without that section's data (see docs/decisions.md,
  // same fix as quotations/page.tsx's canListMachines).
  const canListRequirements = hasPermission("rfq.manage");
  const canListQuotations = hasPermission("quotation.respond");
  const canListRentals = hasPermission("rental.respond");
  const canListInvoices = hasPermission("billing.respond");
  const canListAuctions = hasPermission("auction.manage");

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [
          requirements,
          quotations,
          rentals,
          invoices,
          notifications,
          rentalCompanyOrgs,
          auctions,
        ] = await Promise.all([
          canListRequirements
            ? (apiClient.listRequirements(organizationId) as Promise<Requirement[]>)
            : Promise.resolve([]),
          canListQuotations
            ? (apiClient.listQuotations(organizationId) as Promise<CommercialQuotation[]>)
            : Promise.resolve([]),
          canListRentals
            ? (apiClient.listRentals(organizationId) as Promise<Rental[]>)
            : Promise.resolve([]),
          canListInvoices
            ? (apiClient.listInvoices(organizationId) as Promise<Invoice[]>)
            : Promise.resolve([]),
          apiClient.listNotifications(organizationId) as Promise<NotificationListResponse>,
          canListQuotations
            ? (apiClient.listRentalCompanyOrganizations(organizationId) as Promise<Organization[]>)
            : Promise.resolve([]),
          canListAuctions
            ? (apiClient.listAuctionsForOrganization(organizationId) as Promise<AuctionSummary[]>)
            : Promise.resolve([]),
        ]);

        const openRequirements = requirements.filter((r) => r.status === "open");
        const responseLists = canListRequirements
          ? await Promise.all(
              openRequirements.map(
                (r) =>
                  apiClient.listResponsesForRequirement(organizationId, r.id) as Promise<
                    QuotationResponse[]
                  >,
              ),
            )
          : [];
        const responseCounts = new Map(
          openRequirements.map((r, index) => {
            const responses = responseLists[index] ?? [];
            return [
              r.id,
              {
                total: responses.length,
                interested: responses.filter((resp) => resp.status === "interested").length,
              },
            ];
          }),
        );

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
          requirements,
          responseCounts,
          quotations,
          rentals,
          invoices,
          invoiceBalances,
          rentalCompanyNames: new Map(rentalCompanyOrgs.map((org) => [org.id, org.name])),
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

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) return <LoadingState label="Loading dashboard…" />;

  const {
    requirements,
    responseCounts,
    quotations,
    rentals,
    invoices,
    invoiceBalances,
    rentalCompanyNames,
    auctions,
    activity,
  } = data;

  const openRequirements = requirements.filter((r) => r.status === "open");
  const totalResponses = [...responseCounts.values()].reduce((sum, c) => sum + c.total, 0);
  const totalInterested = [...responseCounts.values()].reduce((sum, c) => sum + c.interested, 0);
  const toReview = quotations.filter((q) => q.status === "sent" && !q.renterAcceptedAt);
  const activeRentals = rentals.filter((r) => r.status === "active" || r.status === "confirmed");
  const distinctProjects = new Set(
    activeRentals.map((r) => r.projectName).filter((name): name is string => Boolean(name)),
  );
  const awardedQuotations = quotations.filter((q) => q.status === "awarded");
  const inPlayQuotations = quotations.filter(
    (q) => q.status === "sent" || q.status === "negotiating",
  );

  const auctionsNeedingSelection = auctions.filter((a) => a.needsAttention);

  const unpaidInvoices = invoices.filter((i) => i.status === "issued" || i.status === "overdue");
  const payableTotal = [...invoiceBalances.values()].reduce((sum, v) => sum + v, 0);
  const dueSoonTotal = unpaidInvoices
    .filter((i) => i.status === "overdue" || daysUntil(i.dueDate) <= INVOICE_DUE_SOON_DAYS)
    .reduce((sum, i) => sum + (invoiceBalances.get(i.id) ?? 0), 0);

  // Tiles for a section the caller can't see are omitted, not zeroed —
  // "Open requirements: 0" would misreport "no permission" as "nothing open".
  const kpis: KpiTileData[] = [
    ...(canListRequirements
      ? [
          {
            label: "Open requirements",
            value: String(openRequirements.length),
            note: openRequirements.some((r) => daysUntil(r.validityDate) <= 1)
              ? "1 validity ends soon"
              : undefined,
            noteTone: "warning" as const,
          },
          {
            label: "Responses in",
            value: String(totalResponses),
            note: totalInterested > 0 ? `${totalInterested} interested` : undefined,
            noteTone: "success" as const,
          },
        ]
      : []),
    ...(canListQuotations
      ? [
          {
            label: "To review",
            value: String(toReview.length),
            note: toReview.length > 0 ? "quotations sent to you" : undefined,
            noteTone: "warning" as const,
          },
        ]
      : []),
    ...(canListRentals
      ? [
          {
            label: "Machines on rent",
            value: String(activeRentals.length),
            note: distinctProjects.size > 0 ? `across ${distinctProjects.size} projects` : undefined,
          },
        ]
      : []),
    ...(canListInvoices
      ? [
          {
            label: "Payable",
            value: formatCurrencyINR(payableTotal),
            note:
              dueSoonTotal > 0
                ? `${formatCurrencyINR(dueSoonTotal)} due within ${INVOICE_DUE_SOON_DAYS}d`
                : undefined,
            noteTone: "warning" as const,
          },
        ]
      : []),
    ...(canListAuctions
      ? [
          {
            label: "Auctions",
            value: String(auctions.length),
            note:
              auctionsNeedingSelection.length > 0
                ? `${auctionsNeedingSelection.length} awaiting selection`
                : undefined,
            noteTone: "warning" as const,
            href: "/auctions",
          },
        ]
      : []),
  ];

  const attention: AttentionItem[] = [
    ...toReview.map((q): AttentionItem => ({
      ref: q.referenceNumber,
      title: "Quotation awaiting your acceptance",
      detail: `${rentalCompanyNames.get(q.rentalCompanyOrganizationId) ?? "Rental company"} · ${formatCurrencyINR(q.rate)}/${q.rateUnit} · validity ${q.validityDate}`,
      state: `${Math.max(daysUntil(q.validityDate), 0)}d`,
      tone: "warning",
      actionLabel: "Open",
      href: `/quotations/${q.id}`,
    })),
    ...unpaidInvoices
      .filter((i) => i.status === "overdue" || daysUntil(i.dueDate) <= INVOICE_DUE_SOON_DAYS)
      .map((invoice): AttentionItem => {
        const overdue = invoice.status === "overdue";
        return {
          ref: invoice.invoiceNumber,
          title: overdue ? "Payment overdue" : "Invoice due soon",
          detail: `${rentalCompanyNames.get(invoice.rentalCompanyOrganizationId) ?? "Rental company"} · ${formatCurrencyINR(invoiceBalances.get(invoice.id) ?? invoice.totalAmount)} · due ${invoice.dueDate}`,
          state: overdue
            ? `Overdue ${Math.abs(daysUntil(invoice.dueDate))}d`
            : `${daysUntil(invoice.dueDate)}d`,
          tone: overdue ? "danger" : "warning",
          actionLabel: overdue ? "Pay" : "Review",
          href: `/billing?invoiceId=${invoice.id}`,
        };
      }),
    ...openRequirements
      .filter((r) => (responseCounts.get(r.id)?.total ?? 0) > 0)
      .map((r): AttentionItem => ({
        ref: `REQ-${r.id.slice(0, 8).toUpperCase()}`,
        title: "Responses received",
        detail: `${r.projectName ?? "Requirement"} · ${responseCounts.get(r.id)?.total ?? 0} responses`,
        state: "Review",
        tone: "info",
        actionLabel: "Compare",
        href: `/requirements/${r.id}`,
      })),
    ...auctionsNeedingSelection.map((a): AttentionItem => ({
      ref: `AU-${a.id.slice(0, 8).toUpperCase()}`,
      title: "Auction closed — select a participant",
      detail: `${a.requirementProjectName ?? "Requirement"} · ${a.participantCount ?? 0} participant${a.participantCount === 1 ? "" : "s"}`,
      state: "Selection pending",
      tone: "danger",
      actionLabel: "Select",
      href: `/auctions?requirementId=${a.requirementId}&auctionId=${a.id}`,
    })),
  ].slice(0, MAX_ATTENTION_ITEMS);

  const maxStage = Math.max(
    openRequirements.length,
    totalResponses,
    inPlayQuotations.length,
    awardedQuotations.length,
    1,
  );
  const pipeline = [
    { label: "Open requirements", count: openRequirements.length },
    { label: "Responses received", count: totalResponses },
    { label: "Quotations in play", count: inPlayQuotations.length },
    { label: "Awarded", count: awardedQuotations.length },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Procurement overview"
        description={`Welcome, ${session?.user.displayName ?? ""} · ${currentMembership?.organization.name ?? ""}`}
      />
      <KpiGrid kpis={kpis} />
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.4fr_1fr]">
        <AttentionPanel title="Waiting on you" items={attention} />
        <div className="flex flex-col gap-3.5">
          {(canListRequirements || canListQuotations) && (
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-ink">Requirement pipeline</h2>
              <div className="flex flex-col gap-3">
                {pipeline.map((stage) => (
                  <div key={stage.label} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-ink-muted">{stage.label}</span>
                      <span className="font-mono text-sm font-medium text-ink">{stage.count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-xs bg-neutral-bg">
                      <div
                        className="h-full rounded-xs bg-info"
                        style={{ width: `${(stage.count / maxStage) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          <ActivityPanel items={activity} />
        </div>
      </div>
    </div>
  );
}
