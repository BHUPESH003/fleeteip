"use client";

import type { Rental } from "@fleetip/contracts/rental";
import type { TransportRecord, TransportStatus } from "@fleetip/contracts/transport";
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from "@fleetip/ui";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiClient } from "../../../../lib/api-client";
import { formatDate } from "../../../../lib/format";
import { useSession } from "../../../../lib/session-context";
import { legalNextTransportStatuses, TRANSPORT_STATUS_MAP } from "../../rentals/shared";

// The only states this leg can really be in — matches transportStatusSchema
// exactly (planned/dispatched/delivered), plus the terminal cancelled state
// shown separately. No "assigned"/"pickup"/"in transit" step is fabricated.
const PROGRESSION: TransportStatus[] = ["planned", "dispatched", "delivered"];

export default function TransportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const rentalId = searchParams.get("rentalId");
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const canView = hasPermission("transport.manage");

  const [record, setRecord] = useState<TransportRecord | null>(null);
  const [rental, setRental] = useState<Rental | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  async function load() {
    if (!organizationId || !rentalId) return;
    try {
      const [records, rentalDetail] = await Promise.all([
        apiClient.listTransportForRental(organizationId, rentalId) as Promise<TransportRecord[]>,
        apiClient.getRental(organizationId, rentalId) as Promise<Rental>,
      ]);
      const found = records.find((r) => r.id === id) ?? null;
      if (!found) {
        setNotFound(true);
        return;
      }
      setRecord(found);
      setRental(rentalDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transport record");
    }
  }

  useEffect(() => {
    void load();
  }, [organizationId, rentalId, id]);

  async function handleStatus(status: TransportStatus) {
    if (!organizationId || !rentalId || !record) return;
    try {
      await apiClient.updateTransport(organizationId, rentalId, record.leg, {
        status,
        ...(status === "delivered" ? { actualDate: new Date().toISOString().slice(0, 10) } : {}),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update transport record");
    }
  }

  if (!organizationId) return <LoadingState label="Loading…" />;

  if (!canView) {
    return (
      <EmptyState
        title="You don't have permission to view transport"
        description="Transport is managed by the rental company side of a rental."
      />
    );
  }

  if (!rentalId) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader breadcrumbs={[{ label: "Transport", href: "/transport" }]} title="Transport record" />
        <EmptyState
          title="This link is missing its rental"
          description="A standalone transport record can't be looked up by id alone — there's no get-transport-by-id endpoint, only per-rental listing. Open it from Transport → pick a rental, or from a Rental's Transport tab."
        />
      </div>
    );
  }

  if (error) return <ErrorState message={error} />;
  if (notFound) {
    return (
      <EmptyState
        title="Transport record not found"
        description="It may have been for a different rental, or doesn't exist."
      />
    );
  }
  if (!record || !rental) return <LoadingState label="Loading transport record…" />;

  const isCancelled = record.status === "cancelled";
  const currentIndex = PROGRESSION.indexOf(record.status);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumbs={[{ label: "Transport", href: "/transport" }, { label: `${record.leg} · ${rental.machineAssetCode ?? ""}` }]}
        title={`Transport · ${record.leg === "mobilization" ? "Mobilization" : "Demobilization"}`}
        description={`Rental ${rental.machineAssetCode ?? rental.machineId.slice(0, 8)} · ${rental.clientSnapshot?.name ?? "—"}`}
        actions={
          <Link href={`/rentals/${rental.id}?tab=transport`} className="text-xs font-medium text-accent-text">
            Open rental →
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={record.status} map={TRANSPORT_STATUS_MAP} />
        {legalNextTransportStatuses(record.status).map((next) => (
          <Button key={next} size="sm" variant="secondary" onClick={() => void handleStatus(next)}>
            Mark {next}
          </Button>
        ))}
      </div>

      {!isCancelled && (
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-ink">Progress</h2>
          <div className="flex items-center">
            {PROGRESSION.map((step, index) => (
              <div key={step} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={[
                      "flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold",
                      index <= currentIndex
                        ? "border-success bg-success text-white"
                        : "border-border-strong bg-surface text-meta",
                    ].join(" ")}
                  >
                    {index < currentIndex ? "✓" : index + 1}
                  </div>
                  <span className="text-xs font-medium capitalize text-ink-muted">{step}</span>
                </div>
                {index < PROGRESSION.length - 1 && (
                  <div className={["mx-2 h-0.5 flex-1", index < currentIndex ? "bg-success" : "bg-border"].join(" ")} />
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Machine" value={rental.machineAssetCode ?? "—"} mono />
          <Field label="Rental" value={rental.clientSnapshot?.name ?? "—"} />
          <Field label="Leg" value={record.leg} />
          <Field label="Pickup" value={record.pickupLocation ?? "—"} />
          <Field label="Destination" value={record.destination ?? "—"} />
          <Field label="Scheduled" value={record.plannedDate ? formatDate(record.plannedDate) : "—"} mono />
          <Field label="Actual date" value={record.actualDate ? formatDate(record.actualDate) : "—"} mono />
          <Field label="Charges" value={record.charges != null ? `₹${record.charges.toLocaleString("en-IN")}` : "—"} mono />
        </div>
        {(record.transportDetails || record.notes) && (
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2">
            {record.transportDetails && <Field label="Transport details" value={record.transportDetails} />}
            {record.notes && <Field label="Notes" value={record.notes} />}
          </div>
        )}
      </Card>
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
