"use client";

import type { Machine } from "@fleetip/contracts/equipment";
import type { MaintenanceRecord, MaintenanceStatus } from "@fleetip/contracts/maintenance";
import {
  Alert,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Select,
  StatusBadge,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@fleetip/ui";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { formatDate } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { blocksAvailability, MaintenancePanel } from "../machines/panels";
import { MAINTENANCE_STATUS_MAP } from "../machines/shared";

const STATUS_OPTIONS: { value: MaintenanceStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

/**
 * Standalone Maintenance workspace. `GET .../maintenance-records` now
 * serves a real org-wide list (single joined query, gated by
 * maintenance.manage) — the table below is the primary, real view. The
 * per-machine picker underneath stays too: it's still where a new
 * maintenance record is scheduled, since the standalone list is read-only.
 */
export default function MaintenancePage() {
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const canView = hasPermission("maintenance.manage");

  const [records, setRecords] = useState<MaintenanceRecord[] | null>(null);
  const [machines, setMachines] = useState<Machine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MaintenanceStatus | "">("");

  useEffect(() => {
    if (!organizationId || !canView) return;
    void (async () => {
      try {
        const [recordList, machineList] = await Promise.all([
          apiClient.listMaintenanceRecords(organizationId) as Promise<MaintenanceRecord[]>,
          apiClient.listMachines(organizationId) as Promise<Machine[]>,
        ]);
        setRecords(recordList);
        setMachines(machineList);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load maintenance records");
      }
    })();
  }, [organizationId, canView]);

  const machinesById = useMemo(() => new Map((machines ?? []).map((m) => [m.id, m])), [machines]);

  const filteredRecords = useMemo(() => {
    if (!records) return [];
    const q = search.trim().toLowerCase();
    return records.filter((record) => {
      if (statusFilter && record.status !== statusFilter) return false;
      if (!q) return true;
      const machine = machinesById.get(record.machineId);
      const haystack = [machine?.assetCode, record.notes].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [records, machinesById, search, statusFilter]);

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

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Maintenance"
        description="Scheduled service and breakdowns across the fleet."
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
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as MaintenanceStatus | "")}
          options={STATUS_OPTIONS}
        />
      </div>

      <Table>
        <Thead>
          <Tr>
            <Th>Machine</Th>
            <Th>Type</Th>
            <Th>Scheduled date</Th>
            <Th>Status</Th>
            <Th>Availability impact</Th>
            <Th>Completion</Th>
          </Tr>
        </Thead>
        <Tbody>
          {filteredRecords.length === 0 ? (
            <Tr>
              <Td colSpan={6} className="bg-surface-sunk py-8">
                <EmptyState
                  title="No maintenance records"
                  description={
                    records.length === 0
                      ? "No maintenance has been scheduled yet across the fleet."
                      : "No records match this filter."
                  }
                />
              </Td>
            </Tr>
          ) : (
            filteredRecords.map((record) => {
              const machine = machinesById.get(record.machineId);
              return (
                <Tr key={record.id}>
                  <Td className="font-mono">
                    <Link
                      href={`/maintenance/${record.id}?machineId=${record.machineId}`}
                      className="font-medium text-accent-text"
                    >
                      {machine?.assetCode ?? "—"}
                    </Link>
                  </Td>
                  <Td className="capitalize">{record.maintenanceType}</Td>
                  <Td className="font-mono">{formatDate(record.startDate)}</Td>
                  <Td>
                    <StatusBadge status={record.status} map={MAINTENANCE_STATUS_MAP} />
                  </Td>
                  <Td>
                    {blocksAvailability(record.status) ? (
                      <span
                        className="text-xs font-medium text-warning"
                        title="New rentals can't be created or activated for this machine during this window"
                      >
                        Blocks new rentals
                      </span>
                    ) : (
                      <span className="text-xs text-meta-light">—</span>
                    )}
                  </Td>
                  <Td className="font-mono">{record.endDate ? formatDate(record.endDate) : "—"}</Td>
                </Tr>
              );
            })
          )}
        </Tbody>
      </Table>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-ink">Schedule a machine&apos;s maintenance</h2>
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
            <Link href={`/machines/${selectedMachine.id}?tab=maintenance`} className="font-medium underline">
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
