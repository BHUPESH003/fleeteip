"use client";

import type { AuctionSummary } from "@fleetip/contracts/auction";
import { InvoiceStatus, type InvoiceListItem } from "@fleetip/contracts/billing";
import type { Notification } from "@fleetip/contracts/notification";
import type { Organization } from "@fleetip/contracts/organization";
import {
  CommercialQuotationStatus,
  QuotationResponseStatus,
  type CommercialQuotation,
  type QuotationResponse,
} from "@fleetip/contracts/quotation";
import { RentalStatus, type Rental } from "@fleetip/contracts/rental";
import { RequirementStatus, type Requirement } from "@fleetip/contracts/rfq";
import { Button, EmptyState, ErrorState, PageBody, PageHeader, Panel } from "@fleetip/ui";
import { apiClient } from "../../../lib/api-client";
import { describeError } from "../../../lib/errors";
import { daysUntil, formatDate, formatMoney, formatRate, plural, requirementRef } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { optional, useLoad } from "../../../lib/use-load";
import {
  ActivityPanel,
  AttentionPanel,
  DashboardSkeleton,
  KpiGrid,
  SectionError,
  StageBreakdown,
  count,
  dataOf,
  isUnpaid,
  toInvoiceViews,
  notificationsToActivity,
  overdueBy,
  relativeDay,
  settle,
  welcomeLine,
  type InvoiceView,
  type Settled,
} from "./shared";
import type { AttentionItem, KpiTile } from "./types";

const INVOICE_DUE_SOON_DAYS = 7;

interface Access {
  requirements: boolean;
  quotations: boolean;
  rentals: boolean;
  invoices: boolean;
  auctions: boolean;
}

interface ResponseCount {
  total: number;
  interested: number;
}

interface RenterData {
  requirements: Settled<Requirement[]>;
  /** Per open requirement; a requirement whose responses didn't load is absent. */
  responseCounts: Map<string, ResponseCount>;
  responsesIncomplete: boolean;
  quotations: Settled<CommercialQuotation[]>;
  rentals: Settled<Rental[]>;
  invoices: Settled<InvoiceView[]>;
  auctions: Settled<AuctionSummary[]>;
  notifications: Settled<Notification[]>;
  rentalCompanyNames: Map<string, string>;
}

async function loadRenterDashboard(organizationId: string, access: Access): Promise<RenterData> {
  const [requirements, quotations, rentals, invoices, notifications, rentalCompanies, auctions] = await Promise.all([
    settle(access.requirements, () => apiClient.listRequirements(organizationId), [] as Requirement[]),
    settle(access.quotations, () => apiClient.listQuotations(organizationId), [] as CommercialQuotation[]),
    settle(access.rentals, () => apiClient.listRentals(organizationId), [] as Rental[]),
    settle(access.invoices, () => apiClient.listInvoices(organizationId), [] as InvoiceListItem[]),
    settle(true, () => apiClient.listNotifications(organizationId).then((r) => r?.notifications), [] as Notification[]),
    // Enrichment only: without it names fall back to what rentals carry, then "Rental company".
    optional(access.quotations, () => apiClient.listRentalCompanyOrganizations(organizationId), [] as Organization[]),
    settle(access.auctions, () => apiClient.listAuctionsForOrganization(organizationId), [] as AuctionSummary[]),
  ]);

  const openRequirements = requirements.ok ? requirements.data.filter((r) => r.status === RequirementStatus.open) : [];
  const responseLists = await Promise.all(
    openRequirements.map((r) =>
      optional(access.requirements, () => apiClient.listResponsesForRequirement(organizationId, r.id), null as QuotationResponse[] | null),
    ),
  );
  const responseCounts = new Map<string, ResponseCount>();
  openRequirements.forEach((requirement, index) => {
    const responses = responseLists[index];
    if (!responses) return;
    responseCounts.set(requirement.id, {
      total: responses.length,
      interested: responses.filter((response) => response.status === QuotationResponseStatus.interested).length,
    });
  });

  const invoiceViews: Settled<InvoiceView[]> = invoices.ok
    ? { ok: true, data: toInvoiceViews(invoices.data) }
    : { ok: false, error: invoices.error };

  const rentalCompanyNames = new Map(rentalCompanies.map((org) => [org.id, org.name]));
  // Rentals carry the company name for a Renter (resolved server-side).
  if (rentals.ok) {
    for (const rental of rentals.data) {
      if (rental.rentalCompanyOrganizationName && !rentalCompanyNames.has(rental.rentalCompanyOrganizationId)) {
        rentalCompanyNames.set(rental.rentalCompanyOrganizationId, rental.rentalCompanyOrganizationName);
      }
    }
  }

  return {
    requirements,
    responseCounts,
    responsesIncomplete: responseLists.some((list) => list === null),
    quotations,
    rentals,
    invoices: invoiceViews,
    auctions,
    notifications,
    rentalCompanyNames,
  };
}

