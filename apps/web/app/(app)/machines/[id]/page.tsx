"use client";

import { InvoiceStatus, type Invoice, type InvoiceDetail } from "@fleetip/contracts/billing";
import type { Product, ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import { MachineStatus, type Machine } from "@fleetip/contracts/equipment";
import type { Logsheet, MachineUtilization } from "@fleetip/contracts/logsheet";
import type { MaintenanceRecord } from "@fleetip/contracts/maintenance";
import type { Organization } from "@fleetip/contracts/organization";
import { RentalStatus, type Rental } from "@fleetip/contracts/rental";
import type { TransportRecord } from "@fleetip/contracts/transport";
import type { WorkOrder } from "@fleetip/contracts/work-order";
import {
  Alert,
  AttentionList,
  KeyFigures,
  PageBody,
  type AttentionListItem,
  type LaneBlock,
  type MenuItem,
} from "@fleetip/ui";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { ForbiddenPage, PageLoadError } from "../../../../components/PageStates";
import { ApiError, apiClient } from "../../../../lib/api-client";
import { useConnection } from "../../../../lib/connection";
import { OFFLINE_HINT } from "../../../../lib/errors";
import { todayIsoDate, rentalRef } from "../../../../lib/format";
import { useListBackHref } from "../../../../lib/list-state";
import { useSession } from "../../../../lib/session-context";
import { optional, useLoad } from "../../../../lib/use-load";
import { CreateRentalDialog } from "../../rentals/CreateRentalDialog";
import { EditRentalTermsDialog } from "../../rentals/EditRentalTermsDialog";
import { LogsheetDrawer } from "../../rentals/LogsheetDrawer";
import { EditMachineDialog } from "../EditMachineDialog";
import { MaintenanceFormDialog } from "../MaintenanceFormDialog";
import { productName } from "../shared";
import { AvailabilityCard } from "./AvailabilityCard";
import { CurrentRentalCard } from "./CurrentRentalCard";
import { CompleteJobDialog, RetireDialog, WorkshopDialog } from "./dialogs";
import {
  RECORD_TABS,
  activeRental,
  attentionRows,
  coverageFor,
  currentRental,
  defaultLogDate,
  deployment,
  keyFigures,
  laneModel,
  primaryAction,
  retireBlocker,
  workshopBlocker,
  type Access,
  type LaneView,
  type MachineData,
  type RecordTab,
} from "./derive";
import { HoursLogged, InspectionDocuments, IsItFree, RecordInfo, Specifications, type CheckRequest } from "./Aside";
import { MachineDetailSkeleton } from "./MachineDetailSkeleton";
import { MachineHeader, type HeaderAction } from "./MachineHeader";
import { RecordDrawer, type RecordSelection } from "./RecordDrawer";
import { RecordTabs } from "./RecordTabs";

async function loadMachine(orgId: string, id: string, access: Access, ownerName: string): Promise<MachineData> {
  const [machines, categories, products, allRentals, maintenance, allTransport, allInvoices, allWorkOrders, utilization, renters] =
    await Promise.all([
      apiClient.listMachines(orgId) as Promise<Machine[]>,
      optional(true, () => apiClient.listProductCategories() as Promise<ProductCategory[]>, [] as ProductCategory[]),
      optional(true, () => apiClient.listProducts() as Promise<Product[]>, [] as Product[]),
      optional(access.rentals, () => apiClient.listRentals(orgId) as Promise<Rental[]>, [] as Rental[]),
      optional(access.maintenance, () => apiClient.listMaintenanceForMachine(orgId, id) as Promise<MaintenanceRecord[]>, [] as MaintenanceRecord[]),
      optional(access.transport, () => apiClient.listTransportRecords(orgId) as Promise<TransportRecord[]>, [] as TransportRecord[]),
      optional(access.billing, () => apiClient.listInvoices(orgId) as Promise<Invoice[]>, [] as Invoice[]),
      optional(access.workOrders, () => apiClient.listWorkOrders(orgId) as Promise<WorkOrder[]>, [] as WorkOrder[]),
      optional(access.logsheets, () => apiClient.getMachineUtilization(orgId, id) as Promise<MachineUtilization>, null as MachineUtilization | null),
      optional(access.customers, () => apiClient.listRenterOrganizations(orgId) as Promise<Organization[]>, [] as Organization[]),
    ]);

  const machine = machines.find((m) => m.id === id);
  // There's no single-machine GET (ticket c): a machine not in this org's list is a 404.
  if (!machine) throw new ApiError("Machine not found", 404, "not_found");

  const product = products.find((p) => p.id === machine.productId) ?? null;
  const subcategoryLists = await Promise.all(
    categories.map((c) => optional(true, () => apiClient.listProductSubcategories(c.id) as Promise<ProductSubcategory[]>, [] as ProductSubcategory[])),
  );
  const subcategory = product ? (subcategoryLists.flat().find((s) => s.id === product.productSubcategoryId) ?? null) : null;
  const category = subcategory ? (categories.find((c) => c.id === subcategory.productCategoryId) ?? null) : null;

  const rentals = allRentals.filter((r) => r.machineId === id).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const rentalIds = new Set(rentals.map((r) => r.id));
  const transport = allTransport
    .filter((t) => rentalIds.has(t.rentalId))
    .sort((a, b) => (b.actualDate ?? b.plannedDate ?? b.createdAt).localeCompare(a.actualDate ?? a.plannedDate ?? a.createdAt));
  const invoices = allInvoices.filter((i) => rentalIds.has(i.rentalId)).sort((a, b) => b.billingPeriodStart.localeCompare(a.billingPeriodStart));
  const workOrders = allWorkOrders.filter((w) => w.machineId === id || rentalIds.has(w.rentalId));
  const sortedMaintenance = maintenance.filter((m) => m.machineId === id).sort((a, b) => b.startDate.localeCompare(a.startDate));

  // Wave 2: the current rental's logsheets and the balance on unpaid invoices.
  const logRental = rentals.find((r) => r.status === RentalStatus.active) ?? rentals.find((r) => r.status === RentalStatus.off_rent) ?? null;
  const unpaid = invoices.filter((i) => i.status === InvoiceStatus.issued || i.status === InvoiceStatus.overdue);
  const [logsheets, details] = await Promise.all([
    logRental
      ? optional(access.logsheets, () => apiClient.listLogsheetsForRental(orgId, logRental.id) as Promise<Logsheet[]>, [] as Logsheet[])
      : Promise.resolve([] as Logsheet[]),
    Promise.all(unpaid.map((i) => optional(access.billing, () => apiClient.getInvoiceDetail(orgId, i.id) as Promise<InvoiceDetail>, null as InvoiceDetail | null))),
  ]);

  return {
    machine,
    product,
    subcategory,
    category,
    rentals,
    maintenance: sortedMaintenance,
    transport,
    invoices,
    invoiceDetails: new Map(details.filter((d): d is InvoiceDetail => d !== null).map((d) => [d.invoice.id, d])),
    workOrders,
    logsheets,
    utilization,
    customerNames: new Map(renters.map((o) => [o.id, o.name])),
    ownerName,
    access,
    today: todayIsoDate(),
  };
}

const LEGACY_TAB: Record<string, RecordTab> = { maintenance: "workshop", overview: "rentals", documents: "rentals", activity: "rentals" };

export default function MachineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const canView = hasPermission("equipment.manage");

  const access: Access = {
    rentals: hasPermission("rental.manage"),
    maintenance: hasPermission("maintenance.manage"),
    transport: hasPermission("transport.manage"),
    billing: hasPermission("billing.manage"),
    logsheets: hasPermission("logsheet.manage"),
    workOrders: hasPermission("rental.manage"),
    customers: hasPermission("quotation.manage"),
    quotations: hasPermission("quotation.manage"),
  };
  const accessKey = Object.values(access).join(",");
  const ownerName = currentMembership?.organization.name ?? "Your organization";

  const { data, error, loading, reload } = useLoad(
    () => loadMachine(organizationId!, id, access, ownerName),
    [organizationId, id, accessKey],
    Boolean(organizationId) && canView,
  );

  if (currentMembership && !canView) {
    return <ForbiddenPage what="machines" permissionHint="Viewing fleet records needs the Equipment permission." />;
  }
  if (error) {
    return (
      <PageLoadError
        error={error}
        onRetry={() => void reload()}
        notFound={{
          title: "We can't find this machine",
          body: "It may belong to a different organization, or the link may be wrong. Machines are never deleted, so a retired machine would still open.",
        }}
        forbidden={{ what: "machines", permissionHint: "Viewing fleet records needs the Equipment permission." }}
        serverTitle="This machine didn't load"
        backHref="/machines"
        backLabel="Back to machines"
      />
    );
  }
  if (loading || !data || !organizationId) return <MachineDetailSkeleton />;

  // Keyed by id: every local state (tab-independent drawers, lane view) resets when another machine opens.
  return <MachineDetailView key={id} data={data} organizationId={organizationId} reload={reload} />;
}

