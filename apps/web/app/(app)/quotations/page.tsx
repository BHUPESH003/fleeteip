"use client";

import type { Machine } from "@fleetip/contracts/equipment";
import type { Organization } from "@fleetip/contracts/organization";
import type { CommercialQuotation, CommercialQuotationStatus } from "@fleetip/contracts/quotation";
import {
  Badge,
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
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { daysUntil, formatCurrencyINR, formatDate } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { CreateQuotationDialog } from "./CreateQuotationDialog";
import { acceptanceLabel, QUOTATION_STATUS_MAP } from "./shared";

type Filter = "all" | CommercialQuotationStatus;

const FILTERS: Filter[] = ["all", "draft", "sent", "negotiating", "awarded", "rejected", "expired", "withdrawn"];

interface Loaded {
  quotations: CommercialQuotation[];
  machinesById: Map<string, Machine>;
  renterNames: Map<string, string>;
  rentalCompanyNames: Map<string, string>;
}

export default function QuotationsPage() {
  const { currentMembership } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;

  const requirementIdParam = searchParams.get("requirementId");
  const sourceAuctionIdParam = searchParams.get("sourceAuctionId");
  const quotationIdParam = searchParams.get("quotationId");

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(Boolean(requirementIdParam || sourceAuctionIdParam));

  async function load(orgId: string, orgType: "renter" | "rental_company") {
    try {
      const quotations = (await apiClient.listQuotations(orgId)) as CommercialQuotation[];
      if (orgType === "rental_company") {
        const [machines, renterOrgs] = await Promise.all([
          apiClient.listMachines(orgId) as Promise<Machine[]>,
          apiClient.listRenterOrganizations(orgId) as Promise<Organization[]>,
        ]);
        setData({
          quotations,
          machinesById: new Map(machines.map((m) => [m.id, m])),
          renterNames: new Map(renterOrgs.map((o) => [o.id, o.name])),
          rentalCompanyNames: new Map(),
        });
      } else {
        const rentalCompanyOrgs = (await apiClient.listRentalCompanyOrganizations(
          orgId,
        )) as Organization[];
        setData({
          quotations,
          machinesById: new Map(),
          renterNames: new Map(),
          rentalCompanyNames: new Map(rentalCompanyOrgs.map((o) => [o.id, o.name])),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quotations");
    }
  }

  useEffect(() => {
    if (organizationId && organizationType) void load(organizationId, organizationType);
  }, [organizationId, organizationType]);

  useEffect(() => {
    if (quotationIdParam) router.replace(`/quotations/${quotationIdParam}`);
  }, [quotationIdParam, router]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.quotations.filter((quotation) => {
      if (filter !== "all" && quotation.status !== filter) return false;
      if (!q) return true;
      const machine = data.machinesById.get(quotation.machineId);
      const counterparty =
        organizationType === "renter"
          ? data.rentalCompanyNames.get(quotation.rentalCompanyOrganizationId)
          : quotation.clientSnapshot?.name ??
            (quotation.renterOrganizationId && data.renterNames.get(quotation.renterOrganizationId));
      const haystack = [quotation.referenceNumber, counterparty, machine?.assetCode]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [data, filter, search, organizationType]);

  if (!organizationId || !organizationType) return <LoadingState label="Loading…" />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Loading quotations…" />;

  const openValue = data.quotations
    .filter((q) => q.status === "sent" || q.status === "negotiating")
    .reduce((sum, q) => sum + q.rate, 0);
  const awaitingAcceptanceCount = data.quotations.filter(
    (q) => q.status === "sent" && !q.renterAcceptedAt && q.renterOrganizationId && !q.sourceAuctionId,
  ).length;
  const expiringSoonCount = data.quotations.filter(
    (q) => (q.status === "sent" || q.status === "negotiating") && daysUntil(q.validityDate) <= 7,
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Quotations"
        description={`${formatCurrencyINR(openValue)} of open commercial value · ${awaitingAcceptanceCount} awaiting renter acceptance · ${expiringSoonCount} expiring this week`}
        actions={
          organizationType === "rental_company" ? (
            <Button onClick={() => setCreateOpen(true)}>New quotation</Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Reference, renter, machine…" className="w-64" value={search} onChange={(e) => setSearch(e.target.value)} />
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
            {key} · {key === "all" ? data.quotations.length : data.quotations.filter((q) => q.status === key).length}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No quotations match these filters" />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Quotation</Th>
              <Th>{organizationType === "rental_company" ? "Renter / client" : "From"}</Th>
              {organizationType === "rental_company" && <Th>Machine</Th>}
              <Th>Period</Th>
              <Th>Rate</Th>
              <Th>Status</Th>
              <Th>Acceptance</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {filtered.map((quotation) => {
              const machine = data.machinesById.get(quotation.machineId);
              const counterparty =
                organizationType === "renter"
                  ? data.rentalCompanyNames.get(quotation.rentalCompanyOrganizationId) ?? "Rental company"
                  : quotation.clientSnapshot?.name ??
                    (quotation.renterOrganizationId && data.renterNames.get(quotation.renterOrganizationId)) ??
                    "Renter";
              const acceptance = acceptanceLabel(quotation);
              const source = quotation.sourceAuctionId
                ? `from AU-${quotation.sourceAuctionId.slice(0, 8).toUpperCase()}`
                : quotation.requirementId
                  ? `from RFQ-${quotation.requirementId.slice(0, 8).toUpperCase()}`
                  : "direct";
              return (
                <Tr key={quotation.id}>
                  <Td>
                    <div className="flex flex-col">
                      <span className="font-mono text-xs text-ink">{quotation.referenceNumber}</span>
                      <span className="text-xs text-meta">{source}</span>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-col">
                      <span className="text-xs text-ink">{counterparty}</span>
                      <span className="text-xs text-meta">
                        {organizationType === "rental_company"
                          ? quotation.renterOrganizationId
                            ? "Renter organization"
                            : "External client"
                          : ""}
                      </span>
                    </div>
                  </Td>
                  {organizationType === "rental_company" && (
                    <Td>
                      <div className="flex flex-col">
                        <span className="font-mono text-xs">{machine?.assetCode ?? "—"}</span>
                      </div>
                    </Td>
                  )}
                  <Td className="font-mono">
                    {formatDate(quotation.startDate)} → {quotation.endDate ? formatDate(quotation.endDate) : "open"}
                  </Td>
                  <Td className="font-mono">
                    {quotation.rate}/{quotation.rateUnit}
                  </Td>
                  <Td>
                    <StatusBadge status={quotation.status} map={QUOTATION_STATUS_MAP} />
                  </Td>
                  <Td>
                    <Badge tone={acceptance.tone}>{acceptance.text}</Badge>
                  </Td>
                  <Td>
                    <Link href={`/quotations/${quotation.id}`} className="text-xs font-medium text-accent-text">
                      Open
                    </Link>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      )}

      {organizationType === "rental_company" && (
        <CreateQuotationDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          organizationId={organizationId}
          requirementIdParam={requirementIdParam}
          sourceAuctionIdParam={sourceAuctionIdParam}
          onCreated={() => void load(organizationId, organizationType)}
        />
      )}
    </div>
  );
}
