"use client";

import type { Machine } from "@fleetip/contracts/equipment";
import {
  Alert,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Select,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@fleetip/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { useSession } from "../../../lib/session-context";
import { MaintenancePanel } from "../machines/panels";

/**
 * Standalone Maintenance workspace. No org-wide maintenance list endpoint
 * exists (apps/api only exposes listMaintenanceForMachine, per-machine) —
 * the table below stays an honest not-yet-available state; the real,
 * working path is the per-machine drill-down, reusing the exact
 * MaintenancePanel already wired up on Machine detail.
 */
export default function MaintenancePage() {
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const canView = hasPermission("maintenance.manage");

  const [machines, setMachines] = useState<Machine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedMachineId, setSelectedMachineId] = useState("");

  useEffect(() => {
    if (!organizationId || !canView) return;
    void (async () => {
      try {
        setMachines((await apiClient.listMachines(organizationId)) as Machine[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load machines");
      }
    })();
  }, [organizationId, canView]);

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
  if (!machines) return <LoadingState label="Loading maintenance…" />;

  const selectedMachine = machines.find((m) => m.id === selectedMachineId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Maintenance"
        description="Scheduled service and breakdowns across the fleet."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Machine, issue…" className="w-64" disabled title="Not available yet — see below" />
        <Select className="w-40" disabled options={[{ value: "", label: "All statuses" }]} />
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
          <Tr>
            <Td colSpan={6} className="bg-surface-sunk py-8">
              <EmptyState
                title="Fleet-wide maintenance list isn't available yet"
                description="apps/api has no org-wide maintenance endpoint today (only per-machine). Recorded in the frontend/backend gap report. Pick a machine below to view or schedule its maintenance now."
              />
            </Td>
          </Tr>
        </Tbody>
      </Table>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-ink">Open a machine&apos;s maintenance</h2>
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
