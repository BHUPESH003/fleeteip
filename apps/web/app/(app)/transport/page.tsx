"use client";

import type { Rental } from "@fleetip/contracts/rental";
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
import { formatDate } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { TransportPanel } from "../rentals/panels";

/**
 * Standalone Transport workspace. There is no org-wide transport list
 * endpoint in this branch — apps/api's transport module only exposes
 * listTransportForRental (per-rental). Looping listTransportForRental
 * across every rental would be an N+1 client-side fetch faking an
 * aggregate that doesn't exist, so the list below stays an honest
 * not-yet-available state (real columns, no rows) and the real, working
 * path is the per-rental drill-down beneath it, which reuses the exact
 * TransportPanel already wired up on Rental detail.
 */
export default function TransportPage() {
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const canView = hasPermission("transport.manage");

  const [rentals, setRentals] = useState<Rental[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRentalId, setSelectedRentalId] = useState("");

  useEffect(() => {
    if (!organizationId || !canView) return;
    void (async () => {
      try {
        setRentals((await apiClient.listRentals(organizationId)) as Rental[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load rentals");
      }
    })();
  }, [organizationId, canView]);

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
  if (!rentals) return <LoadingState label="Loading transport…" />;

  const selectedRental = rentals.find((r) => r.id === selectedRentalId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Transport"
        description="Mobilization and demobilization across every rental — fleet-wide visibility."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Machine, rental, route…" className="w-64" disabled title="Not available yet — see below" />
        <Select className="w-40" disabled options={[{ value: "", label: "All statuses" }]} />
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
          <Tr>
            <Td colSpan={6} className="bg-surface-sunk py-8">
              <EmptyState
                title="Fleet-wide transport list isn't available yet"
                description="apps/api has no org-wide transport endpoint today (only per-rental). Recorded in the frontend/backend gap report. Pick a rental below to view or update its transport records now."
              />
            </Td>
          </Tr>
        </Tbody>
      </Table>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-ink">Open a rental&apos;s transport</h2>
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
            <Link href={`/rentals/${selectedRental.id}?tab=transport`} className="font-medium underline">
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
