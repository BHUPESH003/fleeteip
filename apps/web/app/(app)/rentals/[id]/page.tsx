"use client";

import type { Logsheet } from "@fleetip/contracts/logsheet";
import type { RentalUtilization } from "@fleetip/contracts/logsheet";
import type { Rental } from "@fleetip/contracts/rental";
import type { TransportLeg, TransportRecord, TransportStatus } from "@fleetip/contracts/transport";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
} from "@fleetip/ui";
import { useParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { apiClient } from "../../../../lib/api-client";
import { useSession } from "../../../../lib/session-context";

const LEGS: TransportLeg[] = ["mobilization", "demobilization"];

function legalNextTransportStatuses(current: TransportStatus): TransportStatus[] {
  if (current === "planned") return ["dispatched", "cancelled"];
  if (current === "dispatched") return ["delivered", "cancelled"];
  return [];
}

function TransportPanel({
  organizationId,
  rentalId,
}: {
  organizationId: string;
  rentalId: string;
}) {
  const [records, setRecords] = useState<TransportRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setRecords(
        (await apiClient.listTransportForRental(organizationId, rentalId)) as TransportRecord[],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transport records");
    }
  }

  useEffect(() => {
    void refresh();
  }, [organizationId, rentalId]);

  async function handleCreate(leg: TransportLeg) {
    try {
      await apiClient.createTransport(organizationId, rentalId, { leg });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create transport record");
    }
  }

  async function handleStatus(leg: TransportLeg, status: TransportStatus) {
    try {
      await apiClient.updateTransport(organizationId, rentalId, leg, {
        status,
        ...(status === "delivered" ? { actualDate: new Date().toISOString().slice(0, 10) } : {}),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update transport record");
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-medium text-gray-900">Transport</h2>
      {error && <ErrorState message={error} />}
      <div className="flex flex-col gap-3">
        {LEGS.map((leg) => {
          const record = records.find((r) => r.leg === leg);
          return (
            <div
              key={leg}
              className="flex items-center justify-between rounded-lg border border-gray-200 p-3"
            >
              <div>
                <p className="font-medium capitalize text-gray-900">{leg}</p>
                {record ? (
                  <p className="text-sm text-gray-500">
                    {record.pickupLocation ?? "—"} → {record.destination ?? "—"} · planned{" "}
                    {record.plannedDate ?? "—"}
                  </p>
                ) : (
                  <p className="text-sm text-gray-500">Not yet planned</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {record ? (
                  <>
                    <Badge tone={record.status === "delivered" ? "success" : "warning"}>
                      {record.status}
                    </Badge>
                    {legalNextTransportStatuses(record.status).map((next) => (
                      <button
                        key={next}
                        onClick={() => void handleStatus(leg, next)}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Mark {next}
                      </button>
                    ))}
                  </>
                ) : (
                  <button
                    onClick={() => void handleCreate(leg)}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    Plan
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function LogsheetPanel({ organizationId, rentalId }: { organizationId: string; rentalId: string }) {
  const [logsheets, setLogsheets] = useState<Logsheet[]>([]);
  const [utilization, setUtilization] = useState<RentalUtilization | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const [list, util] = await Promise.all([
        apiClient.listLogsheetsForRental(organizationId, rentalId),
        apiClient.getRentalUtilization(organizationId, rentalId),
      ]);
      setLogsheets(list as Logsheet[]);
      setUtilization(util as RentalUtilization);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logsheets");
    }
  }

  useEffect(() => {
    void refresh();
  }, [organizationId, rentalId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const operatingHours = form.get("operatingHours");
    const idleHours = form.get("idleHours");
    const overtimeHours = form.get("overtimeHours");
    try {
      await apiClient.submitLogsheet(organizationId, rentalId, {
        logDate: String(form.get("logDate")),
        operatingHours: operatingHours ? Number(operatingHours) : undefined,
        idleHours: idleHours ? Number(idleHours) : undefined,
        overtimeHours: overtimeHours ? Number(overtimeHours) : undefined,
      });
      formElement.reset();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit logsheet");
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-medium text-gray-900">Logsheets &amp; utilization</h2>
      {error && <ErrorState message={error} />}
      {utilization && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-xs text-gray-500">Rental days</p>
            <p className="text-lg font-semibold text-gray-900">{utilization.totalRentalDays}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Operating hrs</p>
            <p className="text-lg font-semibold text-gray-900">{utilization.totalOperatingHours}</p>
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
      )}
      <form onSubmit={handleSubmit} className="mb-4 flex flex-wrap items-end gap-3">
        <Input label="Date" name="logDate" type="date" required />
        <Input label="Operating hrs" name="operatingHours" type="number" step="0.5" />
        <Input label="Idle hrs" name="idleHours" type="number" step="0.5" />
        <Input label="Overtime hrs" name="overtimeHours" type="number" step="0.5" />
        <Button type="submit">Submit logsheet</Button>
      </form>
      {logsheets.length === 0 ? (
        <EmptyState title="No logsheets yet" description="Submit one above." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Operating</th>
                <th className="py-2 pr-4 font-medium">Idle</th>
                <th className="py-2 pr-4 font-medium">Overtime</th>
              </tr>
            </thead>
            <tbody>
              {logsheets.map((log) => (
                <tr key={log.id} className="border-b border-gray-100">
                  <td className="py-2 pr-4">{log.logDate}</td>
                  <td className="py-2 pr-4">{log.operatingHours ?? "—"}</td>
                  <td className="py-2 pr-4">{log.idleHours ?? "—"}</td>
                  <td className="py-2 pr-4">{log.overtimeHours ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function RentalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentMembership } = useSession();
  const organizationId = currentMembership?.organizationId;
  const [rental, setRental] = useState<Rental | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    void (async () => {
      try {
        setRental((await apiClient.getRental(organizationId, id)) as Rental);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load rental");
      } finally {
        setLoading(false);
      }
    })();
  }, [organizationId, id]);

  if (loading) return <LoadingState label="Loading rental…" />;
  if (error) return <ErrorState message={error} />;
  if (!rental) return null;

  return (
    <>
      <PageHeader
        title={`Rental · ${rental.clientSnapshot?.name ?? rental.renterOrganizationId?.slice(0, 8)}`}
        description={`${rental.startDate} → ${rental.endDate ?? "open-ended"} · ${rental.rate} / ${rental.rateUnit}`}
      />
      <div className="mt-4 flex flex-col gap-6">
        <TransportPanel organizationId={organizationId!} rentalId={id} />
        <LogsheetPanel organizationId={organizationId!} rentalId={id} />
      </div>
    </>
  );
}
