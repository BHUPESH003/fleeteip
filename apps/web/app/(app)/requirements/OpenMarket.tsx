"use client";

import { AuctionStatus, type Auction } from "@fleetip/contracts/auction";
import type { Product } from "@fleetip/contracts/catalogue";
import { MachineStatus, type Machine } from "@fleetip/contracts/equipment";
import type { QuotationResponse } from "@fleetip/contracts/quotation";
import type { Requirement } from "@fleetip/contracts/rfq";
import {
  AttentionStrip,
  Badge,
  Button,
  CellStack,
  Checkbox,
  EmptyState,
  ErrorState,
  Menu,
  PageBody,
  PageHeader,
  Pagination,
  Table,
  TableFooter,
  TableSkeleton,
  TableToolbar,
  TabPanel,
  Tabs,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  UILink,
  cx,
  useToast,
  type MenuItem,
} from "@fleetip/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { apiClient } from "../../../lib/api-client";
import { useConnection } from "../../../lib/connection";
import { describeError } from "../../../lib/errors";
import { formatDate, formatRate, todayIsoDate } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { Status, statusLabel } from "../../../lib/status";
import { optional, useLoad } from "../../../lib/use-load";
import { RespondDialog } from "./RespondDialog";
import { SearchField, directed, pageSlice, PAGE_SIZE, useListState, useSticky } from "./list-kit";
import {
  durationLabel,
  equipmentLine,
  loadSubcategoryIndex,
  quantityLine,
  requirementRef,
  subcategoryName,
  validityInfo,
  type SubcategoryEntry,
} from "./shared";

type View = "needs_response" | "responded" | "in_auction" | "all";
const VIEWS: View[] = ["needs_response", "responded", "in_auction", "all"];

interface MarketData {
  requirements: Requirement[];
  responses: Map<string, QuotationResponse>;
  /** The requirement's non-cancelled auction, when there is one (getActiveAuctionForRequirement). */
  auctions: Map<string, Auction>;
  subcategories: Map<string, SubcategoryEntry>;
  /** Non-retired machines per subcategory. null when the role can't see the fleet (equipment.manage). */
  machineCounts: Map<string, number> | null;
}

interface Access {
  machines: boolean;
  auctions: boolean;
  quotations: boolean;
}

async function loadMarket(organizationId: string, access: Access): Promise<MarketData> {
  const [requirements, subcategories, machines, products] = await Promise.all([
    apiClient.discoverRequirements(organizationId) as Promise<Requirement[]>,
    loadSubcategoryIndex(),
    // Fleet counts are enrichment, not this page's purpose (rfq.respond is):
    // a role without equipment.manage still gets a working Open Market, just
    // no "only equipment I stock" filter and no shortfall hint.
    optional(access.machines, () => apiClient.listMachines(organizationId) as Promise<Machine[]>, null as Machine[] | null),
    optional(access.machines, () => apiClient.listProducts() as Promise<Product[]>, [] as Product[]),
  ]);
  const [responseEntries, auctionEntries] = await Promise.all([
    Promise.all(
      requirements.map(async (r) => {
        try {
          return [r.id, (await apiClient.getMyResponse(organizationId, r.id)) as QuotationResponse] as const;
        } catch {
          // 404 = no response from this company yet.
          return null;
        }
      }),
    ),
    Promise.all(
      requirements.map((r) =>
        // auction.participate only; a 404 means no auction on this requirement.
        optional(
          access.auctions,
          async () => [r.id, (await apiClient.getActiveAuctionForRequirement(organizationId, r.id)) as Auction] as const,
          null as (readonly [string, Auction]) | null,
        ),
      ),
    ),
  ]);

  let machineCounts: Map<string, number> | null = null;
  if (machines) {
    const productSubcategory = new Map(products.map((p) => [p.id, p.productSubcategoryId]));
    machineCounts = new Map();
    for (const machine of machines) {
      if (machine.status === MachineStatus.retired) continue;
      const sub = productSubcategory.get(machine.productId);
      if (sub) machineCounts.set(sub, (machineCounts.get(sub) ?? 0) + 1);
    }
  }

  return {
    requirements,
    responses: new Map(responseEntries.filter((e): e is readonly [string, QuotationResponse] => e !== null)),
    auctions: new Map(auctionEntries.filter((e): e is readonly [string, Auction] => e !== null)),
    subcategories,
    machineCounts,
  };
}

