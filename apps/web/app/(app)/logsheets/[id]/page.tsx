"use client";

import type { Logsheet } from "@fleetip/contracts/logsheet";
import type { Rental } from "@fleetip/contracts/rental";
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader } from "@fleetip/ui";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiClient } from "../../../../lib/api-client";
import { formatDate } from "../../../../lib/format";
import { useSession } from "../../../../lib/session-context";

export default function LogsheetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const rentalId = searchParams.get("rentalId");
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  const canView = hasPermission("logsheet.manage");
  // The rental is enrichment for this logsheet's header, not the point of
  // this page (logsheet.manage is) — a custom role without the rental
  // permission still gets a working page, just with rental fields as "—".
  const canGetRental =
    organizationType === "renter" ? hasPermission("rental.respond") : hasPermission("rental.manage");

  const [logsheet, setLogsheet] = useState<Logsheet | null>(null);
  const [rental, setRental] = useState<Rental | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!organizationId || !rentalId) return;
    void (async () => {
      try {
        const [logsheets, rentalDetail] = await Promise.all([
          apiClient.listLogsheetsForRental(organizationId, rentalId) as Promise<Logsheet[]>,
          canGetRental
            ? (apiClient.getRental(organizationId, rentalId) as Promise<Rental | null>)
            : Promise.resolve(null),
        ]);
        const found = logsheets.find((l) => l.id === id) ?? null;
        if (!found) {
          setNotFound(true);
          return;
        }
        setLogsheet(found);
        setRental(rentalDetail);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load logsheet");
      }
    })();
  }, [organizationId, rentalId, id, canGetRental]);

  if (!organizationId) return <LoadingState label="Loading…" />;

  if (!canView) {
    return (
      <EmptyState
        title="You don't have permission to view logsheets"
        description="Logsheets are recorded by the rental company side of a rental."
      />
    );
  }

  if (!rentalId) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader breadcrumbs={[{ label: "Logsheets", href: "/logsheets" }]} title="Logsheet" />
        <EmptyState
          title="This link is missing its rental"
          description="A standalone logsheet can't be looked up by id alone — there's no get-logsheet-by-id endpoint, only per-rental listing. Open it from Logsheets → pick a rental, or from a Rental's Logsheets tab."
        />
      </div>
    );
  }

  if (error) return <ErrorState message={error} />;
  if (notFound) return <EmptyState title="Logsheet not found" />;
  if (!logsheet) return <LoadingState label="Loading logsheet…" />;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumbs={[{ label: "Logsheets", href: "/logsheets" }, { label: formatDate(logsheet.logDate) }]}
        title={`Logsheet · ${formatDate(logsheet.logDate)}`}
        description={
          rental
            ? `Rental ${rental.machineAssetCode ?? rental.machineId.slice(0, 8)} · ${rental.clientSnapshot?.name ?? "—"}`
            : "Rental details unavailable"
        }
      />

      <div>
        <Badge tone={logsheet.customerConfirmed ? "success" : "neutral"}>
          {logsheet.customerConfirmed ? "Customer confirmed" : "Not yet confirmed by customer"}
        </Badge>
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Machine" value={rental?.machineAssetCode ?? "—"} mono />
          <Field label="Rental" value={rental?.clientSnapshot?.name ?? "—"} />
          <Field label="Date" value={formatDate(logsheet.logDate)} mono />
          <Field label="Shift" value={logsheet.shift ?? "—"} />
          <Field label="Operating hours" value={logsheet.operatingHours != null ? String(logsheet.operatingHours) : "—"} mono />
          <Field label="Idle hours" value={logsheet.idleHours != null ? String(logsheet.idleHours) : "—"} mono />
          <Field label="Overtime hours" value={logsheet.overtimeHours != null ? String(logsheet.overtimeHours) : "—"} mono />
          <Field label="Operator" value={logsheet.operatorName ?? "—"} />
          <Field
            label="Fuel consumed"
            value={logsheet.fuelConsumed != null ? `${logsheet.fuelConsumed} ${logsheet.fuelUnit ?? ""}` : "—"}
            mono
          />
        </div>
        {logsheet.remarks && (
          <div className="mt-3 border-t border-border pt-3">
            <Field label="Remarks" value={logsheet.remarks} />
          </div>
        )}
      </Card>

      <p className="text-xs text-meta-light">
        Who submitted this entry isn&apos;t tracked today — there is no submitted-by column on
        logsheets (see the frontend/backend gap report).
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
