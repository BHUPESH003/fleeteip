"use client";

import type { MaintenanceRecord, MaintenanceType } from "@fleetip/contracts/maintenance";
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
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
import { type FormEvent, useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { formatDate } from "../../../lib/format";
import { legalNextMaintenanceStatuses, MAINTENANCE_STATUS_MAP } from "./shared";

/**
 * There is no stored "blocks availability" boolean on MaintenanceRecord —
 * it's implicit service-side logic. RentalRepository.hasOverlappingMaintenance
 * (apps/api/src/modules/maintenance/infrastructure) blocks new rental
 * creation/activation for a machine whenever a 'scheduled' or 'in_progress'
 * maintenance record's date range overlaps the requested rental period.
 * This mirrors exactly that WHERE clause — a correct derivation of a real
 * rule, not a fabricated flag.
 */
export function blocksAvailability(status: MaintenanceRecord["status"]): boolean {
  return status === "scheduled" || status === "in_progress";
}

const MAINTENANCE_TYPE_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "breakdown", label: "Breakdown" },
  { value: "inspection", label: "Inspection" },
  { value: "other", label: "Other" },
];

/**
 * Shared by Machine detail's Maintenance tab and the standalone Maintenance
 * workspace's per-machine drill-down (apps/web/app/(app)/maintenance) — the
 * only real source is listMaintenanceForMachine (per-machine), there is no
 * org-wide maintenance list endpoint in this branch.
 */
export function MaintenancePanel({ organizationId, machineId }: { organizationId: string; machineId: string }) {
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  async function refresh() {
    try {
      setRecords((await apiClient.listMaintenanceForMachine(organizationId, machineId)) as MaintenanceRecord[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load maintenance records");
    }
  }

  useEffect(() => {
    void refresh();
  }, [organizationId, machineId]);

  async function handleSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const endDate = form.get("endDate");
    const startDate = String(form.get("startDate"));
    if (endDate && String(endDate) < startDate) {
      setError("End date cannot be before the start date");
      return;
    }
    try {
      await apiClient.createMaintenance(organizationId, {
        machineId,
        maintenanceType: String(form.get("maintenanceType")) as MaintenanceType,
        startDate,
        endDate: endDate ? String(endDate) : undefined,
        notes: form.get("notes") ? String(form.get("notes")) : undefined,
      });
      formElement.reset();
      setScheduleOpen(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule maintenance");
    }
  }

  async function handleStatus(maintenanceId: string, status: MaintenanceRecord["status"]) {
    try {
      await apiClient.updateMaintenanceStatus(organizationId, maintenanceId, status);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update maintenance record");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <ErrorState message={error} />}
      <div>
        <Button onClick={() => setScheduleOpen(true)}>Schedule maintenance</Button>
      </div>
      <Card padding={records.length === 0 ? "md" : "none"}>
        {records.length === 0 ? (
          <EmptyState title="No maintenance records" description="Schedule one above." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Type</Th>
                <Th>Period</Th>
                <Th>Status</Th>
                <Th>Availability impact</Th>
                <Th>Notes</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {records.map((record) => (
                <Tr key={record.id}>
                  <Td className="capitalize">{record.maintenanceType}</Td>
                  <Td className="font-mono">
                    {formatDate(record.startDate)} → {record.endDate ? formatDate(record.endDate) : "ongoing"}
                  </Td>
                  <Td>
                    <StatusBadge status={record.status} map={MAINTENANCE_STATUS_MAP} />
                  </Td>
                  <Td>
                    {blocksAvailability(record.status) ? (
                      <span className="text-xs font-medium text-warning" title="New rentals can't be created or activated for this machine during this window">
                        Blocks new rentals
                      </span>
                    ) : (
                      <span className="text-xs text-meta-light">—</span>
                    )}
                  </Td>
                  <Td className="text-meta">{record.notes ?? "—"}</Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                      {legalNextMaintenanceStatuses(record.status).map((next) => (
                        <button
                          key={next}
                          onClick={() => void handleStatus(record.id, next)}
                          className="text-xs font-medium text-accent-text"
                        >
                          Mark {next.replace("_", " ")}
                        </button>
                      ))}
                      <Link
                        href={`/maintenance/${record.id}?machineId=${machineId}`}
                        className="text-xs font-medium text-accent-text"
                      >
                        Detail →
                      </Link>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      <Dialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} title="Schedule maintenance">
        <form onSubmit={handleSchedule} className="flex flex-col gap-4 text-left">
          <Select label="Type" name="maintenanceType" required options={MAINTENANCE_TYPE_OPTIONS} />
          <Input label="Start date" name="startDate" type="date" required />
          <Input label="End date (leave blank if ongoing)" name="endDate" type="date" />
          <Input label="Notes" name="notes" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setScheduleOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Schedule</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
