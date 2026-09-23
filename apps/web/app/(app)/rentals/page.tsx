"use client";

import type { Product, ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
import type { Rental, RentalStatus } from "@fleetip/contracts/rental";
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
import { daysBetween, formatCurrencyINR, formatDateRange, todayIsoDate } from "../../../lib/format";
import { tileCodeFor } from "../machines/lane";
import { useSession } from "../../../lib/session-context";
import { CreateRentalDialog } from "./CreateRentalDialog";
import { RENTAL_STATUS_MAP } from "./shared";

type Filter = "all" | RentalStatus;

const LANE_WINDOW_DAYS = 90;

const STATUS_TONE: Record<RentalStatus, "on-rent" | "available" | "attention" | "out-of-service"> = {
  confirmed: "attention",
  active: "on-rent",
  off_rent: "attention",
  completed: "available",
  cancelled: "out-of-service",
};

interface Enrichment {
  machinesById: Map<string, Machine>;
  productsById: Map<string, Product>;
  subcategoriesById: Map<string, ProductSubcategory>;
}

export default function RentalsPage() {
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  const isRenter = organizationType === "renter";
  // Machine/product identity (tile + class&capacity) is enrichment, not the
  // point of this page (rental.manage/rental.respond is) — without
  // equipment.manage the machine cell falls back to the asset code alone,
  // same graceful-omission pattern used on Machines/Machine detail.
  const canListMachines = hasPermission("equipment.manage");

  const [rentals, setRentals] = useState<Rental[] | null>(null);
  const [enrichment, setEnrichment] = useState<Enrichment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const today = todayIsoDate();

  async function load(orgId: string) {
    try {
      const rentalList = (await apiClient.listRentals(orgId)) as Rental[];
      setRentals(rentalList);
      if (canListMachines) {
        const [machines, categories] = await Promise.all([
          apiClient.listMachines(orgId) as Promise<Machine[]>,
          apiClient.listProductCategories() as Promise<ProductCategory[]>,
        ]);
        const products = (await apiClient.listProducts()) as Product[];
        const subcategoryLists = await Promise.all(
          categories.map((c) => apiClient.listProductSubcategories(c.id) as Promise<ProductSubcategory[]>),
        );
        setEnrichment({
          machinesById: new Map(machines.map((m) => [m.id, m])),
          productsById: new Map(products.map((p) => [p.id, p])),
          subcategoriesById: new Map(subcategoryLists.flat().map((s) => [s.id, s])),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rentals");
    }
  }

  useEffect(() => {
    if (organizationId) void load(organizationId);
  }, [organizationId, canListMachines]);

  const filtered = useMemo(() => {
    if (!rentals) return [];
    const q = search.trim().toLowerCase();
    return rentals.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      const customer = isRenter
        ? (r.rentalCompanyOrganizationName ?? "")
        : (r.clientSnapshot?.name ?? "");
      const haystack = [r.machineAssetCode, customer, r.projectName].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [rentals, filter, search, isRenter]);

  if (!organizationId || !organizationType) return <LoadingState label="Loading…" />;
  if (error) return <ErrorState message={error} />;
  if (!rentals) return <LoadingState label="Loading rentals…" />;

  const byStatus = (status: RentalStatus) => rentals.filter((r) => r.status === status);
  const confirmed = byStatus("confirmed");
  const active = byStatus("active");
  const offRent = byStatus("off_rent");
  const completed = byStatus("completed");
  const cancelled = byStatus("cancelled");

  const committedThisMonth = active.reduce((sum, r) => sum + r.rate, 0);
  const mobilizingSoon = confirmed.filter((r) => daysBetween(today, r.startDate) <= 30 && daysBetween(today, r.startDate) >= 0).length;
  const endingSoon = active.filter((r) => r.endDate && daysBetween(today, r.endDate) <= 14 && daysBetween(today, r.endDate) >= 0).length;
  const openEndedWithNotice = active.filter((r) => !r.endDate && r.noticePeriodDays).length;
  const offRentUnsettled = offRent.length; // off_rent means dehire is pending by definition — no separate "settled" flag exists

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <PageHeader
        title="Rentals"
        description={`${rentals.length} total${isRenter ? "" : ` across ${new Set(rentals.map((r) => r.machineId)).size} machines`}`}
        actions={!isRenter ? <Button onClick={() => setCreateOpen(true)}>Create rental</Button> : undefined}
      />

      <AllocationBar
        active={filter === "all" ? null : filter}
        onSelect={(key) => setFilter((key as RentalStatus) ?? "all")}
        segments={
          isRenter
            ? [
                { key: "active", count: active.length, grow: active.length || 1, label: "Active", tone: "on-rent" },
                { key: "off_rent", count: offRent.length, grow: offRent.length || 1, label: "Off-rent", tone: "attention" },
                { key: "completed", count: completed.length, grow: completed.length || 1, label: "Completed", tone: "available" },
              ]
            : [
                {
                  key: "confirmed",
                  count: confirmed.length,
                  grow: confirmed.length || 1,
                  label: "Confirmed",
                  sub: mobilizingSoon > 0 ? `${mobilizingSoon} mobilize this month` : undefined,
                  tone: "attention",
                },
                {
                  key: "active",
                  count: active.length,
                  grow: active.length || 1,
                  label: "Active",
                  sub: committedThisMonth > 0 ? `${formatCurrencyINR(committedThisMonth)} committed this month` : undefined,
                  tone: "on-rent",
                },
                {
                  key: "off_rent",
                  count: offRent.length,
                  grow: offRent.length || 1,
                  label: "Off rent",
                  sub: "Awaiting dehire settlement",
                  tone: "attention",
                },
                {
                  key: "completed",
                  count: completed.length,
                  grow: completed.length || 1,
                  label: "Completed",
                  sub: "Closed recently",
                  tone: "available",
                },
                {
                  key: "cancelled",
                  count: cancelled.length,
                  grow: cancelled.length || 1,
                  label: "Cancelled",
                  sub: "Never mobilized",
                  tone: "out-of-service",
                },
              ]
        }
      />

      {!isRenter && (
        <AttentionStrip
          items={[
            {
              key: "ending-soon",
              count: endingSoon,
              text: "rentals end within 14 days — plan the next booking",
              onClick: () => setFilter("active"),
            },
            {
              key: "open-notice",
              count: openEndedWithNotice,
              text: "open-ended rentals with notice periods running",
              onClick: () => setFilter("active"),
            },
            {
              key: "off-rent-unsettled",
              count: offRentUnsettled,
              text: "off rent, dehire not settled",
              onClick: () => setFilter("off_rent"),
            },
          ]}
        />
      )}

      <div className="rounded-panel border border-border-strong bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-border-soft bg-surface-sunk px-3.5 py-2.5">
          <Input
            placeholder="Machine, customer, project…"
            className="w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {filter !== "all" && (
            <button type="button" className="text-xs font-medium text-accent-text" onClick={() => setFilter("all")}>
              Clear filter
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="No rentals match these filters"
            description={isRenter ? "Rentals you're awarded will show up here." : "Create one above to get started."}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] border-collapse text-sm">
                <Thead>
                  <Tr>
                    <Th className="w-[104px]">Rental</Th>
                    <Th className="w-[220px]">Machine</Th>
                    <Th className="min-w-[180px]">{isRenter ? "Rental company & project" : "Customer & project"}</Th>
                    <Th className="w-[150px]">Term</Th>
                    <Th className="w-[200px]">Next 90 days</Th>
                    <Th className="w-[100px] text-right">Rate</Th>
                    <Th className="w-[60px]" />
                  </Tr>
                </Thead>
                <Tbody>
                  {filtered.map((rental) => {
                    const customer = isRenter
                      ? (rental.rentalCompanyOrganizationName ?? "Rental company")
                      : (rental.clientSnapshot?.name ?? `Renter ${rental.renterOrganizationId?.slice(0, 8) ?? ""}…`);
                    const machine = enrichment?.machinesById.get(rental.machineId);
                    const product = machine ? enrichment?.productsById.get(machine.productId) : undefined;
                    const subcategory = product ? enrichment?.subcategoriesById.get(product.productSubcategoryId) : undefined;
                    const note = rentalNote(rental, today);
                    return (
                      <Tr key={rental.id}>
                        <Td>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-xs font-semibold text-ink">RN-{rental.id.slice(0, 8).toUpperCase()}</span>
                            <span className={["text-[10px] font-semibold uppercase tracking-wide", statusToneClass(rental.status)].join(" ")}>
                              {RENTAL_STATUS_MAP[rental.status]?.label ?? rental.status}
                            </span>
                          </div>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2 pr-3">
                            <div className="flex h-8 w-8 flex-none items-center justify-center rounded-cell border border-border-soft bg-on-rent-bg font-mono text-[10px] font-semibold text-on-rent">
                              {tileCodeFor(subcategory?.code)}
                            </div>
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <span className="font-mono text-xs font-medium text-ink">{rental.machineAssetCode ?? machine?.assetCode ?? rental.machineId.slice(0, 8)}</span>
                              <span className="truncate text-xs text-meta">
                                {product ? `${product.manufacturer} ${product.name}` : ""}
                              </span>
                            </div>
                          </div>
                        </Td>
                        <Td>
                          <div className="flex min-w-0 flex-col gap-0.5 pr-3.5">
                            <span className="truncate text-[13px] font-medium text-ink-strong">{customer}</span>
                            <span className="truncate text-xs text-meta">{rental.projectName ?? "—"}</span>
                          </div>
                        </Td>
                        <Td>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-[11px] text-ink-strong">{formatDateRange(rental.startDate, rental.endDate)}</span>
                            {note && <span className={["text-[11px]", note.warn ? "text-attention" : "text-meta"].join(" ")}>{note.text}</span>}
                          </div>
                        </Td>
                        <Td>
                          <AvailabilityLane
                            windowStart={today}
                            windowDays={LANE_WINDOW_DAYS}
                            blocks={[
                              {
                                from: rental.startDate,
                                to: rental.endDate,
                                kind: rental.status === "active" ? "active" : rental.status === "confirmed" ? "confirmed" : "past",
                              },
                            ]}
                            today={today}
                            height={24}
                          />
                        </Td>
                        <Td className="text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="font-mono text-[13px] font-semibold text-ink">{formatCurrencyINR(rental.rate)}</span>
                            <span className="text-[10px] text-meta">per {rental.rateUnit}</span>
                          </div>
                        </Td>
                        <Td>
                          <Link href={`/rentals/${rental.id}`} className="text-xs font-medium text-ink-strong hover:text-accent-text">
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
                Showing {filtered.length} of {rentals.length}
                {filter !== "all" ? ` · ${RENTAL_STATUS_MAP[filter]?.label?.toLowerCase() ?? filter}` : " · grouped by status, then end date"}
              </span>
              {!isRenter && (
                <span className="ml-auto text-[11px] leading-tight text-meta">
                  Off rent means the machine has stopped earning but the rental is not closed — dehire terms still apply
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="hidden sm:block">
        <AvailabilityLaneLegend
          items={[
            { label: "On rent", kind: "active" },
            { label: "Confirmed ahead", kind: "confirmed" },
            { label: "Past / closed", kind: "past" },
          ]}
        />
      </div>

      {/* Responsive: below sm, the table becomes stacked cards. */}
      <div className="sm:hidden">
        {filtered.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {filtered.map((rental) => {
              const customer = isRenter
                ? (rental.rentalCompanyOrganizationName ?? "Rental company")
                : (rental.clientSnapshot?.name ?? `Renter ${rental.renterOrganizationId?.slice(0, 8) ?? ""}…`);
              return (
                <Link
                  key={rental.id}
                  href={`/rentals/${rental.id}`}
                  className={["flex flex-col gap-2 rounded-panel border border-border-strong bg-surface p-3 border-l-[3px]", statusBorderClass(rental.status)].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-ink">RN-{rental.id.slice(0, 8).toUpperCase()}</span>
                    <StatusBadge status={rental.status} map={RENTAL_STATUS_MAP} />
                  </div>
                  <span className="font-mono text-sm font-medium text-ink-strong">{rental.machineAssetCode ?? rental.machineId.slice(0, 8)}</span>
                  <span className="text-sm text-ink-muted">{customer}</span>
                  <div className="flex items-center justify-between text-xs text-meta">
                    <span className="font-mono">{formatDateRange(rental.startDate, rental.endDate)}</span>
                    <span className="font-mono font-semibold text-ink">{formatCurrencyINR(rental.rate)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {!isRenter && (
        <CreateRentalDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          organizationId={organizationId}
          onCreated={() => void load(organizationId)}
        />
      )}
    </div>
  );
}

function statusToneClass(status: RentalStatus): string {
  const tone = STATUS_TONE[status];
  switch (tone) {
    case "on-rent":
      return "text-on-rent";
    case "available":
      return "text-available";
    case "attention":
      return "text-attention";
    case "out-of-service":
      return "text-out-of-service";
  }
}

function statusBorderClass(status: RentalStatus): string {
  const tone = STATUS_TONE[status];
  switch (tone) {
    case "on-rent":
      return "border-l-on-rent";
    case "available":
      return "border-l-available";
    case "attention":
      return "border-l-attention-lane-edge";
    case "out-of-service":
      return "border-l-out-of-service";
  }
}

function rentalNote(rental: Rental, today: string): { text: string; warn: boolean } | null {
  if (rental.status === "active") {
    if (rental.endDate) {
      const days = daysBetween(today, rental.endDate);
      if (days >= 0 && days <= 30) return { text: `ends in ${days} days`, warn: days <= 14 };
    } else if (rental.noticePeriodDays) {
      return { text: `open-ended — ${rental.noticePeriodDays} day notice`, warn: false };
    }
  }
  if (rental.status === "confirmed") {
    const days = daysBetween(today, rental.startDate);
    if (days >= 0) return { text: `mobilization due in ${days} days`, warn: days <= 7 };
  }
  if (rental.status === "off_rent") {
    return { text: "dehire pending", warn: true };
  }
  return null;
}
