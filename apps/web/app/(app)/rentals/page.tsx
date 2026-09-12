"use client";

import type { Rental, RentalStatus } from "@fleetip/contracts/rental";
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  StatusBadge,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@fleetip/ui";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useEffect } from "react";
import { apiClient } from "../../../lib/api-client";
import { formatDate } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { CreateRentalDialog } from "./CreateRentalDialog";
import { RENTAL_STATUS_MAP } from "./shared";

type Filter = "all" | RentalStatus;
const FILTERS: Filter[] = ["all", "confirmed", "active", "off_rent", "completed", "cancelled"];

export default function RentalsPage() {
  const { currentMembership } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  const isRenter = organizationType === "renter";

  const [rentals, setRentals] = useState<Rental[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  async function load(orgId: string) {
    try {
      setRentals((await apiClient.listRentals(orgId)) as Rental[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rentals");
    }
  }

  useEffect(() => {
    if (organizationId) void load(organizationId);
  }, [organizationId]);

  const filtered = useMemo(() => {
    if (!rentals) return [];
    const q = search.trim().toLowerCase();
    return rentals.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      const customer = isRenter
        ? (r.rentalCompanyOrganizationName ?? "")
        : (r.clientSnapshot?.name ?? "");
      const haystack = [r.machineAssetCode, customer, r.projectName].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [rentals, filter, search, isRenter]);

  if (!organizationId || !organizationType) return <LoadingState label="Loading…" />;
  if (error) return <ErrorState message={error} />;
  if (!rentals) return <LoadingState label="Loading rentals…" />;

  const activeCount = rentals.filter((r) => r.status === "active").length;
  const confirmedCount = rentals.filter((r) => r.status === "confirmed").length;
  const offRentCount = rentals.filter((r) => r.status === "off_rent").length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Rentals"
        description={
          isRenter
            ? `${rentals.length} total · ${activeCount} active · ${offRentCount} off-rent`
            : `${rentals.length} total · ${confirmedCount} confirmed · ${activeCount} active · ${offRentCount} off-rent`
        }
        actions={!isRenter ? <Button onClick={() => setCreateOpen(true)}>Create rental</Button> : undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Machine, customer, project…"
          className="w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {FILTERS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={[
              "rounded-control border px-3 py-1.5 text-xs font-semibold capitalize",
              filter === key
                ? "border-ink-strong bg-ink-strong text-white"
                : "border-border-strong bg-surface text-ink-muted hover:bg-surface-sunk",
            ].join(" ")}
          >
            {key.replace("_", " ")} · {key === "all" ? rentals.length : rentals.filter((r) => r.status === key).length}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No rentals match these filters"
          description={isRenter ? "Rentals you're awarded will show up here." : "Create one above to get started."}
        />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Machine</Th>
              <Th>{isRenter ? "Rental company" : "Customer"}</Th>
              <Th>Period</Th>
              <Th>Rate</Th>
              <Th>Status</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {filtered.map((rental) => {
              const customer = isRenter
                ? (rental.rentalCompanyOrganizationName ?? "Rental company")
                : (rental.clientSnapshot?.name ??
                  `Renter ${rental.renterOrganizationId?.slice(0, 8) ?? ""}…`);
              return (
                <Tr key={rental.id}>
                  <Td className="font-mono">{rental.machineAssetCode ?? rental.machineId.slice(0, 8)}</Td>
                  <Td>{customer}</Td>
                  <Td className="font-mono">
                    {formatDate(rental.startDate)} → {rental.endDate ? formatDate(rental.endDate) : "open"}
                  </Td>
                  <Td className="font-mono">
                    {rental.rate}/{rental.rateUnit}
                  </Td>
                  <Td>
                    <StatusBadge status={rental.status} map={RENTAL_STATUS_MAP} />
                  </Td>
                  <Td>
                    <Link href={`/rentals/${rental.id}`} className="text-xs font-medium text-accent-text">
                      Open
                    </Link>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      )}

      {!isRenter && (
        <CreateRentalDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          organizationId={organizationId}
          onCreated={() => void load(organizationId)}
        />
      )}
    </div>
  );
}
