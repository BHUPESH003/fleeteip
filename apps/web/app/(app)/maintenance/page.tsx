"use client";

import type { Machine } from "@fleetip/contracts/equipment";
import type { MaintenanceRecord, MaintenanceStatus, MaintenanceType } from "@fleetip/contracts/maintenance";
import type { Rental } from "@fleetip/contracts/rental";
import {
  Alert,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Select,
} from "@fleetip/ui";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { formatCurrencyINR, formatDateRange } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { blocksAvailability, MaintenancePanel } from "../machines/panels";
import { legalNextMaintenanceStatuses, MAINTENANCE_STATUS_MAP } from "../machines/shared";

const TYPE_OPTIONS: { value: MaintenanceType | ""; label: string }[] = [
  { value: "", label: "All types" },
  { value: "scheduled", label: "Scheduled" },
  { value: "breakdown", label: "Breakdown" },
  { value: "inspection", label: "Inspection" },
  { value: "other", label: "Other" },
];

interface Column {
  status: MaintenanceStatus;
  label: string;
  toneClass: string;
  washClass: string;
  edgeClass: string;
}

const COLUMNS: Column[] = [
  { status: "scheduled", label: "Scheduled", toneClass: "text-attention", washClass: "bg-accent-wash/40", edgeClass: "border-t-attention-lane-edge" },
  { status: "in_progress", label: "In progress", toneClass: "text-destructive", washClass: "bg-destructive-bg/50", edgeClass: "border-t-destructive-lane-edge" },
  { status: "completed", label: "Completed", toneClass: "text-available", washClass: "bg-available-bg/40", edgeClass: "border-t-available" },
  { status: "cancelled", label: "Cancelled", toneClass: "text-out-of-service", washClass: "bg-out-of-service-bg/40", edgeClass: "border-t-border-stronger" },
];

const CARDS_PER_COLUMN = 6;

/**
 * Standalone Maintenance workspace — a workshop board, not a list.
 * Columns are the four real `maintenanceStatus` values.
 * `GET .../maintenance-records` serves a real org-wide list (confirmed
 * against the actual Fastify route + MaintenanceService.listByOrganization
 * before building this), gated by maintenance.manage — the board below is
 * the primary, real view. The per-machine picker underneath stays too:
 * it's still where a new maintenance record is scheduled (createMaintenance
 * is per-machine only, and moving a card here would need two separate
 * writes — see the Rule callout below).
 */
