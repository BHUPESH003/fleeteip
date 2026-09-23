"use client";

import type { Rental } from "@fleetip/contracts/rental";
import type { TransportRecord, TransportStatus } from "@fleetip/contracts/transport";
import {
  AllocationBar,
  type AllocationTone,
  Alert,
  AttentionStrip,
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
import { daysUntil, formatDate } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { TRANSPORT_STATUS_MAP } from "../rentals/shared";
import { TransportPanel } from "../rentals/panels";

const STATUS_SEGMENTS: { key: TransportStatus; label: string; tone: AllocationTone }[] = [
  { key: "planned", label: "Planned", tone: "neutral" },
  { key: "dispatched", label: "Dispatched", tone: "on-rent" },
  { key: "delivered", label: "Delivered", tone: "available" },
  { key: "cancelled", label: "Cancelled", tone: "out-of-service" },
];

/**
 * Standalone Transport workspace. `GET .../transport-records` now serves a
 * real org-wide list (single joined query, gated by transport.manage) — the
 * table below is the primary, real view. The per-rental picker underneath
 * stays too: it's still the only place to plan a leg or mark it
 * dispatched/delivered, since the standalone list is read-only.
 */
export default function TransportPage() {
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  const canView = hasPermission("transport.manage");
  // Rentals here are enrichment (machine code, client name, the per-rental
  // picker) — ancillary to transport.manage, gated by a different permission
  // a custom role may lack even while it has transport.manage.
  const canListRentals =
    organizationType === "renter" ? hasPermission("rental.respond") : hasPermission("rental.manage");

  const [records, setRecords] = useState<TransportRecord[] | null>(null);
  const [rentals, setRentals] = useState<Rental[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRentalId, setSelectedRentalId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TransportStatus | "">("");

  useEffect(() => {
    if (!organizationId || !canView) return;
    void (async () => {
      try {
        const [recordList, rentalList] = await Promise.all([
          apiClient.listTransportRecords(organizationId) as Promise<TransportRecord[]>,
          canListRentals ? (apiClient.listRentals(organizationId) as Promise<Rental[]>) : Promise.resolve([]),
        ]);
        setRecords(recordList);
        setRentals(rentalList);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load transport records");
      }
    })();
  }, [organizationId, canView, canListRentals]);

  const rentalsById = useMemo(() => new Map((rentals ?? []).map((r) => [r.id, r])), [rentals]);

  const filteredRecords = useMemo(() => {
    if (!records) return [];
    const q = search.trim().toLowerCase();
    return records.filter((record) => {
      if (statusFilter && record.status !== statusFilter) return false;
      if (!q) return true;
      const rental = rentalsById.get(record.rentalId);
      const haystack = [
        rental?.machineAssetCode,
        rental?.clientSnapshot?.name,
        record.pickupLocation,
        record.destination,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [records, rentalsById, search, statusFilter]);

  if (!organizationId) return <LoadingState label="Loading…" />;

  if (!canView) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Transport" />
        <EmptyState
          title="You don't have permission to view transport"
          description="Transport records are managed by the rental company side of a rental. A Renter-facing read view (transport.respond) doesn't exist yet — see the frontend/backend gap report."
        />
      </div>
    );
  }

  if (error) return <ErrorState message={error} />;
  if (!records || !rentals) return <LoadingState label="Loading transport…" />;

  const selectedRental = rentals.find((r) => r.id === selectedRentalId) ?? null;
  // Overdue in the sense that matters operationally: still "planned" past
  // the date it was supposed to move — a real delay, not the terminal
  // "cancelled" state.
  const overdueCount = records.filter(
    (r) => r.status === "planned" && r.plannedDate && daysUntil(r.plannedDate) < 0,
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Transport"
        description="Mobilization and demobilization across every rental — fleet-wide visibility."
      />

      <AllocationBar
        total={{ count: records.length, label: "All legs" }}
        segments={STATUS_SEGMENTS.map((s) => ({
          key: s.key,
          count: records.filter((r) => r.status === s.key).length,
          label: s.label,
          tone: s.tone,
        }))}
        active={statusFilter || null}
        onSelect={(key) => setStatusFilter((key ?? "") as TransportStatus | "")}
      />

      <AttentionStrip
        items={[
          {
            key: "overdue",
            count: overdueCount,
            text: `leg${overdueCount === 1 ? "" : "s"} still planned past their scheduled date`,
            onClick: () => setStatusFilter("planned"),
          },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Machine, rental, route…"
          className="w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Table>
        <Thead>
          <Tr>
            <Th>Transport</Th>
            <Th>Machine</Th>
            <Th>Rental</Th>
            <Th>Route</Th>
            <Th>Scheduled</Th>
            <Th>Status</Th>
          </Tr>
        </Thead>
        <Tbody>
          {filteredRecords.length === 0 ? (
            <Tr>
              <Td colSpan={6} className="bg-surface-sunk py-8">
                <EmptyState
                  title="No transport records"
                  description={
                    records.length === 0
                      ? "No transport legs have been planned yet across the fleet."
                      : "No records match this filter."
                  }
                />
              </Td>
            </Tr>
          ) : (
            filteredRecords.map((record) => {
              const rental = rentalsById.get(record.rentalId);
              return (
                <Tr key={record.id}>
                  <Td>
                    <Link
                      href={`/transport/${record.id}?rentalId=${record.rentalId}`}
                      className="font-mono text-xs font-medium text-accent-text"
                    >
                      {record.leg}
                    </Link>
                  </Td>
                  <Td className="font-mono">{rental?.machineAssetCode ?? "—"}</Td>
                  <Td>{rental?.clientSnapshot?.name ?? "—"}</Td>
                  <Td className="text-meta">
                    {record.pickupLocation ?? "—"} → {record.destination ?? "—"}
                  </Td>
                  <Td className="font-mono">
                    {record.plannedDate ? formatDate(record.plannedDate) : "—"}
                  </Td>
                  <Td>
                    <StatusBadge status={record.status} map={TRANSPORT_STATUS_MAP} />
                  </Td>
                </Tr>
              );
            })
          )}
        </Tbody>
      </Table>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-ink">
          Plan or update a rental&apos;s transport
        </h2>
        <Select
          className="max-w-sm"
          value={selectedRentalId}
          onChange={(e) => setSelectedRentalId(e.target.value)}
          options={[
            { value: "", label: "Select a rental…" },
            ...rentals.map((r) => ({
              value: r.id,
              label: `${r.machineAssetCode ?? r.machineId.slice(0, 8)} · ${r.clientSnapshot?.name ?? formatDate(r.startDate)}`,
            })),
          ]}
        />
      </Card>

      {selectedRental && (
        <div className="flex flex-col gap-3">
          <Alert tone="info">
            Showing transport for{" "}
            <Link
              href={`/rentals/${selectedRental.id}?tab=transport`}
              className="font-medium underline"
            >
              {selectedRental.machineAssetCode ?? selectedRental.machineId.slice(0, 8)}
            </Link>{" "}
            — open the full rental for billing, logsheets and more.
          </Alert>
          <TransportPanel organizationId={organizationId} rentalId={selectedRental.id} />
        </div>
      )}
    </div>
  );
}
