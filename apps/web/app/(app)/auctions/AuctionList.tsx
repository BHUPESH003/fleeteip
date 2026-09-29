"use client";

import type { AuctionSummary } from "@fleetip/contracts/auction";
import { RequirementStatus, type Requirement } from "@fleetip/contracts/rfq";
import {
  AttentionStrip,
  Badge,
  Button,
  CellStack,
  EmptyState,
  ErrorState,
  PageBody,
  PageHeader,
  Pagination,
  Select,
  Table,
  TableFooter,
  TableSkeleton,
  TableToolbar,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  UILink,
  cx,
} from "@fleetip/ui";
import { useMemo, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { useConnection } from "../../../lib/connection";
import { describeError, OFFLINE_HINT } from "../../../lib/errors";
import { formatDateTime, formatMoney, plural } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { Status, statusLabel, statusOptions } from "../../../lib/status";
import { optional, useLoad } from "../../../lib/use-load";
import { SearchField, directed, pageSlice, PAGE_SIZE, useListState } from "../requirements/list-kit";
import { equipmentLine, loadSubcategoryIndex, requirementRef } from "../requirements/shared";
import { CreateAuctionDialog } from "./CreateAuctionDialog";
import { useTicker } from "./polling";
import { DIRECTION, auctionRef, timing } from "./shared";

interface ListData {
  auctions: AuctionSummary[];
  /** Renter with rfq.manage: its requirements, for the equipment line and the "Start auction" picker. */
  requirements: Map<string, { requirement: Requirement; label: string }> | null;
}

async function loadList(organizationId: string, isRenter: boolean, canListRequirements: boolean): Promise<ListData> {
  const [auctions, requirements, index] = await Promise.all([
    // One row per auction the Renter owns, or the Rental Company takes part
    // in — with needsAttention worked out server-side (no N+1 detail calls).
    apiClient.listAuctionsForOrganization(organizationId) as Promise<AuctionSummary[]>,
    optional(isRenter && canListRequirements, () => apiClient.listRequirements(organizationId) as Promise<Requirement[]>, null as Requirement[] | null),
    isRenter && canListRequirements ? loadSubcategoryIndex() : Promise.resolve(null),
  ]);
  return {
    auctions,
    requirements: requirements
      ? new Map(
          requirements.map((r) => [r.id, { requirement: r, label: equipmentLine(r, index?.get(r.productSubcategoryId)?.subcategory.name) }]),
        )
      : null,
  };
}

export function AuctionList({ organizationId, viewer }: { organizationId: string; viewer: "renter" | "rental_company" }) {
  const { hasPermission } = useSession();
  const { online } = useConnection();
  const isRenter = viewer === "renter";
  const canListRequirements = hasPermission("rfq.manage");
  const list = useListState("auctions", { sort: "starts", dir: "desc" });
  const { get, set, search, activeQuery, sortKey, dir, page, setPage, toggleSort, sortDirection } = list;
  const { data, error, loading, reload } = useLoad(() => loadList(organizationId, isRenter, canListRequirements), [organizationId, isRenter, canListRequirements]);
  const [createOpen, setCreateOpen] = useState(false);
  const now = useTicker();

  const status = get("status");
  const attention = get("attention") === "1";
  const auctions = useMemo(() => data?.auctions ?? [], [data]);

  const filtered = useMemo(() => {
    const rows = auctions.filter((a) => {
      if (status && a.status !== status) return false;
      if (attention && !a.needsAttention) return false;
      if (activeQuery) {
        const haystack = [auctionRef(a.id), requirementRef(a.requirementId), a.requirementProjectName, data?.requirements?.get(a.requirementId)?.label]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(activeQuery)) return false;
      }
      return true;
    });
    const compare =
      sortKey === "ends"
        ? (a: AuctionSummary, b: AuctionSummary) => a.endsAt.localeCompare(b.endsAt)
        : (a: AuctionSummary, b: AuctionSummary) => a.startsAt.localeCompare(b.startsAt);
    return [...rows].sort(directed(compare, dir));
  }, [auctions, status, attention, activeQuery, sortKey, dir, data]);

  const pageView = pageSlice(filtered, page);
  const filtersOn = Boolean(status || attention || activeQuery);
  const attentionCount = auctions.filter((a) => a.needsAttention).length;
  const openRequirements = data?.requirements ? [...data.requirements.values()].filter(({ requirement }) => requirement.status === RequirementStatus.open) : null;

  function clearFilters() {
    search.setValue("");
    set({ status: null, attention: null, q: null });
  }

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title="Auctions"
        description={
          isRenter
            ? "Time-bound bidding on one of your requirements. You approve who bids, then pick who to proceed with."
            : "Auctions you've asked to join. Bid while they're live; if the owner selects you, send your quotation."
        }
        actions={
          isRenter ? (
            <Button
              icon="plus"
              onClick={() => setCreateOpen(true)}
              disabled={!online || !canListRequirements}
              title={!online ? OFFLINE_HINT : !canListRequirements ? "Choosing a requirement needs the Requirements permission. Start one from the requirement's page." : undefined}
            >
              Start auction
            </Button>
          ) : undefined
        }
      />
      <PageBody>
        <AttentionStrip
          items={[
            {
              key: "attention",
              count: attentionCount,
              text: isRenter
                ? `closed ${attentionCount === 1 ? "auction has" : "auctions have"} no participant selected yet`
                : `${attentionCount === 1 ? "auction has" : "auctions have"} selected you — send your quotation`,
              onClick: () => set({ attention: "1", status: null }),
            },
          ]}
        />

        <section aria-label="Auctions" className="min-w-0 overflow-hidden rounded-panel border border-border-strong bg-surface">
          <TableToolbar>
            <SearchField search={search} label="Search auctions" placeholder="Auction, requirement or project" />
            <Select
              size="sm"
              aria-label="Status"
              className="w-[150px] max-[760px]:w-full"
              placeholder="Any status"
              options={statusOptions("auction")}
              value={status}
              onChange={(event) => set({ status: event.target.value || null })}
            />
            <Select
              size="sm"
              aria-label="Needs your action"
              className="w-[200px] max-[760px]:w-full"
              placeholder="Your action: any"
              options={[{ value: "1", label: isRenter ? "Needs a participant selected" : "Selected — send a quotation" }]}
              value={attention ? "1" : ""}
              onChange={(event) => set({ attention: event.target.value || null })}
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
                title="Auctions didn't load"
                message={describeError(error).body}
                action={
                  <Button variant="secondary" size="sm" icon="refresh" onClick={() => void reload()}>
                    Try again
                  </Button>
                }
              />
            </div>
          ) : !loading && auctions.length === 0 ? (
            <EmptyState
              variant="page"
              icon="auction"
              title={isRenter ? "No auctions yet" : "You haven't joined an auction yet"}
              description={
                isRenter
                  ? "Start one on an open requirement: rental companies ask to join, you approve who bids, and when it closes you pick who to proceed with."
                  : "Requirements with an auction show “In auction” in the Open Market. Ask to join from there; the owner approves who bids."
              }
              action={
                isRenter ? (
                  <Button variant="secondary" icon="plus" onClick={() => setCreateOpen(true)} disabled={!online || !canListRequirements}>
                    Start auction
                  </Button>
                ) : (
                  <UILink href="/requirements?view=in_auction" className="text-sm font-medium text-accent-text hover:underline">
                    Open market — in auction
                  </UILink>
                )
              }
            />
          ) : !loading && filtered.length === 0 ? (
            <EmptyState
              title="No auctions match these filters"
              description={[activeQuery && `“${get("q")}”`, status && statusLabel("auction", status), attention && "Needs your action"].filter(Boolean).join(" · ")}
              action={
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <Table bare minWidth={1000} caption="Auctions">
              <Thead>
                <Tr>
                  <Th className="w-[130px]">Auction</Th>
                  <Th>Requirement</Th>
                  <Th className="w-[160px]">Bidding</Th>
                  <Th align="right" className="w-[130px]">
                    Base price
                  </Th>
                  <Th className="w-[200px]" onSort={() => toggleSort("starts")} sortDirection={sortDirection("starts")}>
                    Window
                  </Th>
                  <Th className="w-[130px]">{isRenter ? "Participants" : "Your status"}</Th>
                  <Th className="w-[210px]" onSort={() => toggleSort("ends")} sortDirection={sortDirection("ends")}>
                    Status
                  </Th>
                </Tr>
              </Thead>
              {loading ? (
                <TableSkeleton columns={7} rows={8} label="Loading auctions" />
              ) : (
                <Tbody>
                  {pageView.rows.map((a) => {
                    const when = timing(a, now);
                    const requirementInfo = data?.requirements?.get(a.requirementId);
                    return (
                      <Tr key={a.id}>
                        <Td className="whitespace-nowrap">
                          <UILink
                            href={`/auctions?requirementId=${a.requirementId}&auctionId=${a.id}`}
                            className="font-mono text-xs font-medium text-accent-text no-underline hover:text-accent-text-hover hover:underline"
                          >
                            {auctionRef(a.id)}
                          </UILink>
                        </Td>
                        <Td>
                          <CellStack
                            title={requirementInfo?.label ?? a.requirementProjectName ?? requirementRef(a.requirementId)}
                            sub={[requirementRef(a.requirementId), requirementInfo ? a.requirementProjectName : null].filter(Boolean).join(" · ")}
                          />
                        </Td>
                        <Td className="text-xs">{DIRECTION[a.biddingDirection].rule}</Td>
                        <Td align="right" className="font-mono text-xs font-semibold">
                          {formatMoney(a.basePrice)}
                        </Td>
                        <Td>
                          <CellStack mono title={formatDateTime(a.startsAt)} sub={`to ${formatDateTime(a.endsAt)}`} />
                        </Td>
                        <Td>
                          {isRenter ? (
                            <span className="font-mono text-xs">{a.participantCount != null ? plural(a.participantCount, "company", "companies") : "—"}</span>
                          ) : a.ownParticipantStatus ? (
                            <Status domain="participant" value={a.ownParticipantStatus} size="sm" />
                          ) : (
                            <span className="text-xs text-meta-light">—</span>
                          )}
                        </Td>
                        <Td>
                          <div className="flex flex-col items-start gap-1">
                            <Status domain="auction" value={a.status} size="sm" />
                            {a.needsAttention ? (
                              <Badge variant="label" tone="warning" title="Worked out by FleetIP — not a stored status">
                                {isRenter ? "Select a participant" : "Send your quotation"}
                              </Badge>
                            ) : (
                              <span className={cx("font-mono text-[11px] leading-tight", when.tone === "live" ? "text-attention" : "text-meta-light")}>{when.label}</span>
                            )}
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
              <span className="text-xs text-meta">Status updates when an auction is opened; the times are worked out live.</span>
              <Pagination page={pageView.page} pageCount={pageView.pageCount} onPageChange={setPage} total={pageView.total} pageSize={PAGE_SIZE} noun="auctions" />
            </TableFooter>
          )}
        </section>
      </PageBody>

      {isRenter && (
        <CreateAuctionDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          organizationId={organizationId}
          requirementId={null}
          requirements={data ? openRequirements : undefined}
          onCreated={() => void reload()}
        />
      )}
    </div>
  );
}
