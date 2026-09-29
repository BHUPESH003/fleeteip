"use client";

import type { InvoiceListItem } from "@fleetip/contracts/billing";
import type { Product } from "@fleetip/contracts/catalogue";
import { MachineStatus, type Machine } from "@fleetip/contracts/equipment";
import type { Logsheet } from "@fleetip/contracts/logsheet";
import type { MaintenanceRecord } from "@fleetip/contracts/maintenance";
import { OrganizationTypeCode, type Organization } from "@fleetip/contracts/organization";
import { RentalStatus, type Rental, type RentalEvent } from "@fleetip/contracts/rental";
import type { TransportRecord } from "@fleetip/contracts/transport";
import type { WorkOrder } from "@fleetip/contracts/work-order";
import {
  AttentionList,
  Button,
  Icon,
  IdentityTile,
  KeyFigures,
  Menu,
  PageBody,
  PageHeader,
  UILink,
  type AttentionListItem,
  type IconName,
  type MenuItem,
} from "@fleetip/ui";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { ForbiddenPage, PageLoadError } from "../../../../components/PageStates";
import { ApiError, apiClient } from "../../../../lib/api-client";
import { useConnection } from "../../../../lib/connection";
import { OFFLINE_HINT } from "../../../../lib/errors";
import { rentalRef, todayIsoDate } from "../../../../lib/format";
import { useListBackHref } from "../../../../lib/list-state";
import { useSession } from "../../../../lib/session-context";
import { Status, statusLabel } from "../../../../lib/status";
import { optional, useLoad } from "../../../../lib/use-load";
import { productName } from "../../machines/shared";
import { EditRentalTermsDialog } from "../EditRentalTermsDialog";
import { LogsheetDrawer } from "../LogsheetDrawer";
import { ActivityCard, ActualDatesCard, ChainCard, CounterpartyCard, DateChangeCallout, MachineCard, RenterDatesCallout, TermsCard } from "./cards";
import {
  CancelRentalDialog,
  ChangeDatesDialog,
  CompleteRentalDialog,
  CorrectDatesDialog,
  DisputeDatesDialog,
  OffRentDialog,
  StartRentalDialog,
  VerifyDatesDialog,
} from "./dialogs";
import {
  LEGACY_TAB,
  RENTAL_TABS,
  TERMS_LOCKED,
  assetCodeOf,
  attentionRows,
  canCancel,
  counterpartyName,
  coverageFor,
  datesSummary,
  forwardTransition,
  keyFigures,
  verificationApplies,
  type ForwardTransition,
  type RentalAccess,
  type RentalData,
  type RentalTab,
} from "./derive";
import { RentalDetailSkeleton } from "./RentalDetailSkeleton";
import { RentalRecordTabs } from "./RentalRecordTabs";

/**
 * getRental serves both organization types (Rental Company: rental.manage;
 * Renter: rental.respond, with machineAssetCode/rentalCompanyOrganizationName
 * resolved server-side) and 404s a rental outside the organization. Every
 * other call is enrichment behind its own permission — optional(), so a
 * missing permission empties a section instead of failing the page.
 */
