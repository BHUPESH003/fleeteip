"use client";

import type { Product, ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
import type { MaintenanceRecord } from "@fleetip/contracts/maintenance";
import type { Organization } from "@fleetip/contracts/organization";
import type { Rental } from "@fleetip/contracts/rental";
import {
  AllocationBar,
  AttentionStrip,
  AvailabilityLane,
  AvailabilityLaneLegend,
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@fleetip/ui";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { downloadCsv } from "../../../lib/csv";
import { daysBetween, formatShortDate, todayIsoDate } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import {
  DEPLOYMENT_LABEL,
  type Deployment,
  deploymentFor,
  gapLabelFor,
  laneBlocksFor,
  tileCodeFor,
} from "./lane";
import { RegisterMachineDialog } from "./RegisterMachineDialog";
import { MACHINE_STATUS_MAP, currentRentalFor } from "./shared";

const PAGE_SIZE = 10;
const LANE_WINDOW_DAYS = 90;
const LANE_SCALE_MONTHS = 3;

interface Loaded {
  machines: Machine[];
  rentals: Rental[];
  maintenanceRecords: MaintenanceRecord[];
  categories: ProductCategory[];
  productsById: Map<string, Product>;
  subcategoriesById: Map<string, ProductSubcategory>;
  renterNames: Map<string, string>;
}

export default function MachinesPage() {
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  // Rentals (availability lookups), maintenance records (the "no return
  // date" attention count) and renter orgs (name display) are enrichment,
  // not the point of this page (equipment.manage is) — a role without
  // rental.manage/maintenance.manage/quotation.manage still gets a fully
  // working page, just without those sections resolved (machines show as
  // available, the maintenance-derived sub-stats are omitted, renter name
  // falls back to "—"/"Renter"). Gating the fetch itself also skips a
  // request that would 403.
  const canListRentals = hasPermission("rental.manage");
  const canListRenterOrgs = hasPermission("quotation.manage");
  const canCheckAvailability = hasPermission("rental.manage");
  const canListMaintenance = hasPermission("maintenance.manage");

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [deploymentFilter, setDeploymentFilter] = useState<Deployment | null>(null);
  const [freeFrom, setFreeFrom] = useState("");
  const [freeTo, setFreeTo] = useState("");
  const [freeBetweenIds, setFreeBetweenIds] = useState<Set<string> | null>(null);
  const [freeBetweenError, setFreeBetweenError] = useState<string | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [density, setDensity] = useState<"balanced" | "compact">("balanced");

  const today = todayIsoDate();

  async function load(orgId: string) {
    try {
      const [machines, rentals, maintenanceRecords, categories, products, renterOrgs] = await Promise.all([
        apiClient.listMachines(orgId) as Promise<Machine[]>,
        canListRentals ? (apiClient.listRentals(orgId) as Promise<Rental[]>) : Promise.resolve([]),
        canListMaintenance
          ? (apiClient.listMaintenanceRecords(orgId) as Promise<MaintenanceRecord[]>)
          : Promise.resolve([]),
        apiClient.listProductCategories() as Promise<ProductCategory[]>,
        apiClient.listProducts() as Promise<Product[]>,
        canListRenterOrgs ? (apiClient.listRenterOrganizations(orgId) as Promise<Organization[]>) : Promise.resolve([]),
      ]);
      const subcategoryLists = await Promise.all(
        categories.map((c) => apiClient.listProductSubcategories(c.id) as Promise<ProductSubcategory[]>),
      );
      setData({
        machines,
        rentals,
        maintenanceRecords,
        categories,
        productsById: new Map(products.map((p) => [p.id, p])),
        subcategoriesById: new Map(subcategoryLists.flat().map((s) => [s.id, s])),
        renterNames: new Map(renterOrgs.map((o) => [o.id, o.name])),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load machines");
    }
  }

  useEffect(() => {
    if (organizationId) void load(organizationId);
  }, [organizationId, canListRentals, canListRenterOrgs, canListMaintenance]);

  // "Free between" queries the real checkRentalAvailability endpoint per
  // candidate machine — a genuinely different endpoint than the client-side
  // deployment filter above, which is why it gets its own blue-tinted pill
  // rather than folding into the Deployment select (per the design system's
  // controls section: "the availability range gets its own blue because it
  // queries a different endpoint").
  async function runFreeBetween(orgId: string, machines: Machine[]) {
    if (!freeFrom) {
      setFreeBetweenIds(null);
      setFreeBetweenError(null);
      return;
    }
    setCheckingAvailability(true);
    setFreeBetweenError(null);
    try {
      const results = await Promise.all(
        machines.map(async (m) => {
          const res = (await apiClient.checkRentalAvailability(orgId, m.id, freeFrom, freeTo || undefined)) as {
            available: boolean;
          };
          return res.available ? m.id : null;
        }),
      );
      setFreeBetweenIds(new Set(results.filter((id): id is string => id !== null)));
    } catch (err) {
      setFreeBetweenError(err instanceof Error ? err.message : "Failed to check availability");
      setFreeBetweenIds(null);
    } finally {
      setCheckingAvailability(false);
    }
  }

  useEffect(() => {
    if (!organizationId || !data || !canCheckAvailability) return;
    void runFreeBetween(organizationId, data.machines);
  }, [organizationId, data?.machines.length, freeFrom, freeTo, canCheckAvailability]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.machines.filter((m) => {
      const product = data.productsById.get(m.productId);
      if (q) {
        const haystack = [m.assetCode, m.registrationNumber, m.chassisNumber, product?.name, product?.manufacturer]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (categoryId && product?.productSubcategoryId) {
        const subcategory = data.subcategoriesById.get(product.productSubcategoryId);
        if (subcategory?.productCategoryId !== categoryId) return false;
      }
      if (deploymentFilter && deploymentFor(m, data.rentals) !== deploymentFilter) return false;
      if (freeBetweenIds && !freeBetweenIds.has(m.id)) return false;
      return true;
    });
  }, [data, search, categoryId, deploymentFilter, freeBetweenIds]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, categoryId, deploymentFilter, freeBetweenIds]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Loading machines…" />;

  const { machines, rentals, maintenanceRecords, categories, productsById, subcategoriesById, renterNames } = data;

  const byDeployment = (dep: Deployment) => machines.filter((m) => deploymentFor(m, rentals) === dep);
  const onRent = byDeployment("on_rent");
  const available = byDeployment("available");
  const maintenance = byDeployment("maintenance");
  const retired = byDeployment("retired");
  const total = machines.length || 1;

  const committedRate = onRent.reduce((sum, m) => {
    const r = currentRentalFor(m.id, rentals);
    return r ? sum + r.rate : sum;
  }, 0);
  const idleOver30 = available.filter((m) => {
    const rental = [...rentals]
      .filter((r) => r.machineId === m.id && r.endDate && r.status !== "cancelled")
      .sort((a, b) => (b.endDate ?? "").localeCompare(a.endDate ?? ""))[0];
    return rental?.endDate ? daysBetween(rental.endDate, today) > 30 : false;
  }).length;
  // "Without a return date" — an in-progress maintenance record with no
  // endDate set, for a machine currently marked under_maintenance. Real
  // data from listMaintenanceRecords, only resolved when the caller holds
  // maintenance.manage (canListMaintenance) — 0 otherwise, not fabricated.
  const maintenanceNoReturn = maintenance.filter((m) =>
    maintenanceRecords.some(
      (rec) => rec.machineId === m.id && rec.status === "in_progress" && rec.endDate === null,
    ),
  );

  const endingSoon = onRent.filter((m) => {
    const rental = currentRentalFor(m.id, rentals);
    return rental?.endDate ? daysBetween(today, rental.endDate) <= 14 && daysBetween(today, rental.endDate) >= 0 : false;
  }).length;

  const rowHeight = density === "compact" ? 52 : 64;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = pageItems.every((m) => next.has(m.id));
      for (const m of pageItems) {
        if (allSelected) next.delete(m.id);
        else next.add(m.id);
      }
      return next;
    });
  }

  async function handleMarkUnderMaintenance() {
    if (!organizationId) return;
    await Promise.all(
      [...selected].map((id) => apiClient.updateMachineStatus(organizationId, id, "under_maintenance")),
    );
    setSelected(new Set());
    await load(organizationId);
  }

  function handleExportSelection() {
    const rows = machines
      .filter((m) => selected.has(m.id))
      .map((m) => {
        const product = productsById.get(m.productId);
        const rental = currentRentalFor(m.id, rentals);
        return [
          m.assetCode,
          product ? `${product.manufacturer} ${product.name}` : "",
          m.registrationNumber,
          m.status,
          rental ? (rental.renterOrganizationId && renterNames.get(rental.renterOrganizationId)) || rental.clientSnapshot?.name || "" : "",
        ];
      });
    downloadCsv("machines.csv", ["Asset code", "Product", "Registration", "Status", "Current renter"], rows);
  }

  // 90-day lane window starts today; the month scale spans 3 labels.
  const windowStart = today;
  const scaleLabels = Array.from({ length: LANE_SCALE_MONTHS }, (_, i) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + i);
    return new Intl.DateTimeFormat("en-GB", { month: "short" }).format(d);
  });

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <PageHeader
        title="Machines"
        description={`${machines.length} registered assets`}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleExportSelection} disabled={selected.size === 0}>
              Export CSV
            </Button>
            <Button onClick={() => setRegisterOpen(true)}>Register machine</Button>
          </div>
        }
      />

      <AllocationBar
        total={{ count: machines.length, label: "Total fleet", sub: "All statuses" }}
        active={deploymentFilter}
        onSelect={(key) => setDeploymentFilter(key as Deployment | null)}
        segments={[
          {
            key: "on_rent",
            count: onRent.length,
            pct: `${Math.round((onRent.length / total) * 100)}%`,
            grow: onRent.length || 1,
            label: "On rent",
            sub: committedRate > 0 ? `₹${(committedRate / 100000).toFixed(1)}L committed this month` : undefined,
            tone: "on-rent",
          },
          {
            key: "available",
            count: available.length,
            pct: `${Math.round((available.length / total) * 100)}%`,
            grow: available.length || 1,
            label: "Available",
            sub: idleOver30 > 0 ? `${idleOver30} idle over 30 days` : undefined,
            tone: "available",
          },
          {
            key: "maintenance",
            count: maintenance.length,
            pct: `${Math.round((maintenance.length / total) * 100)}%`,
            grow: maintenance.length || 1,
            label: "Under maintenance",
            sub: maintenanceNoReturn.length > 0 ? `${maintenanceNoReturn.length} without a return date` : undefined,
            tone: "attention",
          },
          {
            key: "retired",
            count: retired.length,
            pct: `${Math.round((retired.length / total) * 100)}%`,
            grow: retired.length || 1,
            label: "Retired",
            sub: "Excluded from quoting",
            tone: "out-of-service",
          },
        ]}
      />

      <AttentionStrip
        items={[
          {
            key: "ending-soon",
            count: endingSoon,
            text: "rentals end within 14 days — machines returning",
            onClick: () => setDeploymentFilter("on_rent"),
          },
          {
            key: "idle-30",
            count: idleOver30,
            text: "machines idle longer than 30 days",
            onClick: () => setDeploymentFilter("available"),
          },
          {
            key: "maint-no-return",
            count: maintenanceNoReturn.length,
            text: "maintenance job with no return date",
            onClick: () => setDeploymentFilter("maintenance"),
          },
        ]}
      />

      <div className="rounded-panel border border-border-strong bg-surface">
        {selected.size === 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border-soft bg-surface-sunk px-3.5 py-2.5">
            <Input
              placeholder="Filter this list…"
              className="w-52"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              className="w-44"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              options={[{ value: "", label: "All categories" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
            />
            <Select
              className="w-44"
              value={deploymentFilter ?? ""}
              onChange={(e) => setDeploymentFilter((e.target.value || null) as Deployment | null)}
              options={[
                { value: "", label: "Any deployment" },
                { value: "on_rent", label: "On rent" },
                { value: "available", label: "Available" },
                { value: "maintenance", label: "Maintenance" },
                { value: "retired", label: "Retired" },
              ]}
            />
            {canCheckAvailability && (
              <div className="flex items-center gap-1.5 rounded-cell border border-on-rent-lane-edge/40 bg-on-rent-bg px-2.5 py-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-on-rent">Free between</span>
                <input
                  type="date"
                  className="w-[110px] bg-transparent font-mono text-xs text-on-rent outline-none"
                  value={freeFrom}
                  min={today}
                  onChange={(e) => setFreeFrom(e.target.value)}
                />
                <span className="text-xs text-meta">→</span>
                <input
                  type="date"
                  className="w-[110px] bg-transparent font-mono text-xs text-on-rent outline-none"
                  value={freeTo}
                  min={freeFrom || today}
                  onChange={(e) => setFreeTo(e.target.value)}
                />
                {checkingAvailability && (
                  <span className="h-3 w-3 flex-none animate-spin rounded-full border-2 border-on-rent border-t-transparent" />
                )}
                {freeFrom && (
                  <button
                    type="button"
                    className="text-xs text-meta hover:text-ink"
                    onClick={() => {
                      setFreeFrom("");
                      setFreeTo("");
                      setFreeBetweenIds(null);
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
            {(search || categoryId || deploymentFilter || freeFrom) && (
              <button
                type="button"
                className="text-xs font-medium text-accent-text"
                onClick={() => {
                  setSearch("");
                  setCategoryId("");
                  setDeploymentFilter(null);
                  setFreeFrom("");
                  setFreeTo("");
                  setFreeBetweenIds(null);
                }}
              >
                Clear filters
              </button>
            )}
            <button
              type="button"
              className="ml-auto text-xs font-medium text-ink-strong"
              onClick={() => setDensity((d) => (d === "balanced" ? "compact" : "balanced"))}
            >
              {density === "balanced" ? "Compact rows" : "Balanced rows"}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 border-b border-rail bg-rail px-3.5 py-2.5">
            <span className="text-xs font-semibold text-white">
              {selected.size} {selected.size === 1 ? "machine" : "machines"} selected
            </span>
            <button type="button" className="text-xs text-rail-muted" onClick={() => setSelected(new Set())}>
              Clear
            </button>
            <span className="h-4.5 w-px bg-rail-control-border" />
            <Button size="sm" onClick={() => void handleMarkUnderMaintenance()}>
              Mark under maintenance
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="border-rail-control-border bg-transparent text-white hover:bg-rail-active"
              onClick={handleExportSelection}
            >
              Export selection
            </Button>
            <span className="ml-auto text-[11px] leading-tight text-rail-tag">
              Bulk status change writes one machine at a time — no batch endpoint yet
            </span>
          </div>
        )}

        {freeBetweenError && (
          <div className="border-b border-border-soft bg-danger-bg px-3.5 py-2 text-xs text-danger">
            {freeBetweenError}
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            title={freeBetweenIds ? "No machine is free in this window" : "No machines match these filters"}
            description={
              freeBetweenIds
                ? "Widen the date range, or check the open market for another rental company's fleet."
                : "Try clearing filters, or register your first machine."
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] border-collapse text-sm">
                <Thead>
                  <Tr>
                    <Th className="w-9">
                      <input
                        type="checkbox"
                        checked={pageItems.length > 0 && pageItems.every((m) => selected.has(m.id))}
                        onChange={toggleAllOnPage}
                        aria-label="Select all machines on this page"
                      />
                    </Th>
                    <Th className="w-[240px]">Machine</Th>
                    <Th className="w-[120px]">Class &amp; capacity</Th>
                    <Th className="w-[100px]">Status</Th>
                    <Th className="min-w-[180px]">
                      <span className="inline-flex items-center gap-1.5">
                        Deployment
                        <span className="rounded-xs border border-border-strong px-1 py-px font-mono text-[9px] uppercase tracking-wide text-meta">
                          derived
                        </span>
                      </span>
                    </Th>
                    <Th className="w-[200px]">
                      <div className="flex flex-col gap-1 pb-0.5">
                        <div className="flex items-center justify-between">
                          <span>Next 90 days</span>
                          <span className="font-mono text-[9px] text-meta">{new Date(today).getUTCFullYear()}</span>
                        </div>
                        <div className="flex">
                          {scaleLabels.map((label, i) => (
                            <span
                              key={`${label}-${i}`}
                              className="flex-1 border-l border-border pl-1 font-mono text-[9px] font-normal normal-case tracking-normal text-meta"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </Th>
                    <Th className="w-[90px] text-right">Rate</Th>
                    <Th className="w-[60px]" />
                  </Tr>
                </Thead>
                <Tbody>
                  {pageItems.map((machine) => {
                    const product = productsById.get(machine.productId);
                    const subcategory = product ? subcategoriesById.get(product.productSubcategoryId) : undefined;
                    const rental = currentRentalFor(machine.id, rentals);
                    const dep = deploymentFor(machine, rentals);
                    const rentalName = rental
                      ? (rental.renterOrganizationId && renterNames.get(rental.renterOrganizationId)) ||
                        rental.clientSnapshot?.name ||
                        "Renter"
                      : null;
                    const isSelected = selected.has(machine.id);
                    return (
                      <Tr
                        key={machine.id}
                        className={isSelected ? "bg-accent-wash" : machine.status === "retired" ? "bg-surface-sunk" : ""}
                        style={{ height: rowHeight }}
                      >
                        <Td>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggle(machine.id)}
                            aria-label={`Select ${machine.assetCode}`}
                          />
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-cell border border-border-soft bg-on-rent-bg font-mono text-[11px] font-semibold text-on-rent">
                              {tileCodeFor(subcategory?.code)}
                            </div>
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <span className="font-mono text-[13px] font-semibold leading-tight text-ink">{machine.assetCode}</span>
                              <span className="truncate text-[13px] font-medium leading-tight text-ink-strong">
                                {product ? `${product.manufacturer} ${product.name}` : machine.productId}
                              </span>
                              <span className="font-mono text-[11px] leading-none text-meta-light">
                                {machine.registrationNumber}
                              </span>
                            </div>
                          </div>
                        </Td>
                        <Td>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs text-ink-strong">{subcategory?.name ?? "—"}</span>
                            {product?.capacity && (
                              <span className="font-mono text-sm font-semibold text-ink">
                                {product.capacity} <span className="text-[11px] font-normal text-meta">{product.capacityUnit}</span>
                              </span>
                            )}
                          </div>
                        </Td>
                        <Td>
                          <StatusBadge status={machine.status} map={MACHINE_STATUS_MAP} />
                        </Td>
                        <Td>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className={["text-[11px] font-semibold uppercase tracking-wide", deploymentToneClass(dep)].join(" ")}>
                                {DEPLOYMENT_LABEL[dep]}
                              </span>
                            </div>
                            <span className="truncate text-[13px] font-medium text-ink-strong">
                              {dep === "on_rent" && rental ? rentalName : dep === "maintenance" ? "In workshop" : dep === "retired" ? "Off fleet" : "No booking"}
                            </span>
                            {dep === "on_rent" && rental && (
                              <div className="flex items-center gap-1.5 text-[11px]">
                                <span className="font-mono leading-none text-meta">
                                  {formatShortDate(rental.startDate)} → {rental.endDate ? formatShortDate(rental.endDate) : "no end date"}
                                </span>
                                <Link href={`/rentals/${rental.id}`} className="font-medium text-accent-text">
                                  RN-{rental.id.slice(0, 8).toUpperCase()}
                                </Link>
                              </div>
                            )}
                          </div>
                        </Td>
                        <Td>
                          <AvailabilityLane
                            windowStart={windowStart}
                            windowDays={LANE_WINDOW_DAYS}
                            blocks={laneBlocksFor(machine.id, rentals, maintenanceRecords)}
                            gapLabels={gapLabelFor(machine, rentals, windowStart, LANE_WINDOW_DAYS)}
                            today={windowStart}
                          />
                        </Td>
                        <Td className="text-right">
                          {rental ? (
                            <span className="font-mono text-[13px] font-semibold text-ink">
                              ₹{rental.rate.toLocaleString("en-IN")}
                            </span>
                          ) : (
                            <span className="font-mono text-[13px] font-semibold text-meta-light">—</span>
                          )}
                        </Td>
                        <Td>
                          <Link href={`/machines/${machine.id}`} className="text-xs font-medium text-ink-strong hover:text-accent-text">
                            Open
                          </Link>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-3.5 border-t border-border-soft bg-surface-sunk px-3.5 py-2.5">
              <span className="text-xs text-meta">
                Showing {pageItems.length} of {filtered.length} machines
                {deploymentFilter ? ` · ${DEPLOYMENT_LABEL[deploymentFilter].toLowerCase()}` : ""}
              </span>
              <AvailabilityLaneLegend className="ml-auto" />
              <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
            </div>
          </>
        )}
      </div>

      {/* Responsive: below sm, the table becomes stacked cards — see EmptyState above for the
          zero-results case shared by both layouts. */}
      <div className="sm:hidden">
        {filtered.length > 0 && pageItems.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {pageItems.map((machine) => {
              const product = productsById.get(machine.productId);
              const subcategory = product ? subcategoriesById.get(product.productSubcategoryId) : undefined;
              const dep = deploymentFor(machine, rentals);
              const rental = currentRentalFor(machine.id, rentals);
              return (
                <Link
                  key={machine.id}
                  href={`/machines/${machine.id}`}
                  className={["flex flex-col gap-2 rounded-panel border border-border-strong bg-surface p-3", laneBorderClass(dep)].join(" ")}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-9 w-9 flex-none items-center justify-center rounded-cell border border-border-soft bg-on-rent-bg font-mono text-[11px] font-semibold text-on-rent">
                      {tileCodeFor(subcategory?.code)}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] font-semibold text-ink">{machine.assetCode}</span>
                        <span className="font-mono text-[11px] text-meta-light">{machine.registrationNumber}</span>
                      </div>
                      <span className="text-sm font-medium text-ink-strong">
                        {product ? `${product.manufacturer} ${product.name}` : machine.productId}
                      </span>
                    </div>
                    <StatusBadge status={machine.status} map={MACHINE_STATUS_MAP} />
                  </div>
                  <div className="flex items-center gap-2 rounded-cell bg-surface-sunk px-2.5 py-1.5">
                    <span className={["text-[11px] font-semibold uppercase tracking-wide", deploymentToneClass(dep)].join(" ")}>
                      {DEPLOYMENT_LABEL[dep]}
                    </span>
                    {rental && <span className="ml-auto font-mono text-[11px] text-meta">{formatShortDate(rental.startDate)} → {rental.endDate ? formatShortDate(rental.endDate) : "no end date"}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {organizationId && (
        <RegisterMachineDialog
          open={registerOpen}
          onClose={() => setRegisterOpen(false)}
          organizationId={organizationId}
          onRegistered={() => void load(organizationId)}
        />
      )}
    </div>
  );
}

function deploymentToneClass(dep: Deployment): string {
  switch (dep) {
    case "on_rent":
      return "text-on-rent";
    case "available":
      return "text-available";
    case "maintenance":
      return "text-attention";
    case "retired":
      return "text-out-of-service";
  }
}

function laneBorderClass(dep: Deployment): string {
  switch (dep) {
    case "on_rent":
      return "border-l-[3px] border-l-on-rent";
    case "available":
      return "border-l-[3px] border-l-available";
    case "maintenance":
      return "border-l-[3px] border-l-attention-lane-edge";
    case "retired":
      return "border-l-[3px] border-l-out-of-service";
  }
}
