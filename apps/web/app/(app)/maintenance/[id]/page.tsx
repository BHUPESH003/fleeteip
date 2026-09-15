"use client";

import type { Machine } from "@fleetip/contracts/equipment";
import type { MaintenanceRecord } from "@fleetip/contracts/maintenance";
import { Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from "@fleetip/ui";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiClient } from "../../../../lib/api-client";
import { formatDate } from "../../../../lib/format";
import { useSession } from "../../../../lib/session-context";
import { blocksAvailability } from "../../machines/panels";
import { MAINTENANCE_STATUS_MAP } from "../../machines/shared";

export default function MaintenanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const machineId = searchParams.get("machineId");
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const canView = hasPermission("maintenance.manage");
  // Machine names are enrichment, not the point of this page (maintenance.manage
  // is) — a role without equipment.manage still gets a fully working page, just
  // without asset codes resolved (already handled: `machine?.assetCode ?? "—"`).
  const canListMachines = hasPermission("equipment.manage");

  const [record, setRecord] = useState<MaintenanceRecord | null>(null);
  const [machine, setMachine] = useState<Machine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!organizationId || !machineId) return;
    void (async () => {
      try {
        const [records, machines] = await Promise.all([
          apiClient.listMaintenanceForMachine(organizationId, machineId) as Promise<MaintenanceRecord[]>,
          canListMachines ? (apiClient.listMachines(organizationId) as Promise<Machine[]>) : Promise.resolve([]),
        ]);
        const found = records.find((r) => r.id === id) ?? null;
        if (!found) {
          setNotFound(true);
          return;
        }
        setRecord(found);
        setMachine(machines.find((m) => m.id === machineId) ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load maintenance record");
      }
    })();
  }, [organizationId, machineId, id, canListMachines]);

  if (!organizationId) return <LoadingState label="Loading…" />;

  if (!canView) {
    return (
      <EmptyState
        title="You don't have permission to view maintenance"
        description="Maintenance is managed by the rental company that owns the fleet."
      />
    );
  }

  if (!machineId) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader breadcrumbs={[{ label: "Maintenance", href: "/maintenance" }]} title="Maintenance record" />
        <EmptyState
          title="This link is missing its machine"
          description="A standalone maintenance record can't be looked up by id alone — there's no get-maintenance-by-id endpoint, only per-machine listing. Open it from Maintenance → pick a machine, or from a Machine's Maintenance tab."
        />
      </div>
    );
  }

  if (error) return <ErrorState message={error} />;
  if (notFound) return <EmptyState title="Maintenance record not found" />;
  if (!record) return <LoadingState label="Loading maintenance record…" />;

  const impact = blocksAvailability(record.status);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumbs={[{ label: "Maintenance", href: "/maintenance" }, { label: `${machine?.assetCode ?? "Machine"} · ${record.maintenanceType}` }]}
        title={`Maintenance · ${record.maintenanceType.replace("_", " ")}`}
        description={machine?.assetCode}
        actions={
          machine ? (
            <Link href={`/machines/${machine.id}?tab=maintenance`} className="text-xs font-medium text-accent-text">
              Open machine →
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={record.status} map={MAINTENANCE_STATUS_MAP} />
        {impact && (
          <span
            className="text-xs font-medium text-warning"
            title="New rentals can't be created or activated for this machine during this window"
          >
            Blocks new rentals for this window
          </span>
        )}
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Machine" value={machine?.assetCode ?? "—"} mono />
          <Field label="Type" value={record.maintenanceType} />
          <Field label="Reported / scheduled" value={formatDate(record.startDate)} mono />
          <Field label="Start" value={formatDate(record.startDate)} mono />
          <Field
            label="Completion"
            value={record.status === "completed" && record.endDate ? formatDate(record.endDate) : record.endDate ? `planned ${formatDate(record.endDate)}` : "—"}
            mono
          />
        </div>
        {record.notes && (
          <div className="mt-3 border-t border-border pt-3">
            <Field label="Description" value={record.notes} />
          </div>
        )}
      </Card>

      <p className="text-xs text-meta-light">
        Availability impact is derived, not a stored field: a scheduled or in-progress record
        blocks new rental creation/activation for its window (the real service-side rule) — it
        stops applying the moment the record is marked completed or cancelled.
      </p>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border pb-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-meta">{label}</span>
      <span className={["text-sm text-ink", mono && "font-mono"].filter(Boolean).join(" ")}>{value}</span>
    </div>
  );
}
