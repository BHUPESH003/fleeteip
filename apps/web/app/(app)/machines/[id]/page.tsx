"use client";

import type { Machine } from "@fleetip/contracts/equipment";
import type { MachineUtilization } from "@fleetip/contracts/logsheet";
import type {
  MaintenanceRecord,
  MaintenanceStatus,
  MaintenanceType,
} from "@fleetip/contracts/maintenance";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Select,
} from "@fleetip/ui";
import { useParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { apiClient } from "../../../../lib/api-client";
import { useSession } from "../../../../lib/session-context";

function legalNextMaintenanceStatuses(current: MaintenanceStatus): MaintenanceStatus[] {
  if (current === "scheduled") return ["in_progress", "cancelled"];
  if (current === "in_progress") return ["completed", "cancelled"];
  return [];
}

const STATUS_TONE: Record<MaintenanceStatus, "success" | "warning" | "neutral" | "danger"> = {
  scheduled: "warning",
  in_progress: "warning",
  completed: "success",
  cancelled: "danger",
};

export default function MachineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentMembership } = useSession();
  const organizationId = currentMembership?.organizationId;

  const [machine, setMachine] = useState<Machine | null>(null);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [utilization, setUtilization] = useState<MachineUtilization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!organizationId) return;
    const [machines, maintenance, util] = await Promise.all([
      apiClient.listMachines(organizationId),
      apiClient.listMaintenanceForMachine(organizationId, id),
      apiClient.getMachineUtilization(organizationId, id),
    ]);
    setMachine((machines as Machine[]).find((m) => m.id === id) ?? null);
    setRecords(maintenance as MaintenanceRecord[]);
    setUtilization(util as MachineUtilization);
  }

  useEffect(() => {
    if (!organizationId) return;
    void (async () => {
      try {
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load machine");
      } finally {
        setLoading(false);
      }
    })();
  }, [organizationId, id]);

  async function handleSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const endDate = form.get("endDate");
    try {
      await apiClient.createMaintenance(organizationId!, {
        machineId: id,
        maintenanceType: String(form.get("maintenanceType")) as MaintenanceType,
        startDate: String(form.get("startDate")),
        endDate: endDate ? String(endDate) : undefined,
        notes: form.get("notes") ? String(form.get("notes")) : undefined,
      });
      formElement.reset();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule maintenance");
    }
  }

  async function handleStatus(maintenanceId: string, status: MaintenanceStatus) {
    try {
      await apiClient.updateMaintenanceStatus(organizationId!, maintenanceId, status);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update maintenance");
    }
  }

  if (loading) return <LoadingState label="Loading machine…" />;
  if (error) return <ErrorState message={error} />;
  if (!machine) return null;

  return (
    <>
      <PageHeader
        title={`Machine · ${machine.assetCode}`}
        description={machine.registrationNumber}
      />

      {utilization && (
        <Card className="mt-4">
          <h2 className="mb-3 text-lg font-medium text-gray-900">Utilization</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-gray-500">Operating hrs</p>
              <p className="text-lg font-semibold text-gray-900">
                {utilization.totalOperatingHours}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Idle hrs</p>
              <p className="text-lg font-semibold text-gray-900">{utilization.totalIdleHours}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Logged days</p>
              <p className="text-lg font-semibold text-gray-900">{utilization.loggedDayCount}</p>
            </div>
          </div>
        </Card>
      )}

      <Card className="mt-6">
        <h2 className="mb-4 text-lg font-medium text-gray-900">Schedule maintenance</h2>
        <form onSubmit={handleSchedule} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Type"
              name="maintenanceType"
              required
              options={[
                { value: "scheduled", label: "Scheduled" },
                { value: "breakdown", label: "Breakdown" },
                { value: "inspection", label: "Inspection" },
                { value: "other", label: "Other" },
              ]}
            />
            <Input label="Start date" name="startDate" type="date" required />
            <Input label="End date (leave blank if ongoing)" name="endDate" type="date" />
            <Input label="Notes" name="notes" />
          </div>
          <div>
            <Button type="submit">Schedule</Button>
          </div>
        </form>
      </Card>

      <Card className="mt-6">
        <h2 className="mb-4 text-lg font-medium text-gray-900">Maintenance history</h2>
        {records.length === 0 ? (
          <EmptyState title="No maintenance records" description="Schedule one above." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Period</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-b border-gray-100">
                    <td className="py-2 pr-4 capitalize">{record.maintenanceType}</td>
                    <td className="py-2 pr-4">
                      {record.startDate} → {record.endDate ?? "ongoing"}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge tone={STATUS_TONE[record.status]}>{record.status}</Badge>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex gap-2">
                        {legalNextMaintenanceStatuses(record.status).map((next) => (
                          <button
                            key={next}
                            onClick={() => void handleStatus(record.id, next)}
                            className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            Mark {next}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
