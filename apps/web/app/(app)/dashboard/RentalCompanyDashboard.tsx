"use client";

import type { AuctionSummary } from "@fleetip/contracts/auction";
import { InvoiceStatus, type InvoiceListItem } from "@fleetip/contracts/billing";
import type { Product } from "@fleetip/contracts/catalogue";
import { MachineStatus, type Machine } from "@fleetip/contracts/equipment";
import type { Notification } from "@fleetip/contracts/notification";
import type { Organization } from "@fleetip/contracts/organization";
import { CommercialQuotationStatus, type CommercialQuotation, type QuotationResponse } from "@fleetip/contracts/quotation";
import { RentalStatus, type Rental } from "@fleetip/contracts/rental";
import { Button, EmptyState, ErrorState, PageBody, PageHeader, Panel, UILink } from "@fleetip/ui";
import { apiClient } from "../../../lib/api-client";
import { describeError } from "../../../lib/errors";
import { daysUntil, formatDate, formatMoney, formatRate, formatRelativeTime, plural, rentalRef, requirementRef } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import type { Deployment } from "../../../lib/status";
import { optional, useLoad } from "../../../lib/use-load";
import { deploymentFor, productName } from "../machines/shared";
import {
  ActivityPanel,
  AttentionPanel,
  DashboardSkeleton,
  KpiGrid,
  SectionError,
  StackedBreakdown,
  count,
  dataOf,
  isUnpaid,
  toInvoiceViews,
  notificationsToActivity,
  overdueBy,
  relativeDay,
  settle,
  welcomeLine,
  type BreakdownRow,
  type InvoiceView,
  type Settled,
} from "./shared";
import type { AttentionItem, KpiTile } from "./types";

const RENTAL_ENDING_WINDOW_DAYS = 15;

interface Access {
  machines: boolean;
  rentals: boolean;
  quotations: boolean;
  invoices: boolean;
  auctions: boolean;
  requests: boolean;
}

interface RentalCompanyData {
  machines: Settled<Machine[]>;
  rentals: Settled<Rental[]>;
  quotations: Settled<CommercialQuotation[]>;
  requestedQuotations: Settled<QuotationResponse[]>;
  invoices: Settled<InvoiceView[]>;
  auctions: Settled<AuctionSummary[]>;
  notifications: Settled<Notification[]>;
  renterNames: Map<string, string>;
  productNames: Map<string, string>;
}

async function loadRentalCompanyDashboard(organizationId: string, access: Access): Promise<RentalCompanyData> {
  const [machines, rentals, quotations, invoices, notifications, renters, products, auctions, requestedQuotations] =
    await Promise.all([
      settle(access.machines, () => apiClient.listMachines(organizationId), [] as Machine[]),
      settle(access.rentals, () => apiClient.listRentals(organizationId), [] as Rental[]),
      settle(access.quotations, () => apiClient.listQuotations(organizationId), [] as CommercialQuotation[]),
      settle(access.invoices, () => apiClient.listInvoices(organizationId), [] as InvoiceListItem[]),
      settle(true, () => apiClient.listNotifications(organizationId).then((r) => r?.notifications), [] as Notification[]),
      // Name lookups are enrichment: without them rows fall back to "Renter".
      optional(access.quotations, () => apiClient.listRenterOrganizations(organizationId), [] as Organization[]),
      optional(true, () => apiClient.listProducts(), [] as Product[]),
      settle(access.auctions, () => apiClient.listAuctionsForOrganization(organizationId), [] as AuctionSummary[]),
      settle(access.requests, () => apiClient.listRequestedQuotations(organizationId), [] as QuotationResponse[]),
    ]);

  const invoiceViews: Settled<InvoiceView[]> = invoices.ok
    ? { ok: true, data: toInvoiceViews(invoices.data) }
    : { ok: false, error: invoices.error };

  return {
    machines,
    rentals,
    quotations,
    requestedQuotations,
    invoices: invoiceViews,
    auctions,
    notifications,
    renterNames: new Map(renters.map((org) => [org.id, org.name])),
    productNames: new Map(products.map((product) => [product.id, productName(product) ?? product.name])),
  };
}

