"use client";

import type { Logsheet } from "@fleetip/contracts/logsheet";
import type { Rental } from "@fleetip/contracts/rental";
import {
  Alert,
  Badge,
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
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { formatDate } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { LogsheetPanel } from "../rentals/panels";

/**
 * Standalone Logsheets workspace. `GET .../logsheets` now serves a real
 * org-wide list (single joined query, gated by logsheet.manage) — the
 * table below is the primary, real view. The per-rental picker underneath
 * stays too: it's still where a new logsheet is actually entered, since the
 * standalone list is read-only.
 */
export default function LogsheetsPage() {
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const canView = hasPermission("logsheet.manage");

  const [logsheets, setLogsheets] = useState<Logsheet[] | null>(null);
  const [rentals, setRentals] = useState<Rental[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRentalId, setSelectedRentalId] = useState("");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  useEffect(() => {
    if (!organizationId || !canView) return;
    void (async () => {
      try {
        const [logsheetList, rentalList] = await Promise.all([
          apiClient.listLogsheets(organizationId) as Promise<Logsheet[]>,
          apiClient.listRentals(organizationId) as Promise<Rental[]>,
        ]);
        setLogsheets(logsheetList);
        setRentals(rentalList);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load logsheets");
      }
    })();
  }, [organizationId, canView]);

  const rentalsById = useMemo(() => new Map((rentals ?? []).map((r) => [r.id, r])), [rentals]);

  const filteredLogsheets = useMemo(() => {
    if (!logsheets) return [];
    const q = search.trim().toLowerCase();
    return logsheets.filter((sheet) => {
      if (dateFilter && sheet.logDate !== dateFilter) return false;
      if (!q) return true;
      const rental = rentalsById.get(sheet.rentalId);
      const haystack = [rental?.machineAssetCode, rental?.clientSnapshot?.name, rental?.projectName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [logsheets, rentalsById, search, dateFilter]);

  if (!organizationId) return <LoadingState label="Loading…" />;

  if (!canView) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Logsheets" />
        <EmptyState
          title="You don't have permission to view logsheets"
          description="Logsheets are recorded by the rental company side of a rental. A Renter-facing read view (logsheet.respond) doesn't exist yet — see the frontend/backend gap report."
        />
      </div>
    );
  }

  if (error) return <ErrorState message={error} />;
  if (!logsheets || !rentals) return <LoadingState label="Loading logsheets…" />;

  const selectedRental = rentals.find((r) => r.id === selectedRentalId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Logsheets"
        description="Daily operating hours across every rental — fast entry, fleet-wide visibility."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Machine, rental, project…"
          className="w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Input
          type="date"
          className="w-40"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
        />
      </div>

      <Table>
        <Thead>
          <Tr>
            <Th>Date</Th>
            <Th>Machine</Th>
            <Th>Rental</Th>
            <Th>Operating hrs</Th>
            <Th>Idle/downtime</Th>
            <Th>Submitted by</Th>
            <Th>Status</Th>
          </Tr>
        </Thead>
        <Tbody>
          {filteredLogsheets.length === 0 ? (
            <Tr>
              <Td colSpan={7} className="bg-surface-sunk py-8">
                <EmptyState
                  title="No logsheets"
                  description={
                    logsheets.length === 0
                      ? "No logsheets have been submitted yet across the fleet."
                      : "No logsheets match this filter."
                  }
                />
              </Td>
            </Tr>
          ) : (
            filteredLogsheets.map((sheet) => {
              const rental = rentalsById.get(sheet.rentalId);
              return (
                <Tr key={sheet.id}>
                  <Td className="font-mono">
                    <Link
                      href={`/logsheets/${sheet.id}?rentalId=${sheet.rentalId}`}
                      className="font-medium text-accent-text"
                    >
                      {formatDate(sheet.logDate)}
                    </Link>
                  </Td>
                  <Td className="font-mono">{rental?.machineAssetCode ?? "—"}</Td>
                  <Td>{rental?.clientSnapshot?.name ?? "—"}</Td>
                  <Td className="font-mono">{sheet.operatingHours ?? "—"}</Td>
                  <Td className="font-mono">{sheet.idleHours ?? "—"}</Td>
                  <Td>{sheet.operatorName ?? "—"}</Td>
                  <Td>
                    <Badge tone={sheet.customerConfirmed ? "success" : "neutral"}>
                      {sheet.customerConfirmed ? "Confirmed" : "Unconfirmed"}
                    </Badge>
                  </Td>
                </Tr>
              );
            })
          )}
        </Tbody>
      </Table>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-ink">Enter a rental&apos;s logsheet</h2>
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
            Fast entry for{" "}
            <Link href={`/rentals/${selectedRental.id}?tab=logsheets`} className="font-medium underline">
              {selectedRental.machineAssetCode ?? selectedRental.machineId.slice(0, 8)}
            </Link>{" "}
            — open the full rental for billing, transport and more.
          </Alert>
          <LogsheetPanel organizationId={organizationId} rentalId={selectedRental.id} />
        </div>
      )}
    </div>
  );
}
