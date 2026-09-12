"use client";

import type { Logsheet, RentalUtilization } from "@fleetip/contracts/logsheet";
import type { TransportLeg, TransportRecord, TransportStatus } from "@fleetip/contracts/transport";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
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
import { legalNextTransportStatuses, TRANSPORT_STATUS_MAP } from "./shared";

const LEGS: TransportLeg[] = ["mobilization", "demobilization"];

/**
 * Shared by Rental detail's Transport tab and the standalone Transport
 * workspace's per-rental drill-down (apps/web/app/(app)/transport) — the
 * only real Transport data source in this branch is
 * listTransportForRental (per-rental), there is no org-wide list endpoint.
 */
export function TransportPanel({
  organizationId,
  rentalId,
  readOnly = false,
}: {
  organizationId: string;
  rentalId: string;
  /** Renter callers get transport.respond (read-only) — hide the plan/mark-status actions. */
  readOnly?: boolean;
}) {
  const [records, setRecords] = useState<TransportRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setRecords((await apiClient.listTransportForRental(organizationId, rentalId)) as TransportRecord[]);
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
      {error && <ErrorState message={error} />}
      <div className="flex flex-col gap-3">
        {LEGS.map((leg) => {
          const record = records.find((r) => r.leg === leg);
          return (
            <div
              key={leg}
              className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border p-3"
            >
              <div>
                <p className="text-sm font-medium capitalize text-ink">{leg}</p>
                {record ? (
                  <p className="text-xs text-meta">
                    {record.pickupLocation ?? "—"} → {record.destination ?? "—"} · planned{" "}
                    {record.plannedDate ?? "—"}
                  </p>
                ) : (
                  <p className="text-xs text-meta">Not yet planned</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {record ? (
                  <>
                    <StatusBadge status={record.status} map={TRANSPORT_STATUS_MAP} />
                    {!readOnly &&
                      legalNextTransportStatuses(record.status).map((next) => (
                        <Button key={next} size="sm" variant="secondary" onClick={() => void handleStatus(leg, next)}>
                          Mark {next}
                        </Button>
                      ))}
                    <Link
                      href={`/transport/${record.id}?rentalId=${rentalId}`}
                      className="text-xs font-medium text-accent-text"
                    >
                      Full detail →
                    </Link>
                  </>
                ) : (
                  !readOnly && (
                    <Button size="sm" variant="secondary" onClick={() => void handleCreate(leg)}>
                      Plan
                    </Button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * Shared by Rental detail's Logsheets & utilization tab and the standalone
 * Logsheets workspace's per-rental drill-down — see TransportPanel above
 * for why this stays rental-scoped (no org-wide logsheet endpoint exists).
 */
export function LogsheetPanel({
  organizationId,
  rentalId,
  readOnly = false,
}: {
  organizationId: string;
  rentalId: string;
  /** Renter callers get logsheet.respond (read-only) — hide the submit form. */
  readOnly?: boolean;
}) {
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
    <div className="flex flex-col gap-3.5">
      {error && <ErrorState message={error} />}
      {utilization && (
        <Card>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Rental days", utilization.totalRentalDays],
              ["Operating hrs", utilization.totalOperatingHours],
              ["Idle hrs", utilization.totalIdleHours],
              ["Logged days", utilization.loggedDayCount],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-meta">{label}</span>
                <span className="font-mono text-lg font-medium text-ink">{value}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card>
        {!readOnly && (
          <form onSubmit={handleSubmit} className="mb-4 flex flex-wrap items-end gap-3">
            <Input label="Date" name="logDate" type="date" required />
            <Input label="Operating hrs" name="operatingHours" type="number" step="0.5" />
            <Input label="Idle hrs" name="idleHours" type="number" step="0.5" />
            <Input label="Overtime hrs" name="overtimeHours" type="number" step="0.5" />
            <Button type="submit">Submit logsheet</Button>
          </form>
        )}
        {logsheets.length === 0 ? (
          <EmptyState
            title="No logsheets yet"
            description={readOnly ? "None submitted yet." : "Submit one above."}
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Date</Th>
                <Th>Operating</Th>
                <Th>Idle</Th>
                <Th>Overtime</Th>
                <Th>Confirmed</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {logsheets.map((log) => (
                <Tr key={log.id}>
                  <Td className="font-mono">{formatDate(log.logDate)}</Td>
                  <Td>{log.operatingHours ?? "—"}</Td>
                  <Td>{log.idleHours ?? "—"}</Td>
                  <Td>{log.overtimeHours ?? "—"}</Td>
                  <Td>
                    <Badge tone={log.customerConfirmed ? "success" : "neutral"}>
                      {log.customerConfirmed ? "Confirmed" : "Unconfirmed"}
                    </Badge>
                  </Td>
                  <Td>
                    <Link href={`/logsheets/${log.id}?rentalId=${rentalId}`} className="text-xs font-medium text-accent-text">
                      Detail →
                    </Link>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
