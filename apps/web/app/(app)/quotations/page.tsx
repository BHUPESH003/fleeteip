"use client";

import type { Machine } from "@fleetip/contracts/equipment";
import type { Organization } from "@fleetip/contracts/organization";
import type { CommercialQuotation, CommercialQuotationStatus, QuotationResponse } from "@fleetip/contracts/quotation";
import type { Requirement } from "@fleetip/contracts/rfq";
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

type Filter = "all" | CommercialQuotationStatus | "requested";

const FILTERS: Filter[] = ["all", "draft", "sent", "negotiating", "awarded", "rejected", "expired", "withdrawn"];

interface Loaded {
  quotations: CommercialQuotation[];
  machinesById: Map<string, Machine>;
  renterNames: Map<string, string>;
  rentalCompanyNames: Map<string, string>;
  // Rental-company-only: every "interested" response of ours the Renter has
  // explicitly asked us to formalize (via "Request quotation"), plus the
  // Requirement each one is against — so "Requested" doesn't rely on still
  // having the notification. Empty for a Renter.
  requestedResponses: QuotationResponse[];
  requirementsById: Map<string, Requirement>;
}

export default function QuotationsPage() {
  const { currentMembership, hasPermission } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  // Machine names are enrichment, not the point of this page (quotation.manage
  // is) — a role without equipment.manage still gets a fully working page,
  // just without asset codes resolved (already handled: `machine?.assetCode
  // ?? "—"`). Gating the fetch itself also skips a request that would 403.
  const canListMachines = hasPermission("equipment.manage");

  const requirementIdParam = searchParams.get("requirementId");
  const sourceAuctionIdParam = searchParams.get("sourceAuctionId");
  const quotationIdParam = searchParams.get("quotationId");

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(Boolean(requirementIdParam || sourceAuctionIdParam));
  // Set when opening the dialog from a "Requested" row rather than the URL —
  // requirementIdParam still wins when present (an actual notification/
  // dashboard link), this only fills in for the in-page click path.
  const [manualRequirementId, setManualRequirementId] = useState<string | null>(null);
  const activeRequirementId = requirementIdParam ?? manualRequirementId;

  // A notification/dashboard link (e.g. "Request quotation") arrives here via
  // router.push — a same-route, query-only navigation that the App Router
  // doesn't remount this page for, so the useState initializer above never
  // re-runs and createOpen stays stuck at whatever it was on first mount.
  // Mirrors the quotationIdParam redirect effect below, which already gets
  // this right.
  useEffect(() => {
    if (requirementIdParam || sourceAuctionIdParam) setCreateOpen(true);
  }, [requirementIdParam, sourceAuctionIdParam]);

  async function load(orgId: string, orgType: "renter" | "rental_company") {
    try {
      const quotations = (await apiClient.listQuotations(orgId)) as CommercialQuotation[];
      if (orgType === "rental_company") {
        const [machines, renterOrgs, requestedResponses] = await Promise.all([
          canListMachines ? (apiClient.listMachines(orgId) as Promise<Machine[]>) : Promise.resolve([]),
          apiClient.listRenterOrganizations(orgId) as Promise<Organization[]>,
          apiClient.listRequestedQuotations(orgId) as Promise<QuotationResponse[]>,
        ]);
        // Requirement details (project, capacity, quantity) for whichever
        // ones are still pending — getRequirementForDiscovery is the same
        // read the Open Market response dialog already uses.
        const fulfilledResponseIds = new Set(
          quotations.filter((q) => q.quotationResponseId).map((q) => q.quotationResponseId as string),
        );
        const pending = requestedResponses.filter((r) => !fulfilledResponseIds.has(r.id));
        const requirements = await Promise.all(
          pending.map((r) => apiClient.getRequirementForDiscovery(orgId, r.requirementId) as Promise<Requirement>),
        );
        setData({
          quotations,
          machinesById: new Map(machines.map((m) => [m.id, m])),
          renterNames: new Map(renterOrgs.map((o) => [o.id, o.name])),
          rentalCompanyNames: new Map(),
          requestedResponses: pending,
          requirementsById: new Map(requirements.map((r) => [r.id, r])),
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
          requestedResponses: [],
          requirementsById: new Map(),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quotations");
    }
  }

  useEffect(() => {
    if (organizationId && organizationType) void load(organizationId, organizationType);
  }, [organizationId, organizationType, canListMachines]);

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
    (q) => q.status === "sent" && !q.renterAcceptedAt && q.renterOrganizationId,
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
        {organizationType === "rental_company" && (
          <button
            type="button"
            onClick={() => setFilter("requested")}
            className={[
              "rounded-control border px-3 py-1.5 text-xs font-semibold",
              filter === "requested"
                ? "border-ink-strong bg-ink-strong text-white"
                : "border-border-strong bg-surface text-ink-muted hover:bg-surface-sunk",
            ].join(" ")}
          >
            Requested · {data.requestedResponses.length}
          </button>
        )}
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

      {filter === "requested" ? (
        data.requestedResponses.length === 0 ? (
          <EmptyState
            title="Nothing waiting on you"
            description="Requirements the Renter has explicitly asked for a formal quotation on show up here."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Requirement</Th>
                <Th>Your indicative rate</Th>
                <Th>Requested</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {data.requestedResponses.map((response) => {
                const requirement = data.requirementsById.get(response.requirementId);
                return (
                  <Tr key={response.id}>
                    <Td>
                      <div className="flex flex-col">
                        <span className="font-mono text-xs text-ink">
                          RFQ-{response.requirementId.slice(0, 8).toUpperCase()}
                        </span>
                        <span className="text-xs text-meta">
                          {requirement
                            ? [
                                requirement.capacity
                                  ? `${requirement.capacity}${requirement.capacityUnit ?? ""}`
                                  : null,
                                requirement.projectName,
                                `qty ${requirement.quantity}`,
                              ]
                                .filter(Boolean)
                                .join(" · ")
                            : "—"}
                        </span>
                      </div>
                    </Td>
                    <Td className="font-mono">
                      {response.indicativeRate ? `${response.indicativeRate} / ${response.indicativeRateUnit}` : "—"}
                    </Td>
                    <Td className="text-meta">
                      {response.quotationRequestedAt ? formatDate(response.quotationRequestedAt) : "—"}
                    </Td>
                    <Td>
                      <button
                        type="button"
                        onClick={() => {
                          setManualRequirementId(response.requirementId);
                          setCreateOpen(true);
                        }}
                        className="text-xs font-medium text-accent-text"
                      >
                        Create quotation
                      </button>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )
      ) : filtered.length === 0 ? (
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
          onClose={() => {
            setCreateOpen(false);
            setManualRequirementId(null);
          }}
          organizationId={organizationId}
          requirementIdParam={activeRequirementId}
          sourceAuctionIdParam={sourceAuctionIdParam}
          onCreated={() => void load(organizationId, organizationType)}
        />
      )}
    </div>
  );
}