const auctionRunning = (auction: Auction | undefined) => auction?.status === AuctionStatus.live || auction?.status === AuctionStatus.scheduled;

export function OpenMarket({ organizationId }: { organizationId: string }) {
  const { hasPermission } = useSession();
  const { online } = useConnection();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const access: Access = {
    machines: hasPermission("equipment.manage"),
    auctions: hasPermission("auction.participate"),
    quotations: hasPermission("quotation.manage"),
  };
  const list = useListState("requirements", { sort: "validity", dir: "asc" });
  const { get, set, search, activeQuery, sortKey, dir, page, setPage, toggleSort, sortDirection } = list;

  const { data, error, loading, reload, setData } = useLoad(
    () => loadMarket(organizationId, access),
    [organizationId, access.machines, access.auctions],
  );
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const viewParam = get("view");
  const view: View = (VIEWS as string[]).includes(viewParam) ? (viewParam as View) : "needs_response";
  const onlyStocked = get("stocked") === "1" && access.machines;

  // ?requirementId= opens the respond dialog for that requirement. An
  // effect keyed on the param (never a useState initializer — the App
  // Router doesn't remount on a query-only change), run once the list has
  // loaded, then the param is stripped so the same link works twice.
  const requirementIdParam = searchParams.get("requirementId");
  useEffect(() => {
    if (!requirementIdParam || !data) return;
    const found = data.requirements.find((r) => r.id === requirementIdParam);
    if (found && data.responses.get(found.id)?.quotationRequestedAt) {
      toast.info({
        title: `Your response to ${requirementRef(found.id)} is locked`,
        body: "The customer asked for a formal quotation on it. Put any new rate or terms in the quotation.",
      });
    } else if (found) setRespondingId(found.id);
    else
      toast.info({
        title: `${requirementRef(requirementIdParam)} isn't open for responses`,
        body: "It may have closed, been cancelled or passed its validity date.",
      });
    const next = new URLSearchParams(searchParams.toString());
    next.delete("requirementId");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [requirementIdParam, data]);

  const today = todayIsoDate();
  const requirements = useMemo(() => data?.requirements ?? [], [data]);

  const counts = useMemo(() => {
    const out: Record<View, number> = { needs_response: 0, responded: 0, in_auction: 0, all: requirements.length };
    if (!data) return out;
    for (const r of requirements) {
      if (data.responses.has(r.id)) out.responded += 1;
      else out.needs_response += 1;
      if (auctionRunning(data.auctions.get(r.id))) out.in_auction += 1;
    }
    return out;
  }, [data, requirements]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const out = requirements.filter((r) => {
      const response = data.responses.get(r.id);
      if (view === "needs_response" && response) return false;
      if (view === "responded" && !response) return false;
      if (view === "in_auction" && !auctionRunning(data.auctions.get(r.id))) return false;
      if (onlyStocked && !(data.machineCounts?.get(r.productSubcategoryId) ?? 0)) return false;
      if (activeQuery) {
        const haystack = [
          requirementRef(r.id),
          equipmentLine(r, subcategoryName(data.subcategories, r.productSubcategoryId)),
          r.projectName,
          r.projectLocation,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(activeQuery)) return false;
      }
      return true;
    });
    const compare =
      sortKey === "start"
        ? (a: Requirement, b: Requirement) => a.requestedStartDate.localeCompare(b.requestedStartDate)
        : sortKey === "posted"
          ? (a: Requirement, b: Requirement) => a.createdAt.localeCompare(b.createdAt)
          : (a: Requirement, b: Requirement) => a.validityDate.localeCompare(b.validityDate);
    return [...out].sort(directed(compare, dir));
  }, [data, requirements, view, onlyStocked, activeQuery, sortKey, dir]);

  const pageView = pageSlice(filtered, page);
  const closingNoReply = data
    ? requirements.filter((r) => !data.responses.has(r.id) && validityInfo(r.validityDate, today).days <= 3).length
    : 0;
  const filtersOn = Boolean(onlyStocked || activeQuery);

  function clearFilters() {
    search.setValue("");
    set({ stocked: null, q: null });
  }

  const responding = respondingId && data ? (data.requirements.find((r) => r.id === respondingId) ?? null) : null;
  const respondTarget = useSticky(responding);

  function rowActions(r: Requirement): { visible: ReactNode; menu: MenuItem[] } {
    const response = data?.responses.get(r.id);
    const auction = data?.auctions.get(r.id);
    const respondLabel = response ? "Update response" : "Respond";
    // Frozen once the customer asks for a quotation on it (the API refuses changes).
    const locked = Boolean(response?.quotationRequestedAt);
    const respondItem: MenuItem = {
      key: "respond",
      label: respondLabel,
      icon: "edit",
      disabled: !online || locked,
      hint: !online
        ? "You're offline."
        : locked
          ? "Locked: the customer asked for a quotation on it. Put any new rate or terms in the quotation."
          : response
            ? "Change your answer or rate. The customer sees the latest."
            : "Interested or not, with an indicative rate.",
      onSelect: () => setRespondingId(r.id),
    };
    const auctionItem: MenuItem | null = auction
      ? {
          key: "auction",
          label: auctionRunning(auction) ? "Open auction" : "View auction",
          icon: "auction",
          href: `/auctions?requirementId=${r.id}&auctionId=${auction.id}`,
          hint: auctionRunning(auction) ? "Ask to join or place bids." : `The auction is ${statusLabel("auction", auction.status)}.`,
        }
      : null;
    const menu: MenuItem[] = [];
    let visible: ReactNode;
    if (auction && auctionRunning(auction)) {
      visible = (
        <UILink
          href={`/auctions?requirementId=${r.id}&auctionId=${auction.id}`}
          className="inline-flex h-7 items-center whitespace-nowrap rounded-cell border border-border-control bg-surface px-[11px] text-xs font-medium text-ink-strong no-underline hover:bg-surface-hover"
        >
          Open auction
        </UILink>
      );
      menu.push(respondItem);
    } else if (locked && access.quotations) {
      visible = (
        <UILink
          href={`/quotations?requirementId=${r.id}`}
          className="inline-flex h-7 items-center whitespace-nowrap rounded-cell border border-border-control bg-surface px-[11px] text-xs font-medium text-ink-strong no-underline hover:bg-surface-hover"
        >
          Create quotation
        </UILink>
      );
      menu.push(respondItem);
      if (auctionItem) menu.push(auctionItem);
    } else {
      visible = (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setRespondingId(r.id)}
          disabled={!online || locked}
          title={!online ? "You're offline." : locked ? respondItem.hint : undefined}
        >
          {respondLabel}
        </Button>
      );
      if (auctionItem) menu.push(auctionItem);
    }
    if (access.quotations) {
      menu.push({
        key: "quote",
        label: "Create quotation",
        icon: "quotation",
        href: `/quotations?requirementId=${r.id}`,
        disabled: !online,
        hint: response?.quotationRequestedAt
          ? "The customer asked you for one. Dates and rate unit come from the requirement."
          : "A formal quotation tied to this requirement. Dates and rate unit come from it.",
      });
    }
    menu.push({ key: "open", label: "Open requirement", icon: "requirement", href: `/requirements/${r.id}` });
    return { visible, menu };
  }

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title="Open market"
        description="Requirements posted by renters on FleetIP. Reply with an indicative rate; the customer may then ask you for a formal quotation."
      />
      <PageBody>
        <AttentionStrip
          items={[
            {
              key: "closing",
              count: closingNoReply,
              text: `${closingNoReply === 1 ? "requirement stops" : "requirements stop"} taking responses within 3 days and you haven't replied`,
              onClick: () => set({ view: null, sort: "validity", dir: "asc" }),
            },
          ]}
        />

        <section aria-label="Open requirements" className="min-w-0 overflow-hidden rounded-panel border border-border-strong bg-surface">
          <h2 className="sr-only">Open requirements</h2>
          <Tabs
            variant="card"
            label="Requirement views"
            idBase="market"
            active={view}
            onChange={(key) => set({ view: key === "needs_response" ? null : key })}
            items={[
              { key: "needs_response", label: "Needs response", count: data ? counts.needs_response : undefined },
              { key: "responded", label: "Responded", count: data ? counts.responded : undefined },
              { key: "in_auction", label: "In auction", count: data ? counts.in_auction : undefined },
              { key: "all", label: "All open", count: data ? counts.all : undefined },
            ]}
          />
          <TabPanel idBase="market" tabKey={view}>
            <TableToolbar>
              <SearchField search={search} label="Search requirements" placeholder="Reference, equipment, project or site" />
              <Checkbox
                label="Only equipment I stock"
                checked={onlyStocked}
                disabled={!access.machines}
                description={access.machines ? undefined : "Needs the Equipment permission to read your fleet."}
                onChange={(event) => set({ stocked: event.target.checked ? "1" : null })}
              />
              {filtersOn && (
                <Button variant="tertiary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </TableToolbar>

            {error ? (
              <div className="p-4">
                <ErrorState
                  title="The open market didn't load"
                  message={describeError(error).body}
                  action={
                    <Button variant="secondary" size="sm" icon="refresh" onClick={() => void reload()}>
                      Try again
                    </Button>
                  }
                />
              </div>
            ) : !loading && requirements.length === 0 ? (
              <EmptyState
                variant="page"
                icon="requirement"
                title="No open requirements right now"
                description="Requirements appear here while they're open and before their validity date. Check back later."
              />
            ) : !loading && filtered.length === 0 ? (
              <EmptyState
                title={
                  filtersOn
                    ? "No requirements match these filters"
                    : view === "needs_response"
                      ? "You've replied to every open requirement"
                      : view === "responded"
                        ? "You haven't replied to any open requirement yet"
                        : "No open requirement has an auction running"
                }
                description={filtersOn ? [activeQuery && `“${get("q")}”`, onlyStocked && "Only equipment I stock"].filter(Boolean).join(" · ") : undefined}
                action={
                  filtersOn ? (
                    <Button variant="secondary" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <Table bare minWidth={1080} caption="Open requirements">
                <Thead>
                  <Tr>
                    <Th className="w-[130px]" onSort={() => toggleSort("posted")} sortDirection={sortDirection("posted")}>
                      Requirement
                    </Th>
                    <Th>Equipment</Th>
                    <Th>Project and site</Th>
                    <Th className="w-[140px]" onSort={() => toggleSort("start")} sortDirection={sortDirection("start")}>
                      Needed from
                    </Th>
                    <Th className="w-[150px]" onSort={() => toggleSort("validity")} sortDirection={sortDirection("validity")}>
                      Responses until
                    </Th>
                    <Th className="w-[170px]">Your reply</Th>
                    <Th className="w-[200px]">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </Tr>
                </Thead>
                {loading ? (
                  <TableSkeleton columns={7} rows={8} label="Loading the open market" />
                ) : (
                  <Tbody>
                    {pageView.rows.map((r) => {
                      const response = data?.responses.get(r.id);
                      const auction = data?.auctions.get(r.id);
                      const validity = validityInfo(r.validityDate, today);
                      const actions = rowActions(r);
                      return (
                        <Tr key={r.id}>
                          <Td className="whitespace-nowrap">
                            <UILink
                              href={`/requirements/${r.id}`}
                              className="font-mono text-xs font-medium text-accent-text no-underline hover:text-accent-text-hover hover:underline"
                            >
                              {requirementRef(r.id)}
                            </UILink>
                          </Td>
                          <Td>
                            <CellStack
                              title={equipmentLine(r, data ? subcategoryName(data.subcategories, r.productSubcategoryId) : null)}
                              sub={quantityLine(r)}
                            />
                          </Td>
                          <Td>
                            <CellStack title={r.projectName ?? "Project not named"} sub={r.projectLocation ?? "Site not given"} />
                          </Td>
                          <Td>
                            <CellStack
                              mono
                              title={formatDate(r.requestedStartDate)}
                              sub={durationLabel(r.expectedDurationValue, r.expectedDurationUnit) ?? "Duration not given"}
                            />
                          </Td>
                          <Td>
                            <div className="flex flex-col gap-0.5">
                              <span className="font-mono text-xs font-medium text-ink-strong">{formatDate(r.validityDate)}</span>
                              <span className={cx("text-[11px] leading-tight", validity.className)}>{validity.label}</span>
                            </div>
                          </Td>
                          <Td>
                            <div className="flex flex-col items-start gap-1">
                              {response ? (
                                <>
                                  <Status domain="quotation_response" value={response.status} size="sm" />
                                  {response.indicativeRate != null && response.indicativeRateUnit && (
                                    <span className="font-mono text-[11px] text-meta">{formatRate(response.indicativeRate, response.indicativeRateUnit)}</span>
                                  )}
                                  {response.quotationRequestedAt && (
                                    <Badge variant="label" tone="warning" title="Worked out from the customer's request — not a stored status">
                                      Quotation asked for
                                    </Badge>
                                  )}
                                </>
                              ) : (
                                <span className="text-xs text-meta-light">No reply yet</span>
                              )}
                              {auction && (
                                <span className="inline-flex items-center gap-1.5 text-[11px] text-meta">
                                  Auction <Status domain="auction" value={auction.status} size="sm" />
                                </span>
                              )}
                            </div>
                          </Td>
                          <Td>
                            <div className="flex items-center justify-end gap-2">
                              {actions.visible}
                              <Menu label={`More actions for ${requirementRef(r.id)}`} items={actions.menu} triggerSize="sm" width={300} />
                            </div>
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                )}
              </Table>
            )}

            {!error && !loading && filtered.length > 0 && (
              <TableFooter>
                <span className="text-xs text-meta">Sorted by {sortKey === "start" ? "start date" : sortKey === "posted" ? "posting date" : "validity date"}</span>
                <Pagination page={pageView.page} pageCount={pageView.pageCount} onPageChange={setPage} total={pageView.total} pageSize={PAGE_SIZE} noun="requirements" />
              </TableFooter>
            )}
          </TabPanel>
        </section>
      </PageBody>

      {respondTarget && data && (
        <RespondDialog
          key={respondTarget.id}
          open={responding !== null}
          onClose={() => setRespondingId(null)}
          organizationId={organizationId}
          requirement={respondTarget}
          subcategoryName={subcategoryName(data.subcategories, respondTarget.productSubcategoryId)}
          existing={data.responses.get(respondTarget.id) ?? null}
          machineCount={data.machineCounts ? (data.machineCounts.get(respondTarget.productSubcategoryId) ?? 0) : null}
          onSaved={(saved) =>
            setData((previous) =>
              previous ? { ...previous, responses: new Map(previous.responses).set(saved.requirementId, saved) } : previous,
            )
          }
        />
      )}
    </div>
  );
}