export default function MaintenancePage() {
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const canView = hasPermission("maintenance.manage");
  // Machine names/rates are enrichment, not the point of this page
  // (maintenance.manage is) — a role without equipment.manage still gets a
  // fully working board, just without asset codes/rates resolved (already
  // handled: `machine?.assetCode ?? "—"`).
  const canListMachines = hasPermission("equipment.manage");
  const canListRentals = hasPermission("rental.manage");

  const [records, setRecords] = useState<MaintenanceRecord[] | null>(null);
  const [machines, setMachines] = useState<Machine[] | null>(null);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<MaintenanceType | "">("");
  const [expanded, setExpanded] = useState<Set<MaintenanceStatus>>(new Set());

  async function load() {
    if (!organizationId || !canView) return;
    try {
      const [recordList, machineList, rentalList] = await Promise.all([
        apiClient.listMaintenanceRecords(organizationId) as Promise<MaintenanceRecord[]>,
        canListMachines ? (apiClient.listMachines(organizationId) as Promise<Machine[]>) : Promise.resolve([]),
        canListRentals ? (apiClient.listRentals(organizationId) as Promise<Rental[]>) : Promise.resolve([]),
      ]);
      setRecords(recordList);
      setMachines(machineList);
      setRentals(rentalList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load maintenance records");
    }
  }

  useEffect(() => {
    void load();
  }, [organizationId, canView, canListMachines, canListRentals]);

  const machinesById = useMemo(() => new Map((machines ?? []).map((m) => [m.id, m])), [machines]);

  const filteredRecords = useMemo(() => {
    if (!records) return [];
    const q = search.trim().toLowerCase();
    return records.filter((record) => {
      if (typeFilter && record.maintenanceType !== typeFilter) return false;
      if (!q) return true;
      const machine = machinesById.get(record.machineId);
      const haystack = [machine?.assetCode, record.notes].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [records, machinesById, search, typeFilter]);

  async function handleStatusChange(record: MaintenanceRecord, next: MaintenanceStatus) {
    if (!organizationId) return;
    try {
      await apiClient.updateMaintenanceStatus(organizationId, record.id, next);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update maintenance record");
    }
  }

  if (!organizationId) return <LoadingState label="Loading…" />;

  if (!canView) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Maintenance" />
        <EmptyState
          title="You don't have permission to view maintenance"
          description="Maintenance is managed by the rental company that owns the fleet."
        />
      </div>
    );
  }

  if (error) return <ErrorState message={error} />;
  if (!records || !machines) return <LoadingState label="Loading maintenance…" />;

  const selectedMachine = machines.find((m) => m.id === selectedMachineId) ?? null;
  const inProgressMachineIds = new Set(filteredRecords.filter((r) => r.status === "in_progress").map((r) => r.machineId));
  const offFleetToday = inProgressMachineIds.size;
  // "Rate not earning" — each in-progress-maintenance machine's most recent
  // known rate (from its rental history), summed. A real derivation from
  // data already on hand, not a fabricated aggregate — 0/omitted entirely
  // when the caller lacks rental.manage (canListRentals false, rentals []).
  const dailyRateNotEarning = [...inProgressMachineIds].reduce((sum, machineId) => {
    const lastRental = [...rentals]
      .filter((r) => r.machineId === machineId && r.rateUnit === "day")
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    return sum + (lastRental?.rate ?? 0);
  }, 0);

  function columnRecords(status: MaintenanceStatus) {
    return filteredRecords.filter((r) => r.status === status).sort((a, b) => b.startDate.localeCompare(a.startDate));
  }

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <PageHeader
        title="Maintenance"
        description={
          offFleetToday > 0
            ? `${offFleetToday} ${offFleetToday === 1 ? "machine" : "machines"} off the fleet today${
                dailyRateNotEarning > 0 ? ` · ${formatCurrencyINR(dailyRateNotEarning)} of daily rate not earning` : ""
              }`
            : "Scheduled service and breakdowns across the fleet."
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Machine, issue…"
          className="w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          className="w-40"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as MaintenanceType | "")}
          options={TYPE_OPTIONS}
        />
        {(search || typeFilter) && (
          <button
            type="button"
            className="text-xs font-medium text-accent-text"
            onClick={() => {
              setSearch("");
              setTypeFilter("");
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {filteredRecords.length === 0 ? (
        <EmptyState
          title="No maintenance records"
          description={
            records.length === 0
              ? "No maintenance has been scheduled yet across the fleet."
              : "No records match this filter."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COLUMNS.map((column) => {
            const columnItems = columnRecords(column.status);
            const isExpanded = expanded.has(column.status);
            const visible = isExpanded ? columnItems : columnItems.slice(0, CARDS_PER_COLUMN);
            const hiddenCount = columnItems.length - visible.length;
            return (
              <div
                key={column.status}
                className={["flex flex-col gap-2.5 rounded-panel border border-border-strong border-t-[3px] p-3", column.washClass, column.edgeClass].join(" ")}
              >
                <div className="flex items-baseline gap-2">
                  <span className={["text-[11px] font-semibold uppercase tracking-wide", column.toneClass].join(" ")}>
                    {column.label}
                  </span>
                  <span className={["font-mono text-[13px] font-semibold", column.toneClass].join(" ")}>{columnItems.length}</span>
                  <span className="ml-auto font-mono text-[10px] text-meta">{column.status}</span>
                </div>

                {columnItems.length === 0 ? (
                  <p className="rounded-cell border border-dashed border-border-strong bg-surface/60 px-3 py-4 text-center text-xs text-meta">
                    Nothing here
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {visible.map((record) => {
                      const machine = machinesById.get(record.machineId);
                      const nextStatuses = legalNextMaintenanceStatuses(record.status);
                      return (
                        <div
                          key={record.id}
                          className={["flex flex-col gap-2 rounded-control border border-border-soft bg-surface p-3", statusEdgeClass(record.status)].join(" ")}
                          style={{ borderLeftWidth: 3 }}
                        >
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/maintenance/${record.id}?machineId=${record.machineId}`}
                              className="font-mono text-xs font-semibold text-ink hover:text-accent-text"
                            >
                              {machine?.assetCode ?? "—"}
                            </Link>
                            <span className="ml-auto text-[10px] font-medium uppercase tracking-wide text-meta">
                              {record.maintenanceType}
                            </span>
                          </div>
                          {machine && (
                            <span className="text-[13px] font-medium text-ink-strong">{machineLabel(machine)}</span>
                          )}
                          {record.notes && <p className="truncate text-xs text-ink-muted">{record.notes}</p>}
                          <div className="flex items-center gap-2 border-t border-border pt-2">
                            <span className="font-mono text-[11px] text-meta">{formatDateRange(record.startDate, record.endDate)}</span>
                            {blocksAvailability(record.status) && (
                              <span
                                className="ml-auto text-[11px] font-medium text-attention"
                                title="New rentals can't be created or activated for this machine during this window"
                              >
                                Blocks new rentals
                              </span>
                            )}
                          </div>
                          {nextStatuses.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
                              {nextStatuses.map((next) => (
                                <button
                                  key={next}
                                  type="button"
                                  onClick={() => void handleStatusChange(record, next)}
                                  className="rounded-xs border border-border-strong bg-surface-sunk px-2 py-1 text-[11px] font-medium text-ink-strong hover:bg-surface-hover"
                                >
                                  Move to {MAINTENANCE_STATUS_MAP[next]?.label ?? next}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {hiddenCount > 0 && (
                  <button
                    type="button"
                    className="text-left text-xs font-medium text-accent-text"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        next.add(column.status);
                        return next;
                      })
                    }
                  >
                    {hiddenCount} more {column.label.toLowerCase()}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Alert tone="info">
        <span className="font-semibold">Rule:</span> the buttons above only change this maintenance
        record&apos;s own status (<code className="rounded-xs bg-surface-sunk px-1 py-0.5 font-mono text-[11px]">maintenanceStatus</code>). They do{" "}
        <span className="font-semibold">not</span> write the machine&apos;s own{" "}
        <code className="rounded-xs bg-surface-sunk px-1 py-0.5 font-mono text-[11px]">status</code> field — that&apos;s a
        separate action on the Machines page (&ldquo;Mark under maintenance&rdquo; / &ldquo;Mark
        active&rdquo;), so the two can drift if only one is updated.
      </Alert>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-ink">Schedule a machine&apos;s maintenance</h2>
        <p className="mb-3 text-xs text-meta">
          Creating and status-updates write per machine — there is no batch/board write endpoint.
          Pick a machine to schedule a new record or manage its existing ones in detail.
        </p>
        <Select
          className="max-w-sm"
          value={selectedMachineId}
          onChange={(e) => setSelectedMachineId(e.target.value)}
          options={[
            { value: "", label: "Select a machine…" },
            ...machines.map((m) => ({ value: m.id, label: m.assetCode })),
          ]}
        />
      </Card>

      {selectedMachine && (
        <div className="flex flex-col gap-3">
          <Alert tone="info">
            Showing maintenance for{" "}
            <Link
              href={`/machines/${selectedMachine.id}?tab=maintenance`}
              className="font-medium underline"
            >
              {selectedMachine.assetCode}
            </Link>{" "}
            — open the full machine for rentals, logsheets and identity.
          </Alert>
          <MaintenancePanel organizationId={organizationId} machineId={selectedMachine.id} />
        </div>
      )}
    </div>
  );
}

function machineLabel(machine: Machine): string {
  return machine.registrationNumber ? `${machine.assetCode} · ${machine.registrationNumber}` : machine.assetCode;
}

function statusEdgeClass(status: MaintenanceStatus): string {
  switch (status) {
    case "scheduled":
      return "border-l-attention-lane-edge";
    case "in_progress":
      return "border-l-destructive-lane-edge";
    case "completed":
      return "border-l-available";
    case "cancelled":
      return "border-l-border-stronger";
  }
}