async function loadRental(orgId: string, id: string, access: RentalAccess): Promise<RentalData> {
  const [rental, machines, products, allRentals, transport, allInvoices, logsheets, workOrders, renters, events] = await Promise.all([
    apiClient.getRental(orgId, id),
    optional(access.machines, () => apiClient.listMachines(orgId) as Promise<Machine[]>, [] as Machine[]),
    // Products are only fetched to name the machine's product, so they share its guard.
    optional(access.machines, () => apiClient.listProducts() as Promise<Product[]>, [] as Product[]),
    optional(access.manage, () => apiClient.listRentals(orgId) as Promise<Rental[]>, [] as Rental[]),
    optional(access.transport, () => apiClient.listTransportForRental(orgId, id) as Promise<TransportRecord[]>, [] as TransportRecord[]),
    optional(access.billing, () => apiClient.listInvoices(orgId) as Promise<InvoiceListItem[]>, [] as InvoiceListItem[]),
    optional(access.logsheets, () => apiClient.listLogsheetsForRental(orgId, id) as Promise<Logsheet[]>, [] as Logsheet[]),
    optional(access.workOrders, () => apiClient.listWorkOrders(orgId) as Promise<WorkOrder[]>, [] as WorkOrder[]),
    optional(access.customers, () => apiClient.listRenterOrganizations(orgId) as Promise<Organization[]>, [] as Organization[]),
    // Same permission as the page itself; a failed read just empties the Activity card.
    optional(true, () => apiClient.listRentalEvents(orgId, id) as Promise<RentalEvent[]>, [] as RentalEvent[]),
  ]);
  if (!rental) throw new ApiError("Rental not found", 404, "not_found");

  const machine = machines.find((m) => m.id === rental.machineId) ?? null;
  const product = machine ? (products.find((p) => p.id === machine.productId) ?? null) : null;
  const invoices = allInvoices
    .filter((i) => i.rentalId === rental.id)
    .sort((a, b) => b.billingPeriodStart.localeCompare(a.billingPeriodStart));

  // Wave 2: the machine's workshop jobs (needs the rental's machineId).
  const maintenance = await optional(
    access.maintenance,
    () => apiClient.listMaintenanceForMachine(orgId, rental.machineId) as Promise<MaintenanceRecord[]>,
    [] as MaintenanceRecord[],
  );

  return {
    rental,
    machine,
    product,
    machineRentals: allRentals.filter((r) => r.machineId === rental.machineId),
    transport,
    invoices,
    events,
    logsheets: logsheets.filter((l) => l.rentalId === rental.id),
    workOrder: workOrders.find((w) => w.rentalId === rental.id) ?? null,
    maintenance: maintenance
      .filter((m) => m.machineId === rental.machineId)
      .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    customerNames: new Map(renters.map((o) => [o.id, o.name])),
    access,
    today: todayIsoDate(),
  };
}

export default function RentalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const isRenter = currentMembership?.organization.organizationTypeCode === OrganizationTypeCode.renter;
  const canView = isRenter ? hasPermission("rental.respond") : hasPermission("rental.manage");

  const access: RentalAccess = {
    isRenter,
    manage: !isRenter && hasPermission("rental.manage"),
    respond: isRenter && hasPermission("rental.respond"),
    machines: !isRenter && hasPermission("equipment.manage"),
    // Renters get read-only transport.respond/logsheet.respond (seeded to the
    // owner role only, per migration 0019) — a Renter member without it gets
    // an explained empty tab, same as the Rental Company side without
    // transport.manage/logsheet.manage.
    transport: isRenter ? hasPermission("transport.respond") : hasPermission("transport.manage"),
    transportWrite: !isRenter && hasPermission("transport.manage"),
    logsheets: isRenter ? hasPermission("logsheet.respond") : hasPermission("logsheet.manage"),
    logsheetWrite: !isRenter && hasPermission("logsheet.manage"),
    // Invoices are enrichment for the Invoices tab, not the point of this
    // page (rental.manage/.respond is) — a role without billing.manage/.respond
    // still gets a fully working rental page, just without invoice figures.
    billing: isRenter ? hasPermission("billing.respond") : hasPermission("billing.manage"),
    billingWrite: !isRenter && hasPermission("billing.manage"),
    workOrders: hasPermission("rental.manage") || hasPermission("rental.respond"),
    customers: !isRenter && hasPermission("quotation.manage"),
    maintenance: !isRenter && hasPermission("maintenance.manage"),
  };
  const accessKey = Object.values(access).join(",");
  const forbidden = {
    what: "rentals",
    permissionHint: isRenter ? "Viewing your rentals needs the Rentals permission." : "Viewing rentals needs the Rentals permission.",
  };

  const { data, error, loading, reload } = useLoad(
    () => loadRental(organizationId!, id, access),
    [organizationId, id, accessKey],
    Boolean(organizationId) && canView,
  );

  if (currentMembership && !canView) return <ForbiddenPage {...forbidden} />;
  if (error) {
    return (
      <PageLoadError
        error={error}
        onRetry={() => void reload()}
        notFound={{
          title: "We can't find this rental",
          body: "It may belong to a different organization, or the link may be wrong. Rentals are never deleted, so a cancelled one would still open.",
        }}
        forbidden={forbidden}
        serverTitle="This rental didn't load"
        backHref="/rentals"
        backLabel="Back to rentals"
      />
    );
  }
  if (loading || !data || !organizationId) return <RentalDetailSkeleton />;

  // A notification or search hit for a *different* rental reaches this page
  // via router.push — same route, only the [id] segment differs — which the
  // App Router doesn't remount. Keying the view by id resets every piece of
  // local state (dialogs, drawer) per rental; the tab is read from the URL.
  return <RentalDetailView key={id} data={data} organizationId={organizationId} reload={reload} />;
}