export function RenterDashboard() {
  const { session, currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;

  // This dashboard is a cross-domain summary, not one page "about" a single
  // permission — a custom role missing any one of these still deserves a
  // working page, just without that section's data (see docs/decisions.md,
  // same fix as quotations/page.tsx's canListMachines). Tiles for a section
  // the caller can't see are omitted, not zeroed — "Open requirements: 0"
  // would misreport "no permission" as "nothing open".
  const access: Access = {
    requirements: hasPermission("rfq.manage"),
    quotations: hasPermission("quotation.respond"),
    rentals: hasPermission("rental.respond"),
    invoices: hasPermission("billing.respond"),
    auctions: hasPermission("auction.manage"),
  };
  const accessKey = Object.values(access).join(",");

  const { data, error, loading, reload } = useLoad(
    () => loadRenterDashboard(organizationId!, access),
    [organizationId, accessKey],
    Boolean(organizationId),
  );
  const retry = () => void reload();

  const header = (
    <PageHeader
      title="Procurement overview"
      description={welcomeLine(session?.user.displayName, currentMembership?.organization.name)}
    />
  );

  if (error) {
    return (
      <div className="flex min-w-0 flex-col">
        {header}
        <PageBody>
          <ErrorState
            title="The overview didn't load"
            message={describeError(error).body}
            action={
              <Button variant="secondary" icon="refresh" onClick={retry}>
                Try again
              </Button>
            }
          />
        </PageBody>
      </div>
    );
  }
  if (loading || !data) return <DashboardSkeleton header={header} />;

  const { responseCounts, rentalCompanyNames } = data;
  const requirements = dataOf(data.requirements, []);
  const quotations = dataOf(data.quotations, []);
  const rentals = dataOf(data.rentals, []);
  const invoices = dataOf(data.invoices, []);
  const auctions = dataOf(data.auctions, []);

  const openRequirements = requirements.filter((r) => r.status === RequirementStatus.open);
  const closingSoon = openRequirements.filter((r) => {
    const days = daysUntil(r.validityDate);
    return days >= 0 && days <= 1;
  });
  const counts = [...responseCounts.values()];
  const totalResponses = counts.reduce((sum, c) => sum + c.total, 0);
  const totalInterested = counts.reduce((sum, c) => sum + c.interested, 0);

  const toReview = quotations.filter((q) => q.status === CommercialQuotationStatus.sent && !q.renterAcceptedAt);
  const awardedQuotations = quotations.filter((q) => q.status === CommercialQuotationStatus.awarded);
  const inPlayQuotations = quotations.filter((q) => q.status === CommercialQuotationStatus.sent || q.status === CommercialQuotationStatus.negotiating);

  // A confirmed rental hasn't started: it's booked, not on rent (plan §1).
  const onRentRentals = rentals.filter((r) => r.status === RentalStatus.active);
  const bookedRentals = rentals.filter((r) => r.status === RentalStatus.confirmed);
  const distinctProjects = new Set(
    onRentRentals.map((r) => r.projectName).filter((name): name is string => Boolean(name)),
  );

  const auctionsNeedingSelection = auctions.filter((a) => a.needsAttention);

  const unpaid = invoices.filter(isUnpaid);
  const payableTotal = unpaid.reduce((sum, view) => sum + view.balance, 0);
  const overdue = unpaid.filter((view) => view.status === InvoiceStatus.overdue);
  const overdueTotal = overdue.reduce((sum, view) => sum + view.balance, 0);
  const dueSoon = unpaid.filter((view) => view.status !== InvoiceStatus.overdue && daysUntil(view.invoice.dueDate) <= INVOICE_DUE_SOON_DAYS);
  const dueSoonTotal = dueSoon.reduce((sum, view) => sum + view.balance, 0);

  const companyName = (companyId: string) => rentalCompanyNames.get(companyId) ?? "Rental company";

  // ---- Key figures
  const tiles: KpiTile[] = [];
  if (access.requirements) {
    if (!data.requirements.ok) {
      tiles.push({ key: "requirements", label: "Open requirements", failed: true });
    } else {
      tiles.push({
        key: "requirements",
        label: "Open requirements",
        value: count(openRequirements.length),
        context:
          closingSoon.length > 0
            ? `${count(closingSoon.length)} stop taking responses within a day`
            : "Accepting responses from rental companies",
        contextTone: closingSoon.length > 0 ? "warning" : "default",
        href: "/requirements?status=open",
      });
      tiles.push({
        key: "responses",
        label: "Responses in",
        value: count(totalResponses),
        context:
          data.responsesIncomplete
            ? "Some responses didn't load"
            : totalInterested > 0
              ? `${count(totalInterested)} interested`
              : "On your open requirements",
        contextTone: data.responsesIncomplete ? "danger" : totalInterested > 0 ? "success" : "default",
        href: "/requirements?status=open",
      });
    }
  }
  if (access.quotations) {
    tiles.push(
      data.quotations.ok
        ? {
            key: "review",
            label: "To review",
            value: count(toReview.length),
            unit: toReview.length === 1 ? "quotation" : "quotations",
            context: toReview.length > 0 ? "Sent to you, waiting for your answer" : "Nothing waiting on you",
            contextTone: toReview.length > 0 ? "warning" : "default",
            href: toReview.length > 0 ? "/quotations?acceptance=waiting" : "/quotations",
          }
        : { key: "review", label: "To review", failed: true },
    );
  }
  if (access.rentals) {
    tiles.push(
      data.rentals.ok
        ? {
            key: "on-rent",
            label: "On rent",
            value: count(onRentRentals.length),
            unit: onRentRentals.length === 1 ? "machine" : "machines",
            context:
              [
                distinctProjects.size > 0 ? `Across ${plural(distinctProjects.size, "project")}` : null,
                bookedRentals.length > 0 ? `${count(bookedRentals.length)} booked to start` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Rentals that have started",
            href: "/rentals?status=active",
          }
        : { key: "on-rent", label: "On rent", failed: true },
    );
  }
  if (access.invoices) {
    tiles.push(
      data.invoices.ok
        ? {
            key: "payable",
            label: "Payable",
            value: formatMoney(payableTotal),
            context:
              overdue.length > 0
                ? `${formatMoney(overdueTotal)} overdue`
                : dueSoon.length > 0
                  ? `${formatMoney(dueSoonTotal)} due within ${INVOICE_DUE_SOON_DAYS} days`
                  : unpaid.length > 0
                    ? `${plural(unpaid.length, "unpaid invoice")}`
                    : "Nothing to pay",
            contextTone: overdue.length > 0 ? "danger" : dueSoon.length > 0 ? "warning" : "default",
            // Overdue first when there is any; otherwise every unpaid invoice is "issued".
            href: overdue.length > 0 ? "/billing?status=overdue" : unpaid.length > 0 ? "/billing?status=issued" : "/billing",
          }
        : { key: "payable", label: "Payable", failed: true },
    );
  }
  if (access.auctions) {
    tiles.push(
      data.auctions.ok
        ? {
            key: "auctions",
            label: "Auctions",
            value: count(auctions.length),
            context:
              auctionsNeedingSelection.length > 0
                ? `${count(auctionsNeedingSelection.length)} closed — select a participant`
                : "None waiting on you",
            contextTone: auctionsNeedingSelection.length > 0 ? "warning" : "default",
            href: auctionsNeedingSelection.length > 0 ? "/auctions?attention=1" : "/auctions",
          }
        : { key: "auctions", label: "Auctions", failed: true },
    );
  }

  // ---- Waiting on you. Every row opens the specific record, never the
  // bare list (docs/decisions.md, notification/dashboard deep links).
  const attention: AttentionItem[] = [
    ...toReview.map((q): AttentionItem => {
      const days = daysUntil(q.validityDate);
      return {
        key: `quotation-${q.id}`,
        ref: q.referenceNumber,
        status: { domain: "quotation", value: q.status },
        title: "Quotation waiting for your answer",
        detail: `${companyName(q.rentalCompanyOrganizationId)} · ${formatRate(q.rate, q.rateUnit)} · valid until ${formatDate(q.validityDate)}`,
        timing: days >= 0 ? `Validity ends ${relativeDay(days)}` : "Validity date has passed",
        severity: "warning",
        actionLabel: "Review",
        href: `/quotations/${q.id}`,
      };
    }),
    ...[...overdue, ...dueSoon].map((view): AttentionItem => {
      const isOverdue = view.status === InvoiceStatus.overdue;
      const days = daysUntil(view.invoice.dueDate);
      return {
        key: `invoice-${view.invoice.id}`,
        ref: view.invoice.invoiceNumber,
        status: { domain: "invoice", value: view.status },
        title: isOverdue ? "Payment overdue" : "Invoice due soon",
        detail: `${companyName(view.invoice.rentalCompanyOrganizationId)} · ${formatMoney(view.balance)} due ${formatDate(view.invoice.dueDate)}`,
        timing: isOverdue ? overdueBy(-days) : `Due ${relativeDay(days)}`,
        severity: isOverdue ? "error" : "warning",
        actionLabel: "Open invoice",
        href: `/billing?invoiceId=${view.invoice.id}`,
      };
    }),
    ...openRequirements
      .filter((r) => (responseCounts.get(r.id)?.total ?? 0) > 0)
      .map((r): AttentionItem => {
        const c = responseCounts.get(r.id) ?? { total: 0, interested: 0 };
        return {
          key: `requirement-${r.id}`,
          ref: requirementRef(r.id),
          status: { domain: "requirement", value: r.status },
          title: "Responses to compare",
          detail: `${r.projectName ?? "Requirement"} · ${plural(c.total, "response")}, ${count(c.interested)} interested`,
          timing: `Stops taking responses ${relativeDay(daysUntil(r.validityDate))}`,
          severity: "info",
          actionLabel: "Compare",
          href: `/requirements/${r.id}`,
        };
      }),
    ...auctionsNeedingSelection.map(
      (a): AttentionItem => ({
        key: `auction-${a.id}`,
        ref: `AU-${a.id.slice(0, 8).toUpperCase()}`,
        status: { domain: "auction", value: a.status },
        title: "Auction closed — choose who to proceed with",
        detail: `${a.requirementProjectName ?? "Requirement"} · ${plural(a.participantCount ?? 0, "participant")}`,
        severity: "warning",
        actionLabel: "Select",
        href: `/auctions?requirementId=${a.requirementId}&auctionId=${a.id}`,
      }),
    ),
  ];

  const attentionMissing = [
    access.quotations && !data.quotations.ok ? "quotations" : null,
    access.invoices && !data.invoices.ok ? "invoices" : null,
    access.requirements && (!data.requirements.ok || data.responsesIncomplete) ? "requirement responses" : null,
    access.auctions && !data.auctions.ok ? "auctions" : null,
  ].filter((word): word is string => word !== null);

  const showPipeline = access.requirements || access.quotations;
  const pipelineFailed = (access.requirements && !data.requirements.ok) || (access.quotations && !data.quotations.ok);

  return (
    <div className="flex min-w-0 flex-col">
      {header}
      <PageBody>
        {tiles.length === 0 && (
          <EmptyState
            title="Your role doesn't cover the areas this overview sums up"
            description="Requirement, quotation, rental, billing and auction figures appear here once your role includes those permissions. Ask an organization admin if you need them."
          />
        )}
        <KpiGrid tiles={tiles} onRetry={retry} />
        <div className="grid grid-cols-1 items-start gap-3.5 min-[1180px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <AttentionPanel title="Waiting on you" items={attention} missing={attentionMissing} onRetry={retry} />
          <div className="flex min-w-0 flex-col gap-3.5">
            {showPipeline && (
              <Panel title="Requirement pipeline" icon="requirement" subtitle="what your role can see">
                {pipelineFailed ? (
                  <SectionError what="The pipeline" onRetry={retry} />
                ) : (
                  <StageBreakdown
                    rows={[
                      ...(access.requirements
                        ? [
                            { key: "open", label: "Open requirements", count: openRequirements.length, swatch: "bg-on-rent", href: "/requirements?status=open" },
                            { key: "responses", label: "Responses received", count: totalResponses, swatch: "bg-on-rent", href: "/requirements?status=open" },
                          ]
                        : []),
                      ...(access.quotations
                        ? [
                            { key: "in-play", label: "Quotations in play", count: inPlayQuotations.length, swatch: "bg-on-rent", href: "/quotations" },
                            { key: "awarded", label: "Awarded", count: awardedQuotations.length, swatch: "bg-available", href: "/quotations?status=awarded" },
                          ]
                        : []),
                    ]}
                  />
                )}
              </Panel>
            )}
            <ActivityPanel
              items={notificationsToActivity(dataOf(data.notifications, []))}
              failed={!data.notifications.ok}
              onRetry={retry}
            />
          </div>
        </div>
      </PageBody>
    </div>
  );
}