export function RentalCompanyDashboard() {
  const { session, currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;

  // This dashboard is a cross-domain summary, not one page "about" a single
  // permission — a custom role missing any one of these still deserves a
  // working page, just without that section's data (see docs/decisions.md,
  // same fix as quotations/page.tsx's canListMachines). Tiles for a section
  // the caller can't see are omitted, not zeroed — "Machines: 0" would
  // misreport "no permission" as "no fleet".
  const access: Access = {
    machines: hasPermission("equipment.manage"),
    rentals: hasPermission("rental.manage"),
    quotations: hasPermission("quotation.manage"),
    invoices: hasPermission("billing.manage"),
    auctions: hasPermission("auction.participate"),
    // listRequestedQuotations is gated on rfq.respond server-side.
    requests: hasPermission("rfq.respond"),
  };
  const accessKey = Object.values(access).join(",");

  const { data, error, loading, reload } = useLoad(
    () => loadRentalCompanyDashboard(organizationId!, access),
    [organizationId, accessKey],
    Boolean(organizationId),
  );
  const retry = () => void reload();

  const header = (
    <PageHeader
      title="Operations overview"
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

  const { renterNames, productNames } = data;
  const machines = dataOf(data.machines, []);
  const rentals = dataOf(data.rentals, []);
  const quotations = dataOf(data.quotations, []);
  const invoices = dataOf(data.invoices, []);
  const auctions = dataOf(data.auctions, []);
  const requestedQuotations = dataOf(data.requestedQuotations, []);

  // ---- Deployment: on rent = an active rental, booked = a confirmed one
  // ahead, returning = off rent (machines/shared.ts deploymentFor). A
  // confirmed rental is NOT "on rent" (plan §1).
  const rentalsByMachine = new Map<string, Rental[]>();
  for (const rental of rentals) rentalsByMachine.set(rental.machineId, [...(rentalsByMachine.get(rental.machineId) ?? []), rental]);
  const deployments = machines.map((machine) => deploymentFor(machine, rentalsByMachine.get(machine.id) ?? []));
  const deployed = (value: Deployment) => deployments.filter((d) => d === value).length;
  const onRent = deployed("on_rent");
  const booked = deployed("booked");
  const returning = deployed("off_rent");
  const available = deployed("available");
  const activeCount = machines.filter((m) => m.status === MachineStatus.active).length;
  const maintenanceMachines = machines.filter((m) => m.status === MachineStatus.under_maintenance);
  const retiredCount = machines.filter((m) => m.status === MachineStatus.retired).length;
  const availabilityKnown = access.rentals && data.rentals.ok;

  // ---- Quotations
  const awaitingAcceptance = quotations.filter((q) => q.status === CommercialQuotationStatus.sent && !q.renterAcceptedAt);
  const quotationsOpen = quotations.filter((q) => q.status === CommercialQuotationStatus.sent || q.status === CommercialQuotationStatus.negotiating);
  // Dropped once a quotation actually exists for the response — same
  // cross-reference as the Quotations page's "Requested" filter, so this
  // stops nagging the moment it's been acted on (even in draft).
  const fulfilledResponseIds = new Set(
    quotations.filter((q) => q.quotationResponseId).map((q) => q.quotationResponseId as string),
  );
  const pendingQuotationRequests = requestedQuotations.filter((r) => !fulfilledResponseIds.has(r.id));

  // ---- Money
  const unpaid = invoices.filter(isUnpaid);
  const overdue = unpaid.filter((view) => view.status === InvoiceStatus.overdue);
  const outstandingTotal = unpaid.reduce((sum, view) => sum + view.balance, 0);
  const overdueTotal = overdue.reduce((sum, view) => sum + view.balance, 0);

  const auctionsSelected = auctions.filter((a) => a.needsAttention);

  const counterpartyName = (party: { renterOrganizationId: string | null; clientSnapshot: { name: string } | null }) =>
    (party.renterOrganizationId && renterNames.get(party.renterOrganizationId)) || party.clientSnapshot?.name || "Renter";

  // ---- Key figures
  const tiles: KpiTile[] = [];
  if (access.machines) {
    if (!data.machines.ok) {
      tiles.push({ key: "fleet", label: "Fleet", failed: true });
    } else {
      tiles.push({
        key: "fleet",
        label: "Fleet",
        value: count(machines.length),
        unit: machines.length === 1 ? "machine" : "machines",
        context: `${count(activeCount)} active · ${count(retiredCount)} retired`,
        href: "/machines",
      });
      if (availabilityKnown) {
        tiles.push({
          key: "available",
          label: "Available now",
          value: count(available),
          unit: available === 1 ? "machine" : "machines",
          context: "Active, with no rental booked",
          contextTone: available > 0 ? "success" : "default",
          href: "/machines?now=available",
        });
        tiles.push({
          key: "on-rent",
          label: "On rent",
          value: count(onRent),
          unit: onRent === 1 ? "machine" : "machines",
          context:
            activeCount > 0
              ? `${Math.round((onRent / activeCount) * 100)}% of active machines${booked > 0 ? ` · ${count(booked)} booked next` : ""}${returning > 0 ? ` · ${count(returning)} returning` : ""}`
              : "No active machines",
          href: "/machines?now=on_rent",
        });
      } else if (access.rentals) {
        tiles.push({ key: "on-rent", label: "On rent", failed: true });
      }
      tiles.push({
        key: "maintenance",
        label: "Under maintenance",
        value: count(maintenanceMachines.length),
        unit: maintenanceMachines.length === 1 ? "machine" : "machines",
        context: maintenanceMachines.length > 0 ? "Can't be rented until the job is done" : "Nothing in the workshop",
        contextTone: maintenanceMachines.length > 0 ? "warning" : "default",
        href: "/machines?status=under_maintenance",
      });
    }
  }
  if (access.quotations) {
    tiles.push(
      data.quotations.ok
        ? {
            key: "quotations",
            label: "Quotations open",
            value: count(quotationsOpen.length),
            context:
              awaitingAcceptance.length > 0
                ? `${count(awaitingAcceptance.length)} awaiting renter acceptance`
                : "None waiting on a renter",
            contextTone: awaitingAcceptance.length > 0 ? "warning" : "default",
            href: awaitingAcceptance.length > 0 ? "/quotations?acceptance=waiting" : "/quotations",
          }
        : { key: "quotations", label: "Quotations open", failed: true },
    );
  }
  if (access.invoices) {
    tiles.push(
      data.invoices.ok
        ? {
            key: "outstanding",
            label: "Outstanding",
            value: formatMoney(outstandingTotal),
            context:
              overdue.length > 0
                ? `${formatMoney(overdueTotal)} overdue on ${plural(overdue.length, "invoice")}`
                : unpaid.length > 0
                  ? `${plural(unpaid.length, "unpaid invoice")}, none overdue`
                  : "No unpaid invoices",
            contextTone: overdue.length > 0 ? "danger" : "default",
            // Overdue first when there is any; otherwise every unpaid invoice is "issued".
            href: overdue.length > 0 ? "/billing?status=overdue" : unpaid.length > 0 ? "/billing?status=issued" : "/billing",
          }
        : { key: "outstanding", label: "Outstanding", failed: true },
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
              auctionsSelected.length > 0
                ? `${count(auctionsSelected.length)} selected you — make a quotation`
                : "None waiting on you",
            contextTone: auctionsSelected.length > 0 ? "success" : "default",
            href: auctionsSelected.length > 0 ? "/auctions?attention=1" : "/auctions",
          }
        : { key: "auctions", label: "Auctions", failed: true },
    );
  }

  // ---- Needs attention. Every row opens the specific record, never the
  // bare list (docs/decisions.md, notification/dashboard deep links).
  const attention: AttentionItem[] = [
    // A direct customer ask — deliberately first.
    ...pendingQuotationRequests.map(
      (response): AttentionItem => ({
        key: `request-${response.id}`,
        ref: requirementRef(response.requirementId),
        title: "Quotation requested",
        detail: `A renter asked you to formalize a quotation${
          response.indicativeRate && response.indicativeRateUnit
            ? ` · you indicated ${formatRate(response.indicativeRate, response.indicativeRateUnit)}`
            : ""
        }`,
        timing: response.quotationRequestedAt ? `Asked ${formatRelativeTime(response.quotationRequestedAt)}` : undefined,
        severity: "warning",
        actionLabel: "Create quotation",
        href: `/quotations?requirementId=${response.requirementId}`,
      }),
    ),
    ...overdue.map((view): AttentionItem => {
      const rental = rentals.find((r) => r.id === view.invoice.rentalId);
      return {
        key: `invoice-${view.invoice.id}`,
        ref: view.invoice.invoiceNumber,
        status: { domain: "invoice", value: view.status },
        title: "Payment overdue",
        detail: `${rental ? counterpartyName(rental) : "Renter"} · ${formatMoney(view.balance)} was due ${formatDate(view.invoice.dueDate)}`,
        timing: overdueBy(-daysUntil(view.invoice.dueDate)),
        severity: "error",
        actionLabel: "Record payment",
        href: `/billing?invoiceId=${view.invoice.id}`,
      };
    }),
    ...awaitingAcceptance.map((q): AttentionItem => {
      const days = daysUntil(q.validityDate);
      return {
        key: `quotation-${q.id}`,
        ref: q.referenceNumber,
        status: { domain: "quotation", value: q.status },
        title: "Waiting for the renter to accept",
        detail: `${counterpartyName(q)} · valid until ${formatDate(q.validityDate)}`,
        timing: days >= 0 ? `Validity ends ${relativeDay(days)}` : "Validity date has passed",
        severity: "warning",
        actionLabel: "Follow up",
        href: `/quotations/${q.id}`,
      };
    }),
    ...maintenanceMachines.map(
      (machine): AttentionItem => ({
        key: `machine-${machine.id}`,
        ref: machine.assetCode,
        status: { domain: "machine", value: machine.status },
        title: "In the workshop, can't be rented",
        detail: `${productNames.get(machine.productId) ?? "Machine"} · Reg ${machine.registrationNumber}`,
        severity: "warning",
        actionLabel: "Open machine",
        href: `/machines/${machine.id}`,
      }),
    ),
    ...rentals
      .filter(
        (r) =>
          r.status === RentalStatus.active &&
          r.endDate !== null &&
          daysUntil(r.endDate) >= 0 &&
          daysUntil(r.endDate) <= RENTAL_ENDING_WINDOW_DAYS,
      )
      .map((r): AttentionItem => {
        const days = daysUntil(r.endDate as string);
        return {
          key: `rental-${r.id}`,
          ref: rentalRef(r.id),
          status: { domain: "rental", value: r.status },
          title: "Rental ends soon",
          detail: `${counterpartyName(r)} · ends ${formatDate(r.endDate)}${
            r.noticePeriodDays !== null ? ` · ${plural(r.noticePeriodDays, "day")} notice` : ""
          }`,
          timing: `Ends ${relativeDay(days)}`,
          severity: "warning",
          actionLabel: "Plan the return",
          href: `/rentals/${r.id}`,
        };
      }),
    ...auctionsSelected.map(
      (a): AttentionItem => ({
        key: `auction-${a.id}`,
        ref: `AU-${a.id.slice(0, 8).toUpperCase()}`,
        status: a.ownParticipantStatus ? { domain: "participant", value: a.ownParticipantStatus } : undefined,
        title: "You were selected in an auction",
        detail: `${a.requirementProjectName ?? "Requirement"} · make a commercial quotation to proceed`,
        severity: "success",
        actionLabel: "Open auction",
        href: `/auctions?requirementId=${a.requirementId}&auctionId=${a.id}`,
      }),
    ),
  ];

  const attentionMissing = [
    access.requests && !data.requestedQuotations.ok ? "quotation requests" : null,
    access.invoices && !data.invoices.ok ? "invoices" : null,
    access.quotations && !data.quotations.ok ? "quotations" : null,
    access.machines && !data.machines.ok ? "machines" : null,
    access.rentals && !data.rentals.ok ? "rentals" : null,
    access.auctions && !data.auctions.ok ? "auctions" : null,
  ].filter((word): word is string => word !== null);

  return (
    <div className="flex min-w-0 flex-col">
      {header}
      <PageBody>
        {tiles.length === 0 && (
          <EmptyState
            title="Your role doesn't cover the areas this overview sums up"
            description="Fleet, quotation, billing and auction figures appear here once your role includes those permissions. Ask an organization admin if you need them."
          />
        )}
        <KpiGrid tiles={tiles} onRetry={retry} />
        <div className="grid grid-cols-1 items-start gap-3.5 min-[1180px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <AttentionPanel title="Needs attention" items={attention} missing={attentionMissing} onRetry={retry} />
          <div className="flex min-w-0 flex-col gap-3.5">
            {access.machines && (
              <FleetAvailability
                data={data}
                access={access}
                counts={{ onRent, booked, returning, available, maintenance: maintenanceMachines.length, retired: retiredCount }}
                total={machines.length}
                onRetry={retry}
              />
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

function FleetAvailability({
  data,
  access,
  counts,
  total,
  onRetry,
}: {
  data: RentalCompanyData;
  access: Access;
  counts: { onRent: number; booked: number; returning: number; available: number; maintenance: number; retired: number };
  total: number;
  onRetry: () => void;
}) {
  const failed = !data.machines.ok ? "Machines" : access.rentals && !data.rentals.ok ? "Rentals" : null;
  const withRentals = access.rentals;
  const rows: BreakdownRow[] = withRentals
    ? [
        { key: "on_rent", label: "On rent", count: counts.onRent, swatch: "bg-on-rent", href: "/machines?now=on_rent" },
        { key: "booked", label: "Booked, not started", count: counts.booked, swatch: "bg-util-idle", href: "/machines?now=booked" },
        { key: "off_rent", label: "Returning (off rent)", count: counts.returning, swatch: "bg-util-overtime", href: "/machines?now=off_rent" },
        { key: "available", label: "Available", count: counts.available, swatch: "bg-available", href: "/machines?now=available" },
        { key: "maintenance", label: "Under maintenance", count: counts.maintenance, swatch: "bg-attention", href: "/machines?status=under_maintenance" },
        { key: "retired", label: "Retired", count: counts.retired, swatch: "bg-out-of-service", href: "/machines?status=retired" },
      ]
    : [
        {
          key: "active",
          label: "Active",
          count: total - counts.maintenance - counts.retired,
          swatch: "bg-available",
          href: "/machines?status=active",
        },
        { key: "maintenance", label: "Under maintenance", count: counts.maintenance, swatch: "bg-attention", href: "/machines?status=under_maintenance" },
        { key: "retired", label: "Retired", count: counts.retired, swatch: "bg-out-of-service", href: "/machines?status=retired" },
      ];

  return (
    <Panel
      title="Fleet right now"
      icon="machine"
      subtitle="from machine status and rentals"
      actions={
        <UILink href="/machines" className="text-xs font-medium text-accent-text no-underline hover:text-accent-text-hover hover:underline">
          Open machines
        </UILink>
      }
    >
      {failed ? (
        <SectionError what={failed} onRetry={onRetry} />
      ) : total === 0 ? (
        <EmptyState
          className="px-0 py-2"
          title="No machines registered yet"
          description="Register your first machine from the Machines page, or from a product in the catalogue."
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          <StackedBreakdown rows={rows} total={total} noun="machine" />
          <p className="m-0 text-[11px] leading-[1.45] text-meta-light">
            {withRentals
              ? "A confirmed rental counts as booked, not on rent, until it starts."
              : "Your role can't see rentals, so on-rent and booked machines aren't separated from available ones."}
          </p>
        </div>
      )}
    </Panel>
  );
}