function MachineDetailView({
  data,
  organizationId,
  reload,
}: {
  data: MachineData;
  organizationId: string;
  reload: () => Promise<void>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { online } = useConnection();
  const backHref = useListBackHref("machines", "/machines");

  const { machine, access } = data;
  const [view, setView] = useState<LaneView>("90");
  const [selection, setSelection] = useState<RecordSelection | null>(null);
  const [logDate, setLogDate] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"workshop" | "complete" | "retire" | "edit" | "maintenance" | "terms" | null>(null);
  const [createRental, setCreateRental] = useState<{ from?: string; to?: string } | null>(null);
  const [checkRequest, setCheckRequest] = useState<CheckRequest | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  // ?tab= deep links; read from the URL every render (never copied into state).
  const tabParam = searchParams.get("tab") ?? "rentals";
  const tab: RecordTab = (RECORD_TABS as string[]).includes(tabParam) ? (tabParam as RecordTab) : (LEGACY_TAB[tabParam] ?? "rentals");
  const setTab = useCallback(
    (next: RecordTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const active = activeRental(data);
  const current = currentRental(data);
  const coverage = useMemo(() => (active ? coverageFor(active, data.logsheets, data.today) : null), [active, data.logsheets, data.today]);
  const rows = useMemo(() => attentionRows(data, coverage), [data, coverage]);
  const figures = useMemo(() => keyFigures(data, coverage), [data, coverage]);
  const lanes = useMemo(() => laneModel(data, view, coverage), [data, view, coverage]);
  const dep = deployment(data);
  const productLabel = productName(data.product);

  const can = {
    logsheet: access.logsheets,
    rental: access.rentals,
    maintenance: access.maintenance,
  };

  function openLog(date: string) {
    if (!active) return;
    setSelection(null);
    setLogDate(date);
  }

  const action = primaryAction(data, can);
  const primary: HeaderAction | null =
    action === "logsheet"
      ? { label: "Submit logsheet", icon: "logsheet", onClick: () => openLog(defaultLogDate(coverage, data.today)) }
      : action === "create_rental"
        ? { label: "Create rental", icon: "plus", onClick: () => setCreateRental({}) }
        : action === "complete_job"
          ? { label: "Mark job complete", icon: "check", onClick: () => setDialog("complete") }
          : null;
  if (primary && !online) {
    primary.disabled = true;
    primary.title = OFFLINE_HINT;
  }

  const menuItems: MenuItem[] = [];
  const offline = !online;
  menuItems.push({
    key: "edit",
    label: "Edit details",
    icon: "edit",
    hint: offline ? OFFLINE_HINT : "Asset code, chassis, registration, year built. Product can't be changed.",
    onSelect: () => setDialog("edit"),
    disabled: offline,
  });
  if (machine.status !== MachineStatus.retired && access.maintenance) {
    menuItems.push({
      key: "log-maintenance",
      label: "Log maintenance",
      icon: "maintenance",
      hint: offline ? OFFLINE_HINT : "Record a job that happened or plan one. Machine status doesn't change.",
      onSelect: () => setDialog("maintenance"),
      disabled: offline,
    });
    if (machine.status === MachineStatus.under_maintenance) {
      menuItems.push({
        key: "complete",
        label: "Mark job complete",
        icon: "check",
        hint: offline ? OFFLINE_HINT : "Completes the workshop job and sets status back to Active.",
        onSelect: () => setDialog("complete"),
        disabled: offline,
      });
    } else {
      const blocker = workshopBlocker(data);
      menuItems.push({
        key: "workshop",
        label: "Send to workshop",
        icon: "maintenance",
        hint: offline
          ? OFFLINE_HINT
          : blocker
            ? `Not possible today: ${rentalRef(blocker.id)} is booked over today. End it or mark it off rent first.`
            : "Creates a workshop job and sets status to Under maintenance.",
        onSelect: () => setDialog("workshop"),
        disabled: offline || Boolean(blocker),
      });
    }
  }
  if (machine.status !== MachineStatus.retired) {
    const blocker = retireBlocker(data);
    menuItems.push({
      key: "retire",
      label: "Retire machine",
      icon: "retire",
      danger: true,
      separatorBefore: true,
      hint: offline
        ? OFFLINE_HINT
        : blocker
          ? `Not possible while ${rentalRef(blocker.id)} is ${blocker.status === RentalStatus.off_rent ? "off rent and returning" : blocker.status === RentalStatus.active ? "Active" : "Confirmed"}.`
          : "Stops new quotations and rentals. History is kept. This is final.",
      onSelect: () => setDialog("retire"),
      disabled: offline || Boolean(blocker),
    });
  }

  const attentionItems: AttentionListItem[] = rows.map((row) => {
    const intent = row.action?.intent;
    return {
      key: row.key,
      severity: row.severity,
      title: row.title,
      context: row.context,
      action: !row.action || !intent
        ? undefined
        : intent.kind === "href"
          ? { label: row.action.label, href: intent.href }
          : intent.kind === "log"
            ? { label: row.action.label, onClick: () => openLog(intent.date), disabled: offline || !access.logsheets }
            : intent.kind === "tab"
              ? {
                  label: row.action.label,
                  onClick: () => {
                    setTab(intent.tab);
                    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  },
                }
              : { label: row.action.label, onClick: () => setCheckRequest({ from: intent.from, to: intent.to ?? "", nonce: Date.now() }) },
    };
  });

  function onLaneSelect(block: LaneBlock) {
    const key = block.key ?? "";
    const [kind, ref] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    if (kind === "log") {
      if (access.logsheets && active && online) openLog(ref);
      return;
    }
    if (kind === "rental" || kind === "maintenance" || kind === "transport") setSelection({ kind, id: ref });
  }

  const selectedKey = selection ? `${selection.kind}:${selection.id}` : logDate ? `log:${logDate}` : null;

  return (
    <div className="flex min-w-0 flex-col">
      <MachineHeader
        machine={machine}
        product={data.product}
        subcategory={data.subcategory}
        category={data.category}
        deployment={dep}
        ownerName={data.ownerName}
        backHref={backHref}
        primary={primary}
        quote={
          access.quotations
            ? {
                href: `/quotations?create=1&machineId=${machine.id}`,
                enabled: machine.status === MachineStatus.active && online,
                reason: !online ? OFFLINE_HINT : "Only Active machines can be quoted",
              }
            : null
        }
        menuItems={menuItems}
      />

      <PageBody>
        {machine.status === MachineStatus.retired && (
          <Alert tone="neutral" icon="retire">
            <strong className="font-semibold text-ink">This machine is retired.</strong> It can&apos;t be quoted, rented or sent
            to the workshop. Its rental, workshop and invoice history is kept below. FleetIP doesn&apos;t record the date it was
            retired or who retired it.
          </Alert>
        )}

        <AttentionList items={attentionItems} note="Worked out when this page opened. FleetIP doesn't send reminders for these." />

        <KeyFigures items={figures} />

        <AvailabilityCard
          model={lanes}
          view={view}
          onViewChange={setView}
          today={data.today}
          selectedKey={selectedKey}
          onSelect={onLaneSelect}
        />

        <div className="flex flex-wrap items-start gap-3.5">
          <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-3.5">
            <CurrentRentalCard
              data={data}
              rental={current}
              coverage={current && current.id === active?.id ? coverage : null}
              canEditTerms={access.rentals && online}
              onEditTerms={() => setDialog("terms")}
            />
            <div ref={tabsRef} className="scroll-mt-4">
              <RecordTabs
                data={data}
                coverage={coverage}
                tab={tab}
                onTabChange={setTab}
                canLog={access.logsheets && online}
                onLogDate={openLog}
              />
            </div>
          </div>
          <aside
            aria-label="Machine facts"
            className="grid min-w-0 flex-[1_1_300px] grid-cols-1 gap-3.5 min-[760px]:max-[1179px]:grid-cols-2 min-[1180px]:max-w-[380px]"
          >
            <IsItFree
              data={data}
              organizationId={organizationId}
              canCheck={access.rentals}
              canCreateRental={access.rentals && machine.status === MachineStatus.active && online}
              onCreateRental={(from, to) => setCreateRental({ from, to: to ?? undefined })}
              request={checkRequest}
            />
            <HoursLogged data={data} />
            <InspectionDocuments data={data} />
            <Specifications data={data} />
            <RecordInfo data={data} />
          </aside>
        </div>
      </PageBody>

      <RecordDrawer data={data} selection={selection} onClose={() => setSelection(null)} />

      {active && logDate && (
        <LogsheetDrawer
          open
          onClose={() => setLogDate(null)}
          organizationId={organizationId}
          rental={active}
          logsheets={data.logsheets.filter((l) => l.rentalId === active.id)}
          initialDate={logDate}
          onSaved={() => void reload()}
        />
      )}

      <EditMachineDialog
        open={dialog === "edit"}
        onClose={() => setDialog(null)}
        organizationId={organizationId}
        machine={machine}
        productLabel={productLabel}
        onUpdated={() => void reload()}
      />
      <MaintenanceFormDialog
        open={dialog === "maintenance"}
        onClose={() => setDialog(null)}
        organizationId={organizationId}
        machine={machine}
        rentals={data.rentals}
        onSaved={() => void reload()}
      />
      <WorkshopDialog open={dialog === "workshop"} onClose={() => setDialog(null)} organizationId={organizationId} data={data} onChanged={() => void reload()} />
      <CompleteJobDialog open={dialog === "complete"} onClose={() => setDialog(null)} organizationId={organizationId} data={data} onChanged={() => void reload()} />
      <RetireDialog
        open={dialog === "retire"}
        onClose={() => setDialog(null)}
        organizationId={organizationId}
        data={data}
        onChanged={() => void reload()}
        productLabel={productLabel}
      />
      {current && current.status === RentalStatus.confirmed && (
        <EditRentalTermsDialog
          open={dialog === "terms"}
          onClose={() => setDialog(null)}
          organizationId={organizationId}
          rental={current}
          onUpdated={() => void reload()}
        />
      )}
      <CreateRentalDialog
        open={createRental !== null}
        onClose={() => setCreateRental(null)}
        organizationId={organizationId}
        initialMachineId={machine.id}
        initialStartDate={createRental?.from}
        initialEndDate={createRental?.to}
        onCreated={() => void reload()}
      />
    </div>
  );
}
