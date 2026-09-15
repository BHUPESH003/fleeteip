"use client";

import type { Product, ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
import type { Auction } from "@fleetip/contracts/auction";
import type { QuotationResponse } from "@fleetip/contracts/quotation";
import type { Requirement } from "@fleetip/contracts/rfq";
import {
  Badge,
  Button,
  Dialog,
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
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { daysUntil, formatDate } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { RESPONSE_STATUS_MAP, validityTone } from "./shared";

type Filter = "needs_response" | "responded" | "in_auction" | "closed";

interface Loaded {
  requirements: Requirement[];
  responses: Map<string, QuotationResponse>;
  activeAuctions: Map<string, Auction>;
  subcategoriesById: Map<string, ProductSubcategory>;
  stockedSubcategoryIds: Set<string>;
  machineCountBySubcategory: Map<string, number>;
}

export function OpenMarket({
  organizationId,
  highlightedRequirementId,
}: {
  organizationId: string;
  highlightedRequirementId: string | null;
}) {
  const { hasPermission } = useSession();
  // stockedSubcategoryIds (the "only equipment I stock" filter) is
  // enrichment, not the point of this page (rfq.respond is) — a role
  // without equipment.manage still gets a fully working open market, just
  // with an empty stocked set, same as a rental company with no fleet yet
  // (the checkbox then simply yields no matches via the existing EmptyState).
  const canListMachines = hasPermission("equipment.manage");

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("needs_response");
  const [onlyStocked, setOnlyStocked] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(highlightedRequirementId);

  async function load() {
    try {
      const [requirements, categories, machines, products] = await Promise.all([
        apiClient.discoverRequirements(organizationId) as Promise<Requirement[]>,
        apiClient.listProductCategories() as Promise<ProductCategory[]>,
        canListMachines ? (apiClient.listMachines(organizationId) as Promise<Machine[]>) : Promise.resolve([]),
        apiClient.listProducts() as Promise<Product[]>,
      ]);
      const subcategoryLists = await Promise.all(
        categories.map((c) => apiClient.listProductSubcategories(c.id) as Promise<ProductSubcategory[]>),
      );
      const [responseEntries, auctionEntries] = await Promise.all([
        Promise.all(
          requirements.map(async (r) => {
            try {
              return [r.id, (await apiClient.getMyResponse(organizationId, r.id)) as QuotationResponse] as const;
            } catch {
              return null;
            }
          }),
        ),
        Promise.all(
          requirements.map(async (r) => {
            try {
              const auction = (await apiClient.getActiveAuctionForRequirement(
                organizationId,
                r.id,
              )) as Auction;
              return [r.id, auction] as const;
            } catch {
              return null;
            }
          }),
        ),
      ]);

      const productsById = new Map(products.map((p) => [p.id, p]));
      const subcategoryIdsByMachine = machines
        .map((m) => productsById.get(m.productId)?.productSubcategoryId)
        .filter((id): id is string => Boolean(id));
      const stockedSubcategoryIds = new Set(subcategoryIdsByMachine);
      const machineCountBySubcategory = new Map<string, number>();
      for (const id of subcategoryIdsByMachine) {
        machineCountBySubcategory.set(id, (machineCountBySubcategory.get(id) ?? 0) + 1);
      }

      setData({
        requirements,
        responses: new Map(responseEntries.filter((e): e is readonly [string, QuotationResponse] => e !== null)),
        activeAuctions: new Map(auctionEntries.filter((e): e is readonly [string, Auction] => e !== null)),
        subcategoriesById: new Map(subcategoryLists.flat().map((s) => [s.id, s])),
        stockedSubcategoryIds,
        machineCountBySubcategory,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load open market");
    }
  }

  useEffect(() => {
    void load();
  }, [organizationId, canListMachines]);

  useEffect(() => {
    if (highlightedRequirementId) setRespondingId(highlightedRequirementId);
  }, [highlightedRequirementId]);

  async function handleRespond(event: FormEvent<HTMLFormElement>, requirementId: string) {
    event.preventDefault();
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const interested = form.get("interested") === "yes";
    try {
      await apiClient.submitResponse(organizationId, requirementId, {
        status: interested ? "interested" : "not_interested",
        indicativeRate: interested ? Number(form.get("indicativeRate")) : undefined,
        indicativeRateUnit: interested
          ? (String(form.get("indicativeRateUnit")) as "shift" | "day" | "week" | "month")
          : undefined,
        notes: form.get("notes") ? String(form.get("notes")) : undefined,
      });
      setRespondingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit response");
    }
  }

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data.requirements].sort(
      (a, b) => daysUntil(a.validityDate) - daysUntil(b.validityDate),
    );
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return sorted.filter((r) => {
      if (onlyStocked && !data.stockedSubcategoryIds.has(r.productSubcategoryId)) return false;
      if (r.status !== "open") return filter === "closed";
      if (filter === "closed") return false;
      const hasResponse = data.responses.has(r.id);
      const inAuction = data.activeAuctions.has(r.id);
      if (filter === "needs_response") return !hasResponse;
      if (filter === "responded") return hasResponse;
      if (filter === "in_auction") return inAuction;
      return true;
    });
  }, [sorted, data, filter, onlyStocked]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Loading open market…" />;

  const openCount = data.requirements.filter((r) => r.status === "open").length;
  const needsResponseCount = data.requirements.filter(
    (r) => r.status === "open" && !data.responses.has(r.id),
  ).length;
  const respondedCount = data.requirements.filter((r) => data.responses.has(r.id)).length;
  const inAuctionCount = data.requirements.filter((r) => data.activeAuctions.has(r.id)).length;
  const closedCount = data.requirements.filter((r) => r.status !== "open").length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Open market"
        description={`${openCount} open requirements · ${needsResponseCount} still need a response from you`}
      />

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["needs_response", `Needs response · ${needsResponseCount}`],
            ["responded", `Responded · ${respondedCount}`],
            ["in_auction", `In auction · ${inAuctionCount}`],
            ["closed", `Closed · ${closedCount}`],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={[
              "rounded-control border px-3 py-1.5 text-xs font-semibold",
              filter === key
                ? "border-ink-strong bg-ink-strong text-white"
                : "border-border-strong bg-surface text-ink-muted hover:bg-surface-sunk",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-ink-muted">
          <input type="checkbox" checked={onlyStocked} onChange={(e) => setOnlyStocked(e.target.checked)} />
          Only equipment I stock
        </label>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No requirements in this view" />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Requirement</Th>
              <Th>Project &amp; location</Th>
              <Th>Start &amp; duration</Th>
              <Th>Validity</Th>
              <Th>Status</Th>
              <Th>Action</Th>
            </Tr>
          </Thead>
          <Tbody>
            {filtered.map((req) => {
              const subcategory = data.subcategoriesById.get(req.productSubcategoryId);
              const response = data.responses.get(req.id);
              const auction = data.activeAuctions.get(req.id);
              return (
                <Tr key={req.id}>
                  <Td>
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-ink">
                        {subcategory?.name ?? "Equipment"}
                        {req.capacity ? ` · ${req.capacity}${req.capacityUnit ? ` ${req.capacityUnit}` : ""}` : ""}
                      </span>
                      <span className="text-xs text-meta">Qty {req.quantity}</span>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-col">
                      <span className="text-xs text-ink">{req.projectName ?? "—"}</span>
                      <span className="text-xs text-meta">{req.projectLocation ?? "—"}</span>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-col font-mono text-xs">
                      <span>{formatDate(req.requestedStartDate)}</span>
                      <span className="text-meta">
                        {req.expectedDurationValue
                          ? `${req.expectedDurationValue} ${req.expectedDurationUnit}(s)`
                          : "—"}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={validityTone(req.validityDate)}>{formatDate(req.validityDate)}</Badge>
                  </Td>
                  <Td>
                    {auction ? (
                      <Badge tone="info">In auction</Badge>
                    ) : (
                      <Badge tone={req.status === "open" ? "success" : "neutral"}>{req.status}</Badge>
                    )}
                  </Td>
                  <Td>
                    {auction ? (
                      <Link href={`/auctions?requirementId=${req.id}`} className="text-xs font-medium text-accent-text">
                        Place bid
                      </Link>
                    ) : req.status !== "open" ? (
                      <span className="text-xs text-meta">Closed</span>
                    ) : response ? (
                      <button
                        type="button"
                        onClick={() => setRespondingId(respondingId === req.id ? null : req.id)}
                        className="text-xs font-medium text-accent-text"
                      >
                        Update response
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRespondingId(respondingId === req.id ? null : req.id)}
                        className="text-xs font-semibold text-accent-text"
                      >
                        Respond
                      </button>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      )}

      {(() => {
        // A modal instead of a row appended after the whole table — with
        // many requirements, "Respond" on an early row used to open a form
        // anchored at the very bottom, forcing a scroll to reach it.
        const req = respondingId ? data.requirements.find((r) => r.id === respondingId) : undefined;
        const response = req ? data.responses.get(req.id) : undefined;
        const subcategoryName = req
          ? (data.subcategoriesById.get(req.productSubcategoryId)?.name ?? "requirement")
          : "requirement";
        // Only meaningful for a role that can actually see the org's fleet
        // (equipment.manage) — omitted rather than shown as "0" for anyone
        // else, same as the "only equipment I stock" filter above.
        const machineCount = req && canListMachines ? (data.machineCountBySubcategory.get(req.productSubcategoryId) ?? 0) : null;
        // Locked to the requirement's own unit when it has one — see
        // QuotationResponseService.submitResponse; the server enforces this
        // regardless, this just avoids showing a picker whose choice would
        // be silently overridden.
        const lockedUnit = req?.expectedDurationUnit ?? null;
        return (
          <Dialog
            open={Boolean(respondingId)}
            onClose={() => setRespondingId(null)}
            title={`Respond to ${subcategoryName}`}
          >
            {req && (
              <>
                {response && (
                  <p className="mb-3 text-sm text-meta">
                    Current response: <StatusBadge status={response.status} map={RESPONSE_STATUS_MAP} />{" "}
                    {response.indicativeRate
                      ? `${response.indicativeRate} / ${response.indicativeRateUnit}`
                      : ""}
                  </p>
                )}
                {machineCount != null && machineCount < req.quantity && (
                  <p className="mb-3 text-sm text-warning">
                    You have {machineCount} matching machine{machineCount === 1 ? "" : "s"} registered —
                    this requirement needs {req.quantity}.
                  </p>
                )}
                <form onSubmit={(e) => void handleRespond(e, req.id)} className="flex flex-col gap-3 text-left">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-ink-muted">
                      <input type="radio" name="interested" value="yes" defaultChecked required />
                      Interested
                    </label>
                    <label className="flex items-center gap-2 text-sm text-ink-muted">
                      <input type="radio" name="interested" value="no" required />
                      Not interested
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Rate" name="indicativeRate" type="number" step="0.01" />
                    {lockedUnit ? (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-ink-muted">Unit</span>
                        <p className="flex h-[34px] items-center text-sm text-ink capitalize">{lockedUnit}</p>
                        <input type="hidden" name="indicativeRateUnit" value={lockedUnit} />
                      </div>
                    ) : (
                      <Select
                        label="Unit"
                        name="indicativeRateUnit"
                        options={[
                          { value: "shift", label: "Shift" },
                          { value: "day", label: "Day" },
                          { value: "week", label: "Week" },
                          { value: "month", label: "Month" },
                        ]}
                      />
                    )}
                  </div>
                  <Input label="Notes" name="notes" />
                  <div className="flex justify-end gap-2 pt-1">
                    <Button type="button" variant="secondary" onClick={() => setRespondingId(null)}>
                      Cancel
                    </Button>
                    <Button type="submit">Submit</Button>
                  </div>
                </form>
              </>
            )}
          </Dialog>
        );
      })()}
    </div>
  );
}
