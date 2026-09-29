"use client";

import type { Product, ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import { MachineStatus, machineStatusSchema, type Machine } from "@fleetip/contracts/equipment";
import { MaintenanceStatus, type MaintenanceRecord } from "@fleetip/contracts/maintenance";
import type { Organization } from "@fleetip/contracts/organization";
import { RentalStatus, type Rental } from "@fleetip/contracts/rental";
import {
  AllocationBar,
  AttentionStrip,
  AvailabilityLane,
  AvailabilityLaneLegend,
  BulkBar,
  BulkBarButton,
  Button,
  CellStack,
  EmptyState,
  ErrorState,
  FieldMessage,
  FilterChip,
  Icon,
  IconButton,
  Input,
  Menu,
  PageBody,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  Table,
  TableFooter,
  TableSkeleton,
  TableToolbar,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  UILink,
  cx,
  useToast,
  type AllocationSegment,
  type AttentionItem,
  type LaneBlock,
  type LaneGapLabel,
  type MenuItem,
  type SortDirection,
} from "@fleetip/ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ForbiddenPage } from "../../../components/PageStates";
import { apiClient } from "../../../lib/api-client";
import { categoryIcon } from "../../../lib/category-icon";
import { useConnection } from "../../../lib/connection";
import { downloadCsv } from "../../../lib/csv";
import { describeError, errorStatus, OFFLINE_HINT } from "../../../lib/errors";
import {
  daysBetween,
  formatCompactRange,
  formatDate,
  formatMoney,
  formatRateUnit,
  formatShortDate,
  plural,
  rentalRef,
  todayIsoDate,
} from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { Status, statusLabel, statusOptions, type Deployment } from "../../../lib/status";
import { useUrlSearch, useUrlState } from "../../../lib/url-state";
import { optional, useLoad } from "../../../lib/use-load";
import { CreateRentalDialog } from "../rentals/CreateRentalDialog";
import { IDLE_DAYS, LANE_DAYS, LANE_LEGEND, gapLabelFor, idleSince, laneBlocksFor, laneMonths, type IdleInfo } from "./lane";
import { RegisterMachineDialog } from "./RegisterMachineDialog";
import { capacityLabel, catalogueFor, currentRentalFor, deploymentFor, productName } from "./shared";

// ------------------------------------------------------------------ data

interface Access {
  rentals: boolean;
  maintenance: boolean;
  customers: boolean;
  quotations: boolean;
}

interface FleetData {
  machines: Machine[];
  rentals: Rental[];
  maintenance: MaintenanceRecord[];
  categories: ProductCategory[];
  productsById: Map<string, Product>;
  subcategoriesById: Map<string, ProductSubcategory>;
  categoriesById: Map<string, ProductCategory>;
  customerNames: Map<string, string>;
  today: string;
}

/**
 * The machines are the point of this page (equipment.manage). Rentals,
 * workshop jobs and customer names are enrichment behind their own
 * permissions: a role without rental.manage / maintenance.manage /
 * quotation.manage still gets a working list, just without "Right now",
 * the lane's blocks or customer names — each fetch is gated so it never
 * 403s the page (optional()).
 */
async function loadFleet(orgId: string, access: Access): Promise<FleetData> {
  const [machines, categories, products, rentals, maintenance, renters] = await Promise.all([
    apiClient.listMachines(orgId) as Promise<Machine[]>,
    optional(true, () => apiClient.listProductCategories() as Promise<ProductCategory[]>, [] as ProductCategory[]),
    optional(true, () => apiClient.listProducts() as Promise<Product[]>, [] as Product[]),
    optional(access.rentals, () => apiClient.listRentals(orgId) as Promise<Rental[]>, [] as Rental[]),
    optional(access.maintenance, () => apiClient.listMaintenanceRecords(orgId) as Promise<MaintenanceRecord[]>, [] as MaintenanceRecord[]),
    optional(access.customers, () => apiClient.listRenterOrganizations(orgId) as Promise<Organization[]>, [] as Organization[]),
  ]);
  const subcategoryLists = await Promise.all(
    categories.map((c) =>
      optional(true, () => apiClient.listProductSubcategories(c.id) as Promise<ProductSubcategory[]>, [] as ProductSubcategory[]),
    ),
  );
  return {
    machines,
    rentals,
    maintenance,
    categories,
    productsById: new Map(products.map((p) => [p.id, p])),
    subcategoriesById: new Map(subcategoryLists.flat().map((s) => [s.id, s])),
    categoriesById: new Map(categories.map((c) => [c.id, c])),
    customerNames: new Map(renters.map((o) => [o.id, o.name])),
    today: todayIsoDate(),
  };
}

// ------------------------------------------------------------------ rows

const ENDING_DAYS = 14;
const DEPLOYMENTS: Deployment[] = ["on_rent", "booked", "off_rent", "available"];
const MACHINE_STATUSES: MachineStatus[] = machineStatusSchema.options;
const PAGE_SIZES = [10, 20];
const DEFAULT_PAGE_SIZE = 10;

type SortKey = "asset" | "product" | "status";
type Flag = "ending" | "idle" | "noreturn";
const FLAGS: Flag[] = ["ending", "idle", "noreturn"];

const FLAG_LABEL: Record<Flag, string> = {
  ending: `Rental ends within ${ENDING_DAYS} days, nothing booked after`,
  idle: `Idle longer than ${IDLE_DAYS} days`,
  noreturn: "Workshop job with no return date",
};

interface Row {
  machine: Machine;
  product: Product | null;
  subcategory: ProductSubcategory | null;
  category: ProductCategory | null;
  /** Null when the stored status already says it (Under maintenance, Retired) or rentals aren't visible. */
  deployment: Deployment | null;
  /** Active, else returning, else the next confirmed rental. */
  current: Rental | null;
  active: Rental | null;
  /** The workshop job in progress, if any. */
  job: MaintenanceRecord | null;
  blocks: LaneBlock[];
  gap: LaneGapLabel[];
  idle: IdleInfo | null;
  endingSoon: boolean;
  noReturnJobs: number;
  search: string;
}

function customerOf(rental: Rental, names: Map<string, string>): string {
  if (rental.clientSnapshot) return rental.clientSnapshot.name;
  if (rental.renterOrganizationId) return names.get(rental.renterOrganizationId) ?? "FleetIP customer";
  return "Customer not recorded";
}

function buildRows(data: FleetData, access: Access): Row[] {
  const { today } = data;
  return data.machines.map((machine) => {
    const { product, subcategory, category } = catalogueFor(
      machine,
      data.productsById,
      data.subcategoriesById,
      data.categoriesById,
    );
    const own = data.rentals.filter((r) => r.machineId === machine.id);
    const jobs = data.maintenance.filter((m) => m.machineId === machine.id);
    const deployment = access.rentals ? deploymentFor(machine, own) : null;
    const active = own.find((r) => r.status === RentalStatus.active) ?? null;
    const blocks = laneBlocksFor(machine.id, own, jobs, (r) => customerOf(r, data.customerNames));
    const idle = deployment === "available" ? idleSince(machine, own, today) : null;
    const activeEnd = active?.endDate ?? null;
    const endingSoon =
      activeEnd !== null &&
      daysBetween(today, activeEnd) >= 0 &&
      daysBetween(today, activeEnd) <= ENDING_DAYS &&
      !own.some((r) => r.status === RentalStatus.confirmed && r.startDate > activeEnd);
    return {
      machine,
      product,
      subcategory,
      category,
      deployment,
      current: currentRentalFor(machine.id, own),
      active,
      job: jobs.find((m) => m.status === MaintenanceStatus.in_progress) ?? null,
      blocks,
      gap: gapLabelFor({ status: machine.status, blocks, windowStart: today, idle, rentalsKnown: access.rentals }),
      idle,
      endingSoon,
      noReturnJobs: jobs.filter((m) => m.status === MaintenanceStatus.in_progress && m.endDate === null).length,
      search: [machine.assetCode, machine.registrationNumber, machine.chassisNumber, product?.manufacturer, product?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    };
  });
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function compareRows(a: Row, b: Row, key: SortKey): number {
  const byAsset = collator.compare(a.machine.assetCode, b.machine.assetCode);
  if (key === "product") {
    return collator.compare(productName(a.product) ?? "\uffff", productName(b.product) ?? "\uffff") || byAsset;
  }
  if (key === "status") {
    return MACHINE_STATUSES.indexOf(a.machine.status) - MACHINE_STATUSES.indexOf(b.machine.status) || byAsset;
  }
  return byAsset;
}

// ------------------------------------------------------------------ page

export default function MachinesPage() {
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const canView = hasPermission("equipment.manage");
  const access: Access = {
    rentals: hasPermission("rental.manage"),
    maintenance: hasPermission("maintenance.manage"),
    customers: hasPermission("quotation.manage"),
    quotations: hasPermission("quotation.manage"),
  };
  const accessKey = Object.values(access).join(",");

  const { data, error, loading, reload } = useLoad(
    () => loadFleet(organizationId!, access),
    [organizationId, accessKey],
    Boolean(organizationId) && canView,
  );

  if ((currentMembership && !canView) || errorStatus(error) === 403) {
    return <ForbiddenPage what="machines" permissionHint="Viewing fleet records needs the Equipment permission." />;
  }

  return (
    <MachinesList
      organizationId={organizationId ?? null}
      access={access}
      data={loading ? null : data}
      error={error}
      reload={reload}
    />
  );
}

function MachinesList({
  organizationId,
  access,
  data,
  error,
  reload,
}: {
  organizationId: string | null;
  access: Access;
  data: FleetData | null;
  error: unknown;
  reload: () => Promise<void>;
}) {
  const router = useRouter();
  const toast = useToast();
  const { online } = useConnection();
  const { get, set } = useUrlState("machines");
  const search = useUrlSearch("q", get, set);
  const today = data?.today ?? todayIsoDate();

  const [registerOpen, setRegisterOpen] = useState(false);
  const [createFor, setCreateFor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  // ---- URL state, validated (unknown values are ignored, never trusted)
  const urlQ = get("q").trim().toLowerCase();
  const q = urlQ.length >= 2 ? urlQ : "";
  const categoryParam = get("category");
  const category = data && !data.categoriesById.has(categoryParam) ? "" : categoryParam;
  const statusParam = get("status");
  const status = (MACHINE_STATUSES as string[]).includes(statusParam) ? (statusParam as MachineStatus) : null;
  const nowParam = get("now");
  const now = access.rentals && (DEPLOYMENTS as string[]).includes(nowParam) ? (nowParam as Deployment) : null;
  const flagParam = get("flag");
  const flag = (FLAGS as string[]).includes(flagParam) ? (flagParam as Flag) : null;
  const from = access.rentals && /^\d{4}-\d{2}-\d{2}$/.test(get("from")) ? get("from") : "";
  const to = access.rentals && /^\d{4}-\d{2}-\d{2}$/.test(get("to")) ? get("to") : "";
  const sortParam = get("sort");
  const sort: SortKey = sortParam === "product" || sortParam === "status" ? sortParam : "asset";
  const dir: "asc" | "desc" = get("dir") === "desc" ? "desc" : "asc";
  const size = PAGE_SIZES.includes(Number(get("size"))) ? Number(get("size")) : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Math.floor(Number(get("page", "1"))) || 1);

  // ---- "Free between": the real availability endpoint, once per candidate machine
  const rangeError = from && to && to < from ? "“To” can't be before “From”." : null;
  const rangeWarning =
    !rangeError && from && from < today ? "This date has passed. You can check it, but a new rental can't start before today." : null;
  const rangeKey = from && !rangeError ? `${from}|${to}` : null;

  // ---- rows and the non-date filters
  const rows = useMemo(() => (data ? buildRows(data, access) : []), [data, access.rentals]);
  const matching = useMemo(
    () =>
      rows.filter((row) => {
        if (q && !row.search.includes(q)) return false;
        if (category && row.category?.id !== category) return false;
        if (status && row.machine.status !== status) return false;
        if (now && row.deployment !== now) return false;
        if (flag === "ending" && !row.endingSoon) return false;
        if (flag === "idle" && !(row.idle && row.idle.days > IDLE_DAYS)) return false;
        if (flag === "noreturn" && row.noReturnJobs === 0) return false;
        return true;
      }),
    [rows, q, category, status, now, flag],
  );
  // Retired machines can't be booked, so they're never checked (and never free).
  const candidateIds = useMemo(
    () => matching.filter((r) => r.machine.status !== MachineStatus.retired).map((r) => r.machine.id),
    [matching],
  );
  const candidateKey = candidateIds.join(",");

  // "Free between" asks checkMachinesAvailability for every candidate at once — a
  // genuinely different endpoint than the client-side "Right now" filter,
  // which is why it gets its own blue-tinted pill rather than folding into
  // that select (design system controls: "the availability range gets its
  // own blue because it queries a different endpoint"). Only machines that
  // match the other filters are checked, and answers are kept per date range
  // (until the page reloads) so changing another filter only checks what's
  // new. The server counts both committing rentals and open workshop jobs.
  const [availability, setAvailability] = useState<{
    key: string;
    data: FleetData;
    free: Map<string, boolean>;
    running: boolean;
    error: unknown;
  } | null>(null);
  const [checkNonce, setCheckNonce] = useState(0);
  const checkRun = useRef(0);

  useEffect(() => {
    if (!data || !organizationId || !rangeKey) return;
    const [checkFrom = "", checkTo = ""] = rangeKey.split("|");
    const known =
      availability && availability.key === rangeKey && availability.data === data ? availability.free : new Map<string, boolean>();
    const missing = candidateIds.filter((id) => !known.has(id));
    const run = ++checkRun.current;
    if (missing.length === 0) {
      setAvailability({ key: rangeKey, data, free: known, running: false, error: null });
      return;
    }
    setAvailability({ key: rangeKey, data, free: known, running: true, error: null });
    apiClient
      .checkMachinesAvailability(organizationId, { machineIds: missing, startDate: checkFrom, endDate: checkTo || undefined })
      .then((response) => {
        if (run !== checkRun.current) return;
        const free = new Map(known);
        for (const result of response?.results ?? []) free.set(result.machineId, result.available);
        setAvailability({ key: rangeKey, data, free, running: false, error: null });
      })
      .catch((err: unknown) => {
        if (run === checkRun.current) setAvailability({ key: rangeKey, data, free: known, running: false, error: err });
      });
    // `availability` is read as the cache for this run, not a trigger
  }, [data, organizationId, rangeKey, candidateKey, checkNonce]);

  const rangeState = rangeKey && availability?.key === rangeKey && availability.data === data ? availability : null;
  const rangeFailed = Boolean(rangeState?.error);
  const checking = Boolean(rangeKey) && !rangeFailed && (!rangeState || rangeState.running || candidateIds.some((id) => !rangeState.free.has(id)));
  const freeMap = rangeKey && rangeState && !checking && !rangeFailed ? rangeState.free : null;

  // ---- date range, sort, page
  const filtered = useMemo(() => {
    const out = freeMap ? matching.filter((row) => freeMap.get(row.machine.id) === true) : [...matching];
    out.sort((a, b) => compareRows(a, b, sort) * (dir === "desc" ? -1 : 1));
    return out;
  }, [matching, freeMap, sort, dir]);
  const matchingBeforeRange = matching.length;

  const pageCount = Math.max(1, Math.ceil(filtered.length / size));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * size, currentPage * size);

  // Selection only ever covers rows that still match the filters.
  const filteredIds = useMemo(() => new Set(filtered.map((r) => r.machine.id)), [filtered]);
  useEffect(() => {
    if (checking) return;
    setSelected((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (filteredIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [filteredIds, checking]);

  const categoryName = data?.categoriesById.get(category)?.name;
  const filterParts = [
    categoryName,
    status ? statusLabel("machine", status) : null,
    now ? statusLabel("deployment", now) : null,
    flag ? FLAG_LABEL[flag] : null,
    freeMap ? `free ${formatShortDate(from)}–${to ? formatShortDate(to) : "open-ended"}` : null,
    q ? `“${urlQ}”` : null,
  ].filter((part): part is string => Boolean(part));
  const hasFilters = Boolean(urlQ || category || status || now || flag || from || to);

  function clearFilters() {
    search.setValue("");
    set({ q: null, category: null, status: null, now: null, flag: null, from: null, to: null });
  }

  /** Attention items and summary segments land on exactly the rows they count. */
  function applyOnly(updates: Record<string, string | null>) {
    search.setValue("");
    set({ q: null, category: null, status: null, now: null, flag: null, from: null, to: null, ...updates });
  }

  function toggleSort(key: SortKey) {
    const nextDir = sort === key ? (dir === "asc" ? "desc" : "asc") : "asc";
    set({ sort: key === "asset" ? null : key, dir: nextDir === "asc" ? null : "desc" });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const pageAllSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.machine.id));
  const pageSomeSelected = pageRows.some((r) => selected.has(r.machine.id));

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of pageRows) {
        if (pageAllSelected) next.delete(r.machine.id);
        else next.add(r.machine.id);
      }
      return next;
    });
  }

  const selectedRows = rows.filter((r) => selected.has(r.machine.id));
  const unquotable = selectedRows.filter((r) => r.machine.status !== MachineStatus.active).length;

  function exportSelection() {
    const names = data?.customerNames ?? new Map<string, string>();
    const filename = `machines-${today}.csv`;
    downloadCsv(
      filename,
      [
        "Asset code",
        "Registration number",
        "Chassis number",
        "Year built",
        "Manufacturer",
        "Model",
        "Category",
        "Subcategory",
        "Rated capacity",
        "Status",
        "Right now",
        "Current rental",
        "Customer",
        "Rental start",
        "Rental end",
        "Rate",
        "Rate unit",
      ],
      selectedRows.map((r) => [
        r.machine.assetCode,
        r.machine.registrationNumber,
        r.machine.chassisNumber ?? "",
        r.machine.yearOfManufacture ?? "",
        r.product?.manufacturer ?? "",
        r.product?.name ?? "",
        r.category?.name ?? "",
        r.subcategory?.name ?? "",
        capacityLabel(r.product) ?? "",
        statusLabel("machine", r.machine.status),
        r.deployment ? statusLabel("deployment", r.deployment) : "",
        r.current ? rentalRef(r.current.id) : "",
        r.current ? customerOf(r.current, names) : "",
        r.current?.startDate ?? "",
        r.current ? (r.current.endDate ?? "open-ended") : "",
        r.current?.rate ?? "",
        r.current ? formatRateUnit(r.current.rateUnit) : "",
      ]),
    );
    toast.info({ title: `Exported ${plural(selectedRows.length, "machine")}`, body: `${filename} is downloading.` });
  }

  function addToQuotation() {
    router.push(`/quotations?create=1&machineIds=${selectedRows.map((r) => r.machine.id).join(",")}`);
  }

  /** Row click opens the machine; Ctrl/⌘/middle click opens a new tab. Links, buttons and checkboxes keep their own clicks. */
  function openRow(event: MouseEvent<HTMLElement>, href: string) {
    const target = event.target as HTMLElement;
    if (target.closest("a, button, input, select, textarea, label, [role='menu']")) return;
    if (window.getSelection()?.toString()) return;
    if (event.metaKey || event.ctrlKey || event.button === 1) {
      window.open(href, "_blank", "noopener");
      return;
    }
    router.push(href);
  }

  function rowMenu(row: Row): MenuItem[] {
    const { machine } = row;
    const items: MenuItem[] = [
      {
        key: "open",
        label: "Open machine",
        icon: "external",
        href: `/machines/${machine.id}`,
        hint: "Rentals, workshop jobs, transport and invoices.",
      },
    ];
    if (access.rentals) {
      items.push({
        key: "rent",
        label: "Create rental",
        icon: "rental",
        disabled: machine.status !== MachineStatus.active || !online,
        hint: !online ? OFFLINE_HINT : machine.status !== MachineStatus.active ? "Only Active machines can be rented." : "Book this machine for a customer.",
        onSelect: () => setCreateFor(machine.id),
      });
    }
    if (access.quotations) {
      items.push(
        machine.status === MachineStatus.active
          ? { key: "quote", label: "Quote this machine", icon: "quotation", href: `/quotations?create=1&machineId=${machine.id}`, hint: "Start a quotation with this machine." }
          : { key: "quote", label: "Quote this machine", icon: "quotation", disabled: true, hint: "Only Active machines can be quoted." },
      );
    }
    if (access.rentals) {
      items.push({ key: "rentals", label: "Rentals of this machine", icon: "rental", href: `/rentals?machine=${machine.id}` });
    }
    return items;
  }

  const registerButton = (
    <Button icon="plus" onClick={() => setRegisterOpen(true)} disabled={!online || !organizationId} title={!online ? OFFLINE_HINT : undefined}>
      Register machine
    </Button>
  );

  const header = (
    <PageHeader
      title="Machines"
      description={
        data
          ? `${plural(data.machines.length, "machine")} in your fleet: their status, where each one is right now and the next ${LANE_DAYS} days.`
          : `Your fleet: status, where each machine is right now and the next ${LANE_DAYS} days.`
      }
      actions={registerButton}
    />
  );

  const dialogs = organizationId && (
    <>
      <RegisterMachineDialog
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        organizationId={organizationId}
        onRegistered={() => void reload()}
      />
      {access.rentals && (
        <CreateRentalDialog
          open={createFor !== null}
          onClose={() => setCreateFor(null)}
          organizationId={organizationId}
          initialMachineId={createFor ?? undefined}
          onCreated={() => void reload()}
        />
      )}
    </>
  );

  if (error) {
    return (
      <div className="flex min-w-0 flex-col">
        {header}
        <PageBody>
          <ErrorState
            title="Machines didn't load"
            message={describeError(error).body}
            action={
              <Button variant="secondary" size="sm" icon="refresh" onClick={() => void reload()}>
                Try again
              </Button>
            }
          />
        </PageBody>
      </div>
    );
  }

  // First run: no machines at all — a different empty from "nothing matches".
  if (data && data.machines.length === 0) {
    return (
      <div className="flex min-w-0 flex-col">
        {header}
        <PageBody>
          <section aria-label="Machines" className="rounded-panel border border-border-strong bg-surface">
            <EmptyState
              variant="page"
              icon="machine"
              title="No machines yet — register your first"
              description="Registered machines appear here with their status, where each one is right now and what's booked over the next 90 days."
              action={registerButton}
            />
          </section>
        </PageBody>
        {dialogs}
      </div>
    );
  }

  const segments = data ? allocationSegments(rows, access, today) : [];
  const activeSegment = now && !status ? now : status && !now ? status : null;
  const attention = data ? attentionItems(rows, access, applyOnly) : [];
  const showLane = access.rentals || access.maintenance;
  // Checkbox, machine, class, status and the row menu, plus the permission-gated columns.
  const columnCount = 5 + (access.rentals ? 2 : 0) + (showLane ? 1 : 0);
  const months = laneMonths(today);
  const tableLoading = !data || checking;

  return (
    <div className="flex min-w-0 flex-col">
      {header}
      <PageBody>
        {data ? (
          <AllocationBar
            total={{ count: rows.length, label: "Total fleet", sub: "All statuses" }}
            segments={segments}
            active={activeSegment}
            onSelect={(key) => {
              if (!key) set({ now: null, status: null });
              else if ((DEPLOYMENTS as string[]).includes(key)) set({ now: key, status: null });
              else set({ status: key, now: null });
            }}
          />
        ) : (
          <div aria-hidden="true" className="flex h-[92px] gap-px overflow-hidden rounded-panel border border-border-soft bg-surface">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex flex-1 flex-col gap-2.5 px-4 py-3.5">
                <Skeleton className="h-6 w-12" />
                <Skeleton className="h-2.5 w-3/5" />
              </div>
            ))}
          </div>
        )}

        <AttentionStrip items={attention} />

        {/* No overflow-hidden on the card, so the stacked cards' row menus aren't clipped by it (the table keeps its own scroll box). */}
        <section aria-label="Machines" className="min-w-0 rounded-panel border border-border-strong bg-surface">
          {selected.size > 0 ? (
            <BulkBar
              className="rounded-t-[5px]"
              count={selected.size}
              noun="machines"
              context={
                <>
                  {filterParts.length
                    ? `of ${filtered.length} matching “${filterParts.join(" · ")}”`
                    : `of ${plural(filtered.length, "machine")}`}
                  {selected.size < filtered.length && (
                    <button
                      type="button"
                      onClick={() => setSelected(new Set(filtered.map((r) => r.machine.id)))}
                      className="ml-2.5 border-0 bg-transparent p-0 text-xs font-medium text-accent-on-dark underline-offset-2 hover:underline focus-visible:!outline-focus-on-dark"
                    >
                      Select all {filtered.length} matching
                    </button>
                  )}
                </>
              }
              actions={
                <>
                  <BulkBarButton onClick={exportSelection}>Export CSV</BulkBarButton>
                  {access.quotations && (
                    <>
                      {unquotable > 0 && (
                        <span className="text-xs text-rail-tag">
                          {unquotable} of {selected.size} selected can&apos;t be quoted
                        </span>
                      )}
                      <BulkBarButton
                        primary
                        disabled={unquotable > 0}
                        title={unquotable > 0 ? "Only Active machines can be quoted. Deselect the others." : undefined}
                        onClick={addToQuotation}
                      >
                        Add to quotation
                      </BulkBarButton>
                    </>
                  )}
                </>
              }
              onClear={() => setSelected(new Set())}
            />
          ) : (
            <TableToolbar className="rounded-t-[5px]">
              <Input
                type="search"
                size="sm"
                aria-label="Search machines"
                placeholder="Asset code, registration, chassis, product"
                enterKeyHint="search"
                className="w-[300px] max-[759px]:w-full"
                prefix={<Icon name="search" size={13} />}
                suffix={search.pending && search.value.trim().length >= 2 ? "Searching…" : undefined}
                value={search.value}
                onChange={(e) => search.setValue(e.target.value)}
              />
              {urlQ.length === 1 && <span className="text-[11px] text-meta-light">Type at least 2 characters to search.</span>}
              <Select
                size="sm"
                aria-label="Category"
                placeholder="All categories"
                options={(data?.categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
                value={category}
                onChange={(e) => set({ category: e.target.value || null })}
                className="w-44"
              />
              <Select
                size="sm"
                aria-label="Machine status"
                placeholder="Any status"
                options={statusOptions("machine")}
                value={status ?? ""}
                onChange={(e) => set({ status: e.target.value || null })}
                className="w-44"
              />
              {access.rentals && (
                <Select
                  size="sm"
                  aria-label="Right now"
                  placeholder="Right now: any"
                  options={DEPLOYMENTS.map((d) => ({ value: d, label: statusLabel("deployment", d) }))}
                  value={now ?? ""}
                  onChange={(e) => set({ now: e.target.value || null })}
                  className="w-40"
                />
              )}
              {access.rentals && (
                <FreeBetween
                  from={from}
                  to={to}
                  error={rangeError}
                  warning={rangeWarning}
                  checking={checking}
                  failure={rangeFailed ? `${describeError(rangeState?.error, "The availability check didn't run").body} The list isn't filtered by these dates.` : null}
                  onRetry={() => setCheckNonce((n) => n + 1)}
                  onChange={(next) => set(next)}
                />
              )}
              {flag && <FilterChip label={FLAG_LABEL[flag]} onRemove={() => set({ flag: null })} />}
              {hasFilters && (
                <Button variant="tertiary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </TableToolbar>
          )}

          {!tableLoading && filtered.length === 0 ? (
            freeMap && matchingBeforeRange > 0 ? (
              <EmptyState
                title="No machine is free in this window"
                description={`Every machine that matches is booked or in the workshop at some point between ${formatDate(from)} and ${to ? formatDate(to) : "an open end"}. Try shorter dates, or clear the range.`}
                action={
                  <Button variant="secondary" size="sm" onClick={() => set({ from: null, to: null })}>
                    Clear dates
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title={`No machines match ${filterParts.join(" · ") || "these filters"}.`}
                description="Change or clear the filters to see more of your fleet."
                action={
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            )
          ) : (
            <>
              <div className="max-[759px]:hidden">
                <Table bare minWidth={access.rentals ? 1180 : 860} caption="Machines" aria-busy={tableLoading || undefined}>
                  <Thead>
                    <Tr>
                      <Th className="w-10 pr-0">
                        <SelectAllBox
                          checked={pageAllSelected}
                          indeterminate={!pageAllSelected && pageSomeSelected}
                          disabled={tableLoading || pageRows.length === 0}
                          onChange={togglePage}
                          label="Select all machines on this page"
                        />
                      </Th>
                      <Th
                        className="min-w-[250px]"
                        aria-sort={sort === "asset" || sort === "product" ? (dir === "asc" ? "ascending" : "descending") : "none"}
                      >
                        <span className="inline-flex items-center gap-2">
                          <SortButton label="Asset code" direction={sort === "asset" ? dir : null} onClick={() => toggleSort("asset")} />
                          <span aria-hidden="true" className="text-separator-text">
                            ·
                          </span>
                          <SortButton label="Product" direction={sort === "product" ? dir : null} onClick={() => toggleSort("product")} />
                        </span>
                      </Th>
                      <Th className="w-[150px]">Class &amp; capacity</Th>
                      <Th className="w-[140px]" onSort={() => toggleSort("status")} sortDirection={sort === "status" ? dir : null}>
                        Status
                      </Th>
                      {access.rentals && <Th className="w-[230px]">Right now</Th>}
                      {showLane && (
                        <Th className="w-[220px]">
                          <span className="flex flex-col gap-1">
                            <span>Next {LANE_DAYS} days</span>
                            <span aria-hidden="true" className="relative block h-3 font-mono text-[9px] font-normal normal-case tracking-normal text-meta">
                              <span className="absolute left-0 top-0">Today</span>
                              {months.map((m) => (
                                <span
                                  key={m.date}
                                  className="absolute top-0 whitespace-nowrap border-l border-border-header pl-1"
                                  style={{ left: `${m.left}%` }}
                                >
                                  {m.label}
                                </span>
                              ))}
                            </span>
                          </span>
                        </Th>
                      )}
                      {access.rentals && (
                        <Th align="right" className="w-[120px]">
                          Rate
                        </Th>
                      )}
                      <Th className="w-12 pl-0">
                        <span className="sr-only">Actions</span>
                      </Th>
                    </Tr>
                  </Thead>
                  {tableLoading ? (
                    <TableSkeleton columns={columnCount} rows={8} label={checking ? "Checking availability" : "Loading machines"} />
                  ) : (
                    <Tbody>
                      {pageRows.map((row) => {
                        const href = `/machines/${row.machine.id}`;
                        const isSelected = selected.has(row.machine.id);
                        return (
                          <Tr
                            key={row.machine.id}
                            interactive
                            selected={isSelected}
                            className={cx("cursor-pointer", row.machine.status === MachineStatus.retired && !isSelected && "bg-surface-sunk")}
                            onClick={(e) => openRow(e, href)}
                            onAuxClick={(e) => {
                              if (e.button === 1) openRow(e, href);
                            }}
                          >
                            <Td className="w-10 pr-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggle(row.machine.id)}
                                aria-label={`Select ${row.machine.assetCode}`}
                                className="h-4 w-4 cursor-pointer accent-accent"
                              />
                            </Td>
                            <Td>
                              <MachineCell row={row} href={href} />
                            </Td>
                            <Td>
                              <CellStack
                                title={row.subcategory?.name ?? row.category?.name ?? "Not specified"}
                                sub={capacityLabel(row.product) ? <span className="font-mono">{capacityLabel(row.product)}</span> : undefined}
                              />
                            </Td>
                            <Td>
                              <Status domain="machine" value={row.machine.status} size="sm" />
                            </Td>
                            {access.rentals && (
                              <Td>
                                <RightNowCell row={row} names={data.customerNames} access={access} />
                              </Td>
                            )}
                            {showLane && (
                              <Td>
                                <AvailabilityLane
                                  windowStart={today}
                                  windowDays={LANE_DAYS}
                                  blocks={row.blocks}
                                  gapLabels={row.gap}
                                  height={24}
                                  showLabels={false}
                                />
                              </Td>
                            )}
                            {access.rentals && (
                              <Td align="right">
                                <RateCell rental={row.current} />
                              </Td>
                            )}
                            <Td className="w-12 pl-0">
                              <Menu label={`More actions for ${row.machine.assetCode}`} triggerSize="sm" triggerVariant="ghost" items={rowMenu(row)} width={284} />
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  )}
                </Table>
              </div>

              {/* Below 760px the table becomes stacked cards with the same information. */}
              {tableLoading ? (
                <div aria-busy="true" aria-label="Loading machines" className="flex flex-col gap-3 px-3.5 py-3.5 min-[760px]:hidden">
                  {Array.from({ length: 4 }, (_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <ul className="m-0 list-none p-0 min-[760px]:hidden">
                  {pageRows.map((row) => (
                    <MachineCard
                      key={row.machine.id}
                      row={row}
                      access={access}
                      showLane={showLane}
                      names={data.customerNames}
                      today={today}
                      selected={selected.has(row.machine.id)}
                      onToggle={() => toggle(row.machine.id)}
                      menu={rowMenu(row)}
                    />
                  ))}
                </ul>
              )}
            </>
          )}

          <TableFooter className="rounded-b-[5px]">
            {showLane && (
              <AvailabilityLaneLegend
                items={access.rentals ? LANE_LEGEND : LANE_LEGEND.filter((item) => item.kind.startsWith("workshop"))}
                todayLabel=""
                className="mr-auto"
              />
            )}
            {!access.rentals && (
              <span className="text-[11px] text-meta">Your role can&apos;t view rentals, so where each machine is right now isn&apos;t shown.</span>
            )}
            <span className="flex items-center gap-1.5 text-xs text-meta">
              <span aria-hidden="true">Per page</span>
              <Select
                size="sm"
                aria-label="Machines per page"
                options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
                value={String(size)}
                onChange={(e) => set({ size: Number(e.target.value) === DEFAULT_PAGE_SIZE ? null : e.target.value })}
                className="w-[68px]"
              />
            </span>
            <Pagination
              page={currentPage}
              pageCount={pageCount}
              onPageChange={(p) => set({ page: p === 1 ? null : p })}
              total={tableLoading ? undefined : filtered.length}
              pageSize={size}
              noun="machines"
            />
          </TableFooter>
        </section>
      </PageBody>
      {dialogs}
    </div>
  );
}

// ------------------------------------------------------------------ summary + attention

function allocationSegments(rows: Row[], access: Access, today: string): AllocationSegment[] {
  const total = rows.length || 1;
  const segment = (key: string, list: Row[], label: string, tone: AllocationSegment["tone"], sub?: string): AllocationSegment => ({
    key,
    count: list.length,
    pct: `${Math.round((list.length / total) * 100)}%`,
    grow: list.length || 1,
    label,
    tone,
    sub,
  });
  const inWorkshop = rows.filter((r) => r.machine.status === MachineStatus.under_maintenance);
  const retired = rows.filter((r) => r.machine.status === MachineStatus.retired);
  const noReturn = inWorkshop.filter((r) => r.job && r.job.endDate === null).length;
  const nextBack = inWorkshop
    .map((r) => r.job?.endDate)
    .filter((d): d is string => Boolean(d) && (d ?? "") >= today)
    .sort()[0];
  const workshopSub = !access.maintenance
    ? "Job dates need the Maintenance permission"
    : noReturn
      ? `${noReturn} without a return date`
      : nextBack
        ? `Next back ${formatShortDate(nextBack)}`
        : undefined;
  const workshop = segment(MachineStatus.under_maintenance, inWorkshop, "Under maintenance", "attention", workshopSub);
  const out = segment(MachineStatus.retired, retired, "Retired", "out-of-service", "Excluded from quoting and rentals");

  if (!access.rentals) {
    const active = rows.filter((r) => r.machine.status === MachineStatus.active);
    return [segment(MachineStatus.active, active, "Active", "available", "Where they are needs the Rentals permission"), workshop, out];
  }

  const onRent = rows.filter((r) => r.deployment === "on_rent");
  const ending = onRent.filter((r) => {
    const end = r.active?.endDate;
    return end ? daysBetween(today, end) >= 0 && daysBetween(today, end) <= ENDING_DAYS : false;
  }).length;
  const openEnded = onRent.filter((r) => r.active && r.active.endDate === null).length;
  const booked = rows.filter((r) => r.deployment === "booked");
  const lateStarts = booked.filter((r) => r.current && r.current.startDate < today).length;
  const nextStart = booked
    .map((r) => r.current?.startDate)
    .filter((d): d is string => Boolean(d) && (d ?? "") >= today)
    .sort()[0];
  const returning = rows.filter((r) => r.deployment === "off_rent");
  const oldestOffRent = returning
    .map((r) => r.current?.actualEndDate ?? r.current?.endDate)
    .filter((d): d is string => Boolean(d))
    .sort()[0];
  const available = rows.filter((r) => r.deployment === "available");
  const idle = available.filter((r) => r.idle && r.idle.days > IDLE_DAYS).length;

  return [
    segment(
      "on_rent",
      onRent,
      "On rent",
      "on-rent",
      ending ? `${ending} end within ${ENDING_DAYS} days` : openEnded ? `${openEnded} with no end date` : onRent.length ? `None end in the next ${ENDING_DAYS} days` : undefined,
    ),
    segment(
      "booked",
      booked,
      "Booked",
      "on-rent",
      lateStarts ? `${lateStarts} past the planned start` : nextStart ? `Next starts ${formatShortDate(nextStart)}` : undefined,
    ),
    segment("off_rent", returning, "Returning", "attention", oldestOffRent ? `Off rent since ${formatShortDate(oldestOffRent)} at the earliest` : undefined),
    segment(
      "available",
      available,
      "Available",
      "available",
      idle ? `${idle} idle over ${IDLE_DAYS} days` : available.length ? `None idle over ${IDLE_DAYS} days` : undefined,
    ),
    workshop,
    out,
  ];
}

function attentionItems(rows: Row[], access: Access, applyOnly: (updates: Record<string, string | null>) => void): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (access.rentals) {
    const ending = rows.filter((r) => r.endingSoon).length;
    items.push({
      key: "ending",
      count: ending,
      text: `${ending === 1 ? "rental ends" : "rentals end"} within ${ENDING_DAYS} days with nothing booked after`,
      onClick: () => applyOnly({ flag: "ending" }),
    });
    const idle = rows.filter((r) => r.idle && r.idle.days > IDLE_DAYS).length;
    items.push({
      key: "idle",
      count: idle,
      text: `${idle === 1 ? "machine" : "machines"} idle longer than ${IDLE_DAYS} days`,
      onClick: () => applyOnly({ flag: "idle" }),
    });
  }
  if (access.maintenance) {
    const jobs = rows.reduce((sum, r) => sum + r.noReturnJobs, 0);
    items.push({
      key: "noreturn",
      count: jobs,
      text: `workshop ${jobs === 1 ? "job has" : "jobs have"} no return date`,
      onClick: () => applyOnly({ flag: "noreturn" }),
    });
  }
  return items;
}

// ------------------------------------------------------------------ cells

function MachineCell({ row, href }: { row: Row; href: string }) {
  const registration = <span className="font-mono">{row.machine.registrationNumber}</span>;
  return (
    <div className="flex items-start gap-2.5">
      <span title={row.category?.name ?? "Category not found"} className="mt-0.5 flex-none text-tile-icon">
        <Icon name={categoryIcon(row.category)} size={16} />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <UILink
          href={href}
          className="self-start whitespace-nowrap font-mono text-[13px] font-semibold leading-tight text-ink no-underline hover:text-accent-text hover:underline"
        >
          {row.machine.assetCode}
        </UILink>
        <CellStack title={productName(row.product) ?? "Catalogue product not found"} sub={registration} />
      </div>
    </div>
  );
}

function RightNowCell({ row, names, access }: { row: Row; names: Map<string, string>; access: Access }) {
  const { deployment, current, machine } = row;
  if (!deployment) {
    if (machine.status === MachineStatus.under_maintenance) {
      return (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs text-ink-strong">
            {row.job ? `In the workshop since ${formatShortDate(row.job.startDate)}` : "In the workshop"}
          </span>
          <span className={cx("text-[11px] leading-tight", row.job && !row.job.endDate ? "text-destructive" : "text-meta-light")}>
            {!access.maintenance
              ? "Job dates need the Maintenance permission"
              : !row.job
                ? "No job in progress is recorded"
                : row.job.endDate
                  ? `Back ${formatShortDate(row.job.endDate)}`
                  : "No return date"}
          </span>
          {row.active && (
            <UILink href={`/rentals/${row.active.id}`} className="text-[11px] font-medium text-attention no-underline hover:underline">
              {rentalRef(row.active.id)} is still Active
            </UILink>
          )}
        </div>
      );
    }
    return (
      <span className="text-xs text-disabled-text">
        —<span className="sr-only">Retired machines aren&apos;t deployed</span>
      </span>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Status domain="deployment" value={deployment} />
        {current && (
          <UILink
            href={`/rentals/${current.id}`}
            className="whitespace-nowrap font-mono text-[11px] font-medium text-accent-text no-underline hover:text-accent-text-hover hover:underline"
          >
            {rentalRef(current.id)}
          </UILink>
        )}
      </span>
      {current ? (
        <CellStack
          title={customerOf(current, names)}
          sub={
            <span className="font-mono">
              {deployment === "off_rent"
                ? `off rent since ${formatShortDate(current.actualEndDate ?? current.endDate)}`
                : formatCompactRange(current.startDate, current.endDate)}
            </span>
          }
        />
      ) : row.idle ? (
        <span className={cx("text-[11px] leading-tight", row.idle.days > IDLE_DAYS ? "text-attention" : "text-meta-light")}>
          {row.idle.reason === "returned"
            ? `No rental since ${formatShortDate(row.idle.since)} · ${plural(row.idle.days, "day")}`
            : `Not rented yet · registered ${formatShortDate(row.idle.since)}`}
        </span>
      ) : null}
    </div>
  );
}

function RateCell({ rental }: { rental: Rental | null }) {
  if (!rental) {
    return (
      <span className="text-xs text-disabled-text">
        —<span className="sr-only">No current rental</span>
      </span>
    );
  }
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="font-mono text-[13px] font-semibold leading-tight text-ink">{formatMoney(rental.rate)}</span>
      <span className="text-[11px] leading-tight text-meta-light">{formatRateUnit(rental.rateUnit)}</span>
    </div>
  );
}

function MachineCard({
  row,
  access,
  showLane,
  names,
  today,
  selected,
  onToggle,
  menu,
}: {
  row: Row;
  access: Access;
  showLane: boolean;
  names: Map<string, string>;
  today: string;
  selected: boolean;
  onToggle: () => void;
  menu: MenuItem[];
}) {
  const href = `/machines/${row.machine.id}`;
  const capacity = capacityLabel(row.product);
  return (
    <li className={cx("flex flex-col gap-2.5 border-b border-border px-3.5 py-3 last:border-0", selected && "bg-accent-wash")}>
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${row.machine.assetCode}`}
          className="mt-0.5 h-4 w-4 flex-none cursor-pointer accent-accent"
        />
        <div className="min-w-0 flex-1">
          <MachineCell row={row} href={href} />
        </div>
        <Status domain="machine" value={row.machine.status} size="sm" />
        <Menu label={`More actions for ${row.machine.assetCode}`} triggerSize="sm" triggerVariant="ghost" items={menu} width={284} />
      </div>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 pl-[26px] text-xs text-meta">
        <span>{[row.subcategory?.name ?? row.category?.name, capacity].filter(Boolean).join(" · ") || "Class not specified"}</span>
        {access.rentals && <RateCell rental={row.current} />}
      </div>
      {access.rentals && (
        <div className="pl-[26px]">
          <RightNowCell row={row} names={names} access={access} />
        </div>
      )}
      {showLane && (
        <div className="pl-[26px]">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-meta">Next {LANE_DAYS} days</span>
          <AvailabilityLane windowStart={today} windowDays={LANE_DAYS} blocks={row.blocks} gapLabels={row.gap} height={22} showLabels={false} />
        </div>
      )}
    </li>
  );
}

// ------------------------------------------------------------------ toolbar parts

function FreeBetween({
  from,
  to,
  error,
  warning,
  checking,
  failure,
  onRetry,
  onChange,
}: {
  from: string;
  to: string;
  error: string | null;
  warning: string | null;
  checking: boolean;
  failure: string | null;
  onRetry: () => void;
  onChange: (updates: Record<string, string | null>) => void;
}) {
  const messageId = "machines-free-between-msg";
  const inputClass =
    "h-6 w-[128px] rounded-xs border border-border-control bg-surface px-1.5 font-mono text-xs text-ink outline-none focus:border-accent";
  return (
    <div className="flex flex-col gap-1">
      <div
        role="group"
        aria-label="Free between"
        className={cx(
          "flex flex-wrap items-center gap-1.5 rounded-cell border bg-on-rent-bg px-2 py-[3px]",
          error ? "border-danger-edge" : "border-on-rent/20",
        )}
      >
        <Icon name="calendar_check" size={13} className="text-on-rent" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-on-rent">Free between</span>
        <label className="sr-only" htmlFor="machines-free-from">
          Free from
        </label>
        <input
          id="machines-free-from"
          type="date"
          className={inputClass}
          value={from}
          onChange={(e) => onChange({ from: e.target.value || null, ...(e.target.value ? {} : { to: null }) })}
          aria-describedby={error || warning || failure ? messageId : undefined}
        />
        <span className="text-xs text-meta">to</span>
        <label className="sr-only" htmlFor="machines-free-to">
          Free until (optional)
        </label>
        <input
          id="machines-free-to"
          type="date"
          className={cx(inputClass, error && "border-danger-edge")}
          value={to}
          min={from || undefined}
          disabled={!from}
          onChange={(e) => onChange({ to: e.target.value || null })}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || warning || failure ? messageId : undefined}
        />
        {checking && (
          <span role="status" className="text-[11px] font-medium text-on-rent">
            Checking…
          </span>
        )}
        {(from || to) && (
          <IconButton
            icon="close"
            label="Clear dates"
            variant="ghost"
            size="sm"
            iconSize={12}
            className="!h-6 !w-6"
            onClick={() => onChange({ from: null, to: null })}
          />
        )}
      </div>
      {error ? (
        <FieldMessage id={messageId} tone="error">
          {error}
        </FieldMessage>
      ) : failure ? (
        <FieldMessage id={messageId} tone="error">
          {failure}{" "}
          <button type="button" onClick={onRetry} className="border-0 bg-transparent p-0 font-medium text-accent-text underline">
            Try again
          </button>
        </FieldMessage>
      ) : warning ? (
        <FieldMessage id={messageId} tone="warning">
          {warning}
        </FieldMessage>
      ) : null}
    </div>
  );
}

function SortButton({ label, direction, onClick }: { label: string; direction: SortDirection; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Sort by ${label.toLowerCase()}${direction ? `, ${direction === "asc" ? "ascending" : "descending"}` : ""}`}
      className={cx(
        "inline-flex items-center gap-1 border-0 bg-transparent p-0 text-[10px] font-semibold uppercase tracking-[0.1em] hover:text-ink",
        direction ? "text-ink" : "text-meta",
      )}
    >
      {label}
      <Icon
        name="chevron_down"
        size={11}
        className={cx("transition-transform", direction === "asc" && "rotate-180", !direction && "opacity-35")}
      />
    </button>
  );
}

function SelectAllBox({
  checked,
  indeterminate,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label={label}
      className="h-4 w-4 cursor-pointer accent-accent disabled:cursor-not-allowed"
    />
  );
}
