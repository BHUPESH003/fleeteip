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
import { LogsheetPanel } from "../rentals/panels";

/**
 * Standalone Logsheets workspace. No org-wide logsheet list endpoint exists
 * (apps/api only exposes listLogsheetsForRental, per-rental) — the table
 * below stays an honest not-yet-available state; the real, working path is
 * the per-rental drill-down, reusing the exact LogsheetPanel already wired
 * up on Rental detail (same fast-entry form, same data).
 */
export default function LogsheetsPage() {
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const canView = hasPermission("logsheet.manage");

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
        <PageHeader title="Logsheets" />
        <EmptyState
          title="You don't have permission to view logsheets"
          description="Logsheets are recorded by the rental company side of a rental. A Renter-facing read view (logsheet.respond) doesn't exist yet — see the frontend/backend gap report."
        />
      </div>
    );
  }

  if (error) return <ErrorState message={error} />;
  if (!rentals) return <LoadingState label="Loading logsheets…" />;

  const selectedRental = rentals.find((r) => r.id === selectedRentalId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Logsheets"
        description="Daily operating hours across every rental — fast entry, fleet-wide visibility."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Machine, rental, project…" className="w-64" disabled title="Not available yet — see below" />
        <Input type="date" className="w-40" disabled title="Date range filter — not available yet" />
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
          <Tr>
            <Td colSpan={7} className="bg-surface-sunk py-8">
              <EmptyState
                title="Fleet-wide logsheet list isn't available yet"
                description="apps/api has no org-wide logsheet endpoint today (only per-rental). Recorded in the frontend/backend gap report. Pick a rental below for fast entry and its full history now."
              />
            </Td>
          </Tr>
        </Tbody>
      </Table>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-ink">Open a rental&apos;s logsheets</h2>
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