type DialogKey = "start" | "offrent" | "complete" | "cancel" | "terms" | "dates" | "correct" | "verify" | "dispute";

const PRIMARY: Record<ForwardTransition, { label: string; icon: IconName; dialog: DialogKey }> = {
  active: { label: "Start rental", icon: "calendar_check", dialog: "start" },
  off_rent: { label: "Mark off rent", icon: "clock", dialog: "offrent" },
  completed: { label: "Complete rental", icon: "check", dialog: "complete" },
};

function RentalDetailView({
  data,
  organizationId,
  reload,
}: {
  data: RentalData;
  organizationId: string;
  reload: () => Promise<void>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { online } = useConnection();
  const backHref = useListBackHref("rentals", "/rentals");
  const { rental, access } = data;
  const ref = rentalRef(rental.id);
  const offline = !online;

  const [dialog, setDialog] = useState<DialogKey | null>(null);
  const [logDate, setLogDate] = useState<string | null>(null);
  const [logsheetVersion, setLogsheetVersion] = useState(0);
  const tabsRef = useRef<HTMLDivElement>(null);

  // ?tab= deep links (Machine detail and Transport link /rentals/<id>?tab=transport),
  // read from the URL every render. Old keys still land: billing → invoices,
  // maintenance → workshop; overview/activity (and anything unknown) → the first tab.
  const available = access.isRenter ? RENTAL_TABS.filter((t) => t !== "workshop") : RENTAL_TABS;
  const tabParam = searchParams.get("tab") ?? "";
  const requested = (RENTAL_TABS as string[]).includes(tabParam) ? (tabParam as RentalTab) : LEGACY_TAB[tabParam];
  const tab: RentalTab = requested && available.includes(requested) ? requested : "transport";
  const setTab = useCallback(
    (next: RentalTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );
  function goToTab(next: RentalTab) {
    setTab(next);
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const coverage = useMemo(() => coverageFor(rental, data.logsheets, data.today), [rental, data.logsheets, data.today]);
  const rows = useMemo(() => attentionRows(data, coverage), [data, coverage]);
  const figures = useMemo(() => keyFigures(data, coverage), [data, coverage]);

  const counterparty = counterpartyName(data);
  const asset = assetCodeOf(data);
  const { dates, openNote } = datesSummary(rental);

  // ---- one state-aware primary (Rental Company), the rest in More
  const forward = access.manage ? forwardTransition(rental.status) : null;
  const primary = forward ? PRIMARY[forward] : null;
  const retiredBlocksStart = forward === RentalStatus.active && data.machine?.status === MachineStatus.retired;

  const menuItems: MenuItem[] = [];
  if (access.manage) {
    const editable = rental.status === RentalStatus.confirmed;
    menuItems.push({
      key: "terms",
      label: "Edit terms",
      icon: editable ? "edit" : "lock",
      hint: offline ? OFFLINE_HINT : editable ? "Rate, charges and operating terms. Machine and customer can't change." : TERMS_LOCKED,
      disabled: offline || !editable,
      onSelect: () => setDialog("terms"),
    });
    const datesOpen = rental.status === RentalStatus.confirmed || rental.status === RentalStatus.active;
    menuItems.push({
      key: "dates",
      label: "Change dates",
      icon: datesOpen && !rental.pendingDateChange ? "calendar_check" : "lock",
      hint: offline
        ? OFFLINE_HINT
        : !datesOpen
          ? `A ${statusLabel("rental", rental.status).toLowerCase()} rental's dates can't change.`
          : rental.pendingDateChange
            ? "A date change is already waiting for the customer. Withdraw it to propose another."
            : rental.renterOrganizationId
              ? `${rental.status === RentalStatus.active ? "Extend or end early. " : ""}The customer accepts or rejects the new dates.`
              : `${rental.status === RentalStatus.active ? "Extend or end early. " : ""}The customer isn't on FleetIP, so it applies straight away.`,
      disabled: offline || !datesOpen || Boolean(rental.pendingDateChange),
      onSelect: () => setDialog("dates"),
    });
  }
  if (access.billingWrite && rental.status !== RentalStatus.cancelled) {
    menuItems.push({
      key: "invoice",
      label: "Raise invoice",
      icon: "invoice",
      href: `/billing?create=1&rentalId=${rental.id}`,
      hint: "Opens Billing with this rental chosen. Lines are entered by hand.",
    });
  }
  if (data.machine) {
    menuItems.push({
      key: "machine",
      label: `Open ${data.machine.assetCode}`,
      icon: "machine",
      href: `/machines/${data.machine.id}`,
      hint: "The machine's other rentals, workshop jobs and availability.",
    });
  }
  if (data.workOrder) {
    menuItems.push({
      key: "work-order",
      label: `Open work order ${data.workOrder.referenceNumber}`,
      icon: "work_order",
      href: `/work-orders/${data.workOrder.id}`,
      hint: `${statusLabel("work_order", data.workOrder.status)}. It isn't updated when the rental changes.`,
    });
  }
  if (access.manage) {
    const cancellable = canCancel(rental.status);
    menuItems.push({
      key: "cancel",
      label: "Cancel rental",
      icon: "close",
      danger: true,
      separatorBefore: menuItems.length > 0,
      disabled: offline || !cancellable,
      hint: offline
        ? OFFLINE_HINT
        : cancellable
          ? "Frees the machine's dates. The work order, transport and invoices aren't changed."
          : `A ${statusLabel("rental", rental.status).toLowerCase()} rental can't be cancelled.`,
      onSelect: () => setDialog("cancel"),
    });
  }

  const attentionItems: AttentionListItem[] = rows.map((row) => {
    const intent = row.action?.intent;
    const label = row.action?.label ?? "";
    let action: AttentionListItem["action"];
    if (intent?.kind === "href") action = { label, href: intent.href };
    else if (intent?.kind === "tab") action = { label, onClick: () => goToTab(intent.tab) };
    else if (intent?.kind === "log") action = { label, onClick: () => setLogDate(intent.date), disabled: offline || !access.logsheetWrite };
    else if (intent?.kind === "dialog") action = { label, onClick: () => setDialog(intent.dialog), disabled: offline };
    return { key: row.key, severity: row.severity, title: row.title, context: row.context, action };
  });

  const showDatesChip = Boolean(rental.actualDatesVerificationStatus) && (access.isRenter || verificationApplies(rental));
  const changed = () => void reload();
  const close = () => setDialog(null);

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        breadcrumbs={[
          { label: "Rentals", href: backHref },
          { label: ref, mono: true },
        ]}
        note="Filters on the rentals list are kept when you go back"
        leading={
          <IdentityTile title="Rental">
            <Icon name="rental" size={26} strokeWidth={1.3} />
          </IdentityTile>
        }
        title={ref}
        titleMono
        meta={
          <>
            <Status domain="rental" value={rental.status} />
            {showDatesChip && rental.actualDatesVerificationStatus && (
              <Status domain="actual_dates" value={rental.actualDatesVerificationStatus} />
            )}
          </>
        }
        description={
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
              {data.machine ? (
                <UILink
                  href={`/machines/${data.machine.id}`}
                  className="font-mono font-medium text-ink-strong no-underline hover:text-accent-text hover:underline"
                >
                  {data.machine.assetCode}
                </UILink>
              ) : (
                <span className="font-mono font-medium text-ink-strong">{asset ?? "Machine not visible to your role"}</span>
              )}
              {data.product && <span>{productName(data.product)}</span>}
            </span>
            <span aria-hidden="true" className="text-separator-text">
              ·
            </span>
            <span className="text-ink-strong">{counterparty}</span>
            <span aria-hidden="true" className="text-separator-text">
              ·
            </span>
            <span>
              <span className="font-mono">{dates}</span>
              {openNote && <span> · {openNote}</span>}
            </span>
          </span>
        }
        actions={
          primary || menuItems.length > 0 ? (
            <>
              {primary && (
                <Button
                  icon={primary.icon}
                  onClick={() => setDialog(primary.dialog)}
                  disabled={offline || retiredBlocksStart}
                  title={
                    offline
                      ? OFFLINE_HINT
                      : retiredBlocksStart
                        ? "The machine is retired, so this rental can't start. Cancel it instead."
                        : undefined
                  }
                >
                  {primary.label}
                </Button>
              )}
              {menuItems.length > 0 && <Menu label={`More actions for ${ref}`} items={menuItems} width={320} />}
            </>
          ) : undefined
        }
      />

      <PageBody>
        <DateChangeCallout data={data} organizationId={organizationId} onChanged={changed} disabledReason={offline ? OFFLINE_HINT : null} />
        {access.isRenter && (
          <RenterDatesCallout
            data={data}
            onVerify={() => setDialog("verify")}
            onDispute={() => setDialog("dispute")}
            disabledReason={offline ? OFFLINE_HINT : null}
          />
        )}

        <AttentionList items={attentionItems} note="Worked out when this page opened. FleetIP doesn't send reminders for these." />

        <KeyFigures items={figures} />

        <ChainCard data={data} coverage={coverage} />

        <div className="flex flex-wrap items-start gap-3.5">
          <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-3.5">
            <TermsCard data={data} />
            <div ref={tabsRef} className="scroll-mt-4">
              <RentalRecordTabs
                data={data}
                organizationId={organizationId}
                tab={tab}
                onTabChange={setTab}
                logsheetVersion={logsheetVersion}
                onChanged={changed}
              />
            </div>
          </div>
          <aside
            aria-label="Rental facts"
            className="grid min-w-0 flex-[1_1_300px] grid-cols-1 gap-3.5 min-[760px]:max-[1179px]:grid-cols-2 min-[1180px]:max-w-[380px]"
          >
            <CounterpartyCard data={data} />
            <MachineCard data={data} />
            <ActualDatesCard
              data={data}
              onCorrect={access.manage ? () => setDialog("correct") : undefined}
              disabledReason={offline ? OFFLINE_HINT : null}
            />
            <ActivityCard data={data} organizationId={organizationId} />
          </aside>
        </div>
      </PageBody>

      {access.manage && (
        <>
          <StartRentalDialog open={dialog === "start"} onClose={close} organizationId={organizationId} data={data} onChanged={changed} />
          <OffRentDialog open={dialog === "offrent"} onClose={close} organizationId={organizationId} data={data} onChanged={changed} />
          <CompleteRentalDialog open={dialog === "complete"} onClose={close} organizationId={organizationId} data={data} onChanged={changed} />
          <CancelRentalDialog open={dialog === "cancel"} onClose={close} organizationId={organizationId} data={data} onChanged={changed} />
          <ChangeDatesDialog open={dialog === "dates"} onClose={close} organizationId={organizationId} data={data} onChanged={changed} />
          <CorrectDatesDialog open={dialog === "correct"} onClose={close} organizationId={organizationId} data={data} onChanged={changed} />
          {rental.status === RentalStatus.confirmed && (
            <EditRentalTermsDialog open={dialog === "terms"} onClose={close} organizationId={organizationId} rental={rental} onUpdated={changed} />
          )}
        </>
      )}
      {access.respond && (
        <>
          <VerifyDatesDialog open={dialog === "verify"} onClose={close} organizationId={organizationId} data={data} onChanged={changed} />
          <DisputeDatesDialog open={dialog === "dispute"} onClose={close} organizationId={organizationId} data={data} onChanged={changed} />
        </>
      )}
      {logDate && rental.status === RentalStatus.active && access.logsheetWrite && (
        <LogsheetDrawer
          open
          onClose={() => setLogDate(null)}
          organizationId={organizationId}
          rental={rental}
          logsheets={data.logsheets}
          initialDate={logDate}
          onSaved={() => {
            setLogsheetVersion((v) => v + 1);
            changed();
          }}
        />
      )}
    </div>
  );
}
