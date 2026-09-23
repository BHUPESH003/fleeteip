"use client";

import type {
  Auction,
  AuctionBid,
  AuctionDetail,
  AuctionEvent,
  BiddingDirection,
} from "@fleetip/contracts/auction";
import type { ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import type { Organization } from "@fleetip/contracts/organization";
import type { Rental } from "@fleetip/contracts/rental";
import type { Requirement } from "@fleetip/contracts/rfq";
import {
  Badge,
  Button,
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
import { useSearchParams } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiClient } from "../../../lib/api-client";
import { downloadCsv } from "../../../lib/csv";
import { formatCurrencyINR, formatDate, formatRelativeTime } from "../../../lib/format";
import { useInterval } from "../../../lib/use-interval";
import { useSession } from "../../../lib/session-context";
import { AUCTION_STATUS_MAP, bidsRemaining, bidTag, formatCountdown, PARTICIPANT_STATUS_MAP } from "./shared";

const AUCTION_POLL_INTERVAL_MS = 5000;
const AUCTION_PRESTART_POLL_WINDOW_MS = 30_000;
const LIVE_POLL_INTERVAL_MS = 4000;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function shouldPollAuction(detail: AuctionDetail | null): boolean {
  if (!detail) return false;
  if (detail.auction.status === "live") return true;
  if (detail.auction.status !== "scheduled") return false;
  return new Date(detail.auction.startsAt).getTime() - Date.now() <= AUCTION_PRESTART_POLL_WINDOW_MS;
}

function msUntilAuctionPollingWindow(detail: AuctionDetail | null): number | null {
  if (!detail || detail.auction.status !== "scheduled") return null;
  return Math.max(new Date(detail.auction.startsAt).getTime() - Date.now() - AUCTION_PRESTART_POLL_WINDOW_MS, 0);
}

function useAuctionPolling(detail: AuctionDetail | null, load: () => Promise<void>) {
  useEffect(() => {
    if (shouldPollAuction(detail)) {
      const interval = window.setInterval(() => void load(), AUCTION_POLL_INTERVAL_MS);
      return () => window.clearInterval(interval);
    }
    const msUntilWindow = msUntilAuctionPollingWindow(detail);
    if (msUntilWindow === null) return;
    const timeout = window.setTimeout(() => void load(), msUntilWindow);
    return () => window.clearTimeout(timeout);
  }, [detail?.auction.id, detail?.auction.status, detail?.auction.startsAt, load]);
}

function useTicker() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  return now;
}

function BidHistoryTable({ bids, ownParticipantId }: { bids: AuctionBid[]; ownParticipantId?: string }) {
  if (bids.length === 0) return <p className="text-sm text-meta">No bids yet.</p>;
  return (
    <Table>
      <Thead>
        <Tr>
          <Th>#</Th>
          <Th>Bidder</Th>
          <Th>Amount</Th>
          <Th>Placed</Th>
          <Th />
        </Tr>
      </Thead>
      <Tbody>
        {bids.map((bid, index) => {
          const tag = bidTag(bid, ownParticipantId, bids);
          return (
            <Tr key={bid.id}>
              <Td className="text-meta">{index + 1}</Td>
              <Td>{bid.rentalCompanyOrganizationName ?? (bid.participantId === ownParticipantId ? "You" : "—")}</Td>
              <Td className="font-mono font-medium">{bid.amount}</Td>
              <Td className="text-meta">{formatDateTime(bid.createdAt)}</Td>
              <Td>
                {tag && (
                  <Badge tone={tag === "Leading" ? "success" : tag === "Outbid" ? "danger" : "neutral"}>{tag}</Badge>
                )}
              </Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
}

function AuctionLogPanel({ events }: { events: { id: string; text: string; when: string }[] }) {
  return (
    <Card className="flex-1">
      <h2 className="mb-3 text-sm font-semibold text-ink">Auction log</h2>
      {events.length === 0 ? (
        <p className="text-sm text-meta">No activity yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((e) => (
            <div key={e.id} className="flex flex-col gap-0.5">
              <span className="text-xs text-ink">{e.text}</span>
              <span className="text-[11px] text-meta-light">{e.when}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Renter (owner): create / monitor / select
// ---------------------------------------------------------------------------

function RenterAuctionPanel({
  organizationId,
  requirement,
  highlightedAuctionId,
}: {
  organizationId: string;
  requirement: Requirement;
  highlightedAuctionId: string | null;
}) {
  const requirementId = requirement.id;
  const [detail, setDetail] = useState<AuctionDetail | null>(null);
  const [events, setEvents] = useState<AuctionEvent[]>([]);
  const [rentalHistory, setRentalHistory] = useState<Rental[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRadio, setSelectedRadio] = useState<string | null>(null);
  const now = useTicker();

  const load = useCallback(async () => {
    try {
      const auctions = (await apiClient.listAuctionsForRequirement(organizationId, requirementId)) as Auction[];
      const active = auctions.find((a) => a.id === highlightedAuctionId) ?? auctions[0];
      if (!active) {
        setDetail(null);
        setLoading(false);
        return;
      }
      const [d, rentals] = await Promise.all([
        apiClient.getAuctionDetail(organizationId, active.id) as Promise<AuctionDetail>,
        apiClient.listRentals(organizationId) as Promise<Rental[]>,
      ]);
      setDetail(d);
      setRentalHistory(rentals);
      if (d.auction.status === "closed") {
        try {
          setEvents((await apiClient.listAuctionEvents(organizationId, d.auction.id)) as AuctionEvent[]);
        } catch {
          setEvents([]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load auction");
    } finally {
      setLoading(false);
    }
  }, [organizationId, requirementId, highlightedAuctionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useAuctionPolling(detail, load);
  useInterval(() => void load(), LIVE_POLL_INTERVAL_MS, detail?.auction.status === "live");

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiClient.createAuction(organizationId, requirementId, {
        biddingDirection: String(form.get("biddingDirection")) as BiddingDirection,
        basePrice: Number(form.get("basePrice")),
        maxBidsPerParticipant: form.get("maxBidsPerParticipant")
          ? Number(form.get("maxBidsPerParticipant"))
          : undefined,
        startsAt: new Date(String(form.get("startsAt"))).toISOString(),
        endsAt: new Date(String(form.get("endsAt"))).toISOString(),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create auction");
    }
  }

  async function handleReview(participantId: string, status: "approved" | "rejected") {
    if (!detail) return;
    setError(null);
    try {
      await apiClient.reviewParticipant(organizationId, detail.auction.id, participantId, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to review participant");
    }
  }

  async function handleSelect() {
    if (!detail || !selectedRadio) return;
    setError(null);
    try {
      await apiClient.selectParticipant(organizationId, detail.auction.id, selectedRadio);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to select participant");
    }
  }

  async function handleClose() {
    if (!detail) return;
    setError(null);
    try {
      await apiClient.closeAuctionEarly(organizationId, detail.auction.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close auction");
    }
  }

  function handleDownloadBidSheet() {
    if (!detail) return;
    downloadCsv(
      `${detail.auction.id.slice(0, 8)}-bids.csv`,
      ["Rental company", "Rank/status", "Amount", "Placed"],
      detail.bids.map((b) => [b.rentalCompanyOrganizationName ?? "", b.isLeading ? "Leading" : "", b.amount, b.createdAt]),
    );
  }

  if (loading) return <LoadingState label="Loading auction…" />;
  if (error) return <ErrorState message={error} />;

  if (!detail) {
    return (
      <Card>
        <h2 className="mb-4 text-sm font-semibold text-ink">Run an auction</h2>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label="Bidding direction"
              name="biddingDirection"
              required
              options={[
                { value: "ascending", label: "Ascending (highest bid wins)" },
                { value: "descending", label: "Descending (lowest bid wins)" },
              ]}
            />
            <Input label="Base price" name="basePrice" type="number" step="0.01" required />
            <Input label="Max bids per participant (optional)" name="maxBidsPerParticipant" type="number" min={1} />
            <Input label="Starts at" name="startsAt" type="datetime-local" required />
            <Input label="Ends at" name="endsAt" type="datetime-local" required />
          </div>
          <div>
            <Button type="submit">Start auction</Button>
          </div>
        </form>
      </Card>
    );
  }

  const { auction, participants, bids, result } = detail;
  const selectedParticipant = participants.find((p) => p.status === "selected");
  const approved = participants.filter((p) => p.status === "approved");
  const rejected = participants.filter((p) => p.status === "rejected");
  const lowestApprovedAmount = Math.min(
    ...approved
      .map((p) => bids.filter((b) => b.participantId === p.id).map((b) => b.amount))
      .flat()
      .filter((n) => Number.isFinite(n)),
  );

  const rentalsByOrg = (orgId: string) => rentalHistory.filter((r) => r.renterOrganizationId === orgId).length;

  if (auction.status === "closed" && !selectedParticipant) {
    // Screen 12: "Auction closed — owner selection"
    return (
      <div className="flex flex-col gap-3.5">
        <PageHeader
          title="Auction closed"
          breadcrumbs={[{ label: "Auctions", href: "/auctions" }, { label: `AU-${auction.id.slice(0, 8).toUpperCase()}` }]}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={handleDownloadBidSheet}>
                Download bid sheet
              </Button>
              <Button disabled={!selectedRadio} onClick={() => void handleSelect()}>
                Select participant
              </Button>
            </div>
          }
        />
        <div className="flex flex-wrap items-center gap-2 text-sm text-meta">
          <Badge tone="neutral">Closed</Badge>
          <Badge tone="danger">Selection pending</Badge>
          <span>
            AU-{auction.id.slice(0, 8).toUpperCase()} · {auction.biddingDirection} · closed{" "}
            {formatDateTime(result?.closedAt ?? auction.updatedAt)} · {approved.length} approved participants,{" "}
            {bids.length} bids
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1fr_330px]">
          <div className="flex flex-col gap-3.5">
            <div className="flex gap-2.5 rounded-panel border border-warning/25 bg-warning-bg px-4 py-3">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-warning">Closing the auction did not award anything</span>
                <span className="text-xs text-warning">
                  Pick the participant you want to proceed with — price is one input, not the decision. Selection
                  opens a negotiation with that company; the quotation and award follow from there.
                </span>
              </div>
            </div>

            <Card padding="none">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold text-ink">Participants &amp; final bids</h2>
                <span className="ml-auto text-xs text-meta">Ranked by best bid · select any approved participant</span>
              </div>
              {participants.length === 0 ? (
                <EmptyState title="No participants" />
              ) : (
                <Table>
                  <Thead>
                    <Tr>
                      <Th />
                      <Th>Rank</Th>
                      <Th>Rental company</Th>
                      <Th>Best bid</Th>
                      <Th>Bids</Th>
                      <Th>Last bid</Th>
                      <Th>Status</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {[...participants]
                      .sort((a, b) => {
                        const aBids = bids.filter((bid) => bid.participantId === a.id).map((bid) => bid.amount);
                        const bBids = bids.filter((bid) => bid.participantId === b.id).map((bid) => bid.amount);
                        const aBest = aBids.length ? Math.min(...aBids) : Infinity;
                        const bBest = bBids.length ? Math.min(...bBids) : Infinity;
                        return aBest - bBest;
                      })
                      .map((p, index) => {
                        const ownBids = bids.filter((b) => b.participantId === p.id);
                        const bestAmount = ownBids.length ? Math.min(...ownBids.map((b) => b.amount)) : null;
                        const lastBid = ownBids[ownBids.length - 1];
                        const isLowest =
                          p.status === "approved" && bestAmount !== null && bestAmount === lowestApprovedAmount;
                        const pastRentals = rentalsByOrg(p.rentalCompanyOrganizationId);
                        return (
                          <Tr key={p.id}>
                            <Td>
                              {p.status === "approved" && (
                                <input
                                  type="radio"
                                  name="selectedParticipant"
                                  checked={selectedRadio === p.id}
                                  onChange={() => setSelectedRadio(p.id)}
                                />
                              )}
                            </Td>
                            <Td className="font-mono">{bestAmount !== null ? index + 1 : "—"}</Td>
                            <Td>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-ink">{p.rentalCompanyOrganizationName}</span>
                                {isLowest && <Badge tone="success">Lowest bid</Badge>}
                              </div>
                              {pastRentals > 0 && (
                                <span className="text-xs text-meta">{pastRentals} past rentals with you</span>
                              )}
                            </Td>
                            <Td className="font-mono">{bestAmount ?? "—"}</Td>
                            <Td className="font-mono">{ownBids.length}</Td>
                            <Td className="text-meta">{lastBid ? formatDateTime(lastBid.createdAt) : "—"}</Td>
                            <Td>
                              <StatusBadge status={p.status} map={PARTICIPANT_STATUS_MAP} />
                            </Td>
                          </Tr>
                        );
                      })}
                  </Tbody>
                </Table>
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-3.5">
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-ink">Outcome</h2>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Base price" value={formatCurrencyINR(auction.basePrice)} mono />
                <Field
                  label={auction.biddingDirection === "descending" ? "Lowest bid" : "Highest bid"}
                  value={result?.winningAmount != null ? formatCurrencyINR(result.winningAmount) : "—"}
                  mono
                />
                <Field
                  label="Against base"
                  value={
                    result?.winningAmount != null
                      ? `${Math.round(((result.winningAmount - auction.basePrice) / auction.basePrice) * 100)}%`
                      : "—"
                  }
                  mono
                />
                <Field
                  label="Participants"
                  value={`${approved.length} approved, ${rejected.length} rejected`}
                />
                <Field label="Bids placed" value={`${bids.length}`} mono />
              </div>
            </Card>
            <AuctionLogPanel
              events={events.map((e) => ({
                id: e.id,
                text:
                  e.eventType === "closed"
                    ? `Auction closed${
                        (e.payload as { winningAmount?: number } | null)?.winningAmount != null
                          ? ` — winning bid ${formatCurrencyINR((e.payload as { winningAmount: number }).winningAmount)}`
                          : ""
                      }`
                    : e.eventType === "bid_placed"
                      ? `Bid of ${formatCurrencyINR((e.payload as { amount: number } | null)?.amount ?? 0)} placed`
                      : e.eventType,
                when: formatRelativeTime(e.createdAt),
              }))}
            />
          </div>
        </div>
        {error && <ErrorState message={error} />}
      </div>
    );
  }

  // Live/scheduled monitoring, or closed-with-a-selection.
  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader
        title={`Auction · ${auction.biddingDirection} · base ${formatCurrencyINR(auction.basePrice)}`}
        description={`${formatDateTime(auction.startsAt)} → ${formatDateTime(auction.endsAt)}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={auction.status} map={AUCTION_STATUS_MAP} />
            {(auction.status === "live" || auction.status === "scheduled") && (
              <Button variant="secondary" onClick={() => void handleClose()}>
                Close now
              </Button>
            )}
          </div>
        }
      />
      {auction.status === "live" && (
        <div className="rounded-panel bg-rail px-4 py-2.5 text-sm text-white">
          Closes in <span className="font-mono font-semibold text-accent">{formatCountdown(auction.endsAt, now)}</span>
        </div>
      )}
      {error && <ErrorState message={error} />}

      <Card padding="none">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Participants</h2>
        </div>
        {participants.length === 0 ? (
          <EmptyState title="No participants yet" />
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {participants.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="font-medium text-ink">{p.rentalCompanyOrganizationName}</span>
                <StatusBadge status={p.status} map={PARTICIPANT_STATUS_MAP} />
                {p.status === "pending" && (
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" onClick={() => void handleReview(p.id, "approved")}>
                      Approve
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void handleReview(p.id, "rejected")}>
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-ink">Bids</h2>
        <BidHistoryTable bids={bids} />
      </Card>

      {selectedParticipant && (
        <Card className="border-l-[3px] border-l-success">
          <p className="text-sm text-ink">
            You selected <strong>{selectedParticipant.rentalCompanyOrganizationName}</strong> — waiting for their
            commercial quotation.{" "}
            <Link href="/quotations" className="font-medium text-accent-text">
              View quotations
            </Link>
          </p>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rental Company (bidder): Live bidding
// ---------------------------------------------------------------------------

function RentalCompanyAuctionPanel({
  organizationId,
  requirement,
  highlightedAuctionId,
}: {
  organizationId: string;
  requirement: Requirement;
  highlightedAuctionId: string | null;
}) {
  const { hasPermission } = useSession();
  // The requirement's owner name is enrichment (quotation.manage), not this
  // panel's own purpose (auction.participate) — a role missing it shouldn't
  // turn a successfully-loaded auction into a page-level error banner (see
  // docs/decisions.md, same fix as quotations/page.tsx's canListMachines).
  const canListRenterOrgs = hasPermission("quotation.manage");
  const requirementId = requirement.id;
  const [auction, setAuction] = useState<Auction | null>(null);
  const [detail, setDetail] = useState<AuctionDetail | null>(null);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [subcategoryName, setSubcategoryName] = useState<string | null>(null);
  const [activity, setActivity] = useState<{ id: string; text: string; when: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState("");
  const now = useTicker();

  const load = useCallback(async () => {
    setError(null);
    try {
      let found: Auction | null = null;
      if (highlightedAuctionId) {
        try {
          const candidate = (await apiClient.getAuctionDetail(organizationId, highlightedAuctionId)) as AuctionDetail;
          if (candidate.auction.requirementId === requirementId) found = candidate.auction;
        } catch {
          found = null;
        }
      }
      found ??= (await apiClient.getActiveAuctionForRequirement(organizationId, requirementId)) as Auction;
      if (!found) throw new Error("No auction found for this requirement");
      setAuction(found);
      try {
        setDetail((await apiClient.getAuctionDetail(organizationId, found.id)) as AuctionDetail);
      } catch (detailErr) {
        if (!(detailErr instanceof ApiError && detailErr.status === 404)) throw detailErr;
        setDetail(null);
      }
      const [renterOrgs, notifications] = await Promise.all([
        canListRenterOrgs
          ? (apiClient.listRenterOrganizations(organizationId) as Promise<Organization[]>)
          : Promise.resolve([]),
        apiClient.listNotifications(organizationId),
      ]);
      setOwnerName(renterOrgs.find((o) => o.id === found!.createdByOrganizationId)?.name ?? null);
      setActivity(
        (notifications as { notifications: { id: string; relatedResourceType: string | null; relatedResourceId: string | null; message: string; createdAt: string }[] }).notifications
          .filter((n) => n.relatedResourceType === "auction" && n.relatedResourceId === found!.id)
          .map((n) => ({ id: n.id, text: n.message, when: formatRelativeTime(n.createdAt) })),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setAuction(null);
        setDetail(null);
      } else {
        setError(err instanceof Error ? err.message : null);
      }
    } finally {
      setLoading(false);
    }
  }, [organizationId, requirementId, highlightedAuctionId, canListRenterOrgs]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      const categories = (await apiClient.listProductCategories()) as ProductCategory[];
      const subcategoryLists = await Promise.all(
        categories.map((c) => apiClient.listProductSubcategories(c.id) as Promise<ProductSubcategory[]>),
      );
      const match = subcategoryLists.flat().find((s) => s.id === requirement.productSubcategoryId);
      setSubcategoryName(match?.name ?? null);
    })();
  }, [requirement.productSubcategoryId]);

  useAuctionPolling(detail, load);
  useInterval(() => void load(), LIVE_POLL_INTERVAL_MS, auction?.status === "live");

  async function handleJoin() {
    setError(null);
    try {
      await apiClient.requestToJoinAuction(organizationId, auction!.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join auction");
    }
  }

  async function handleBid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await apiClient.placeBid(organizationId, auction!.id, Number(bidAmount));
      setBidAmount("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to place bid");
    }
  }

  if (loading) return <LoadingState label="Loading auction…" />;
  if (!auction) return <EmptyState title="No auction running" description="This requirement doesn't have an active auction." />;

  const canStillJoin = auction.status === "live" || auction.status === "scheduled";
  const ownParticipant = detail?.participants[0];
  const ownBids = detail?.bids.filter((b) => b.participantId === ownParticipant?.id) ?? [];
  const leadingBid = detail?.bids.find((b) => b.isLeading);
  const latestOwnBid = ownBids[ownBids.length - 1];
  const remaining = bidsRemaining(auction, ownBids.length);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-4 rounded-panel border border-border bg-rail px-6 py-4 text-white">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-semibold">{subcategoryName ?? "Equipment"}</h1>
            <StatusBadge status={auction.status} map={AUCTION_STATUS_MAP} />
          </div>
          <span className="text-xs text-rail-muted">
            AU-{auction.id.slice(0, 8).toUpperCase()} · requirement{" "}
            <Link
              href={`/requirements/${requirementId}`}
              className="underline decoration-dotted underline-offset-2 hover:text-white"
            >
              RFQ-{requirementId.slice(0, 8).toUpperCase()}
            </Link>
            {requirement.projectLocation ? ` · ${requirement.projectLocation}` : ""}
            {ownerName ? ` · owner ${ownerName}` : ""}
          </span>
        </div>
        {auction.status === "live" && (
          <div className="flex flex-wrap items-end gap-6 sm:ml-auto">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-rail-muted">Closes in</span>
              <span className="font-mono text-2xl font-medium">{formatCountdown(auction.endsAt, now)}</span>
            </div>
            {remaining !== null && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-rail-muted">Bids left</span>
                <span className="font-mono text-2xl font-medium text-accent">{remaining}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <ErrorState message={error} />}

      {!detail ? (
        canStillJoin ? (
          <Card>
            <Button onClick={() => void handleJoin()}>Request to join</Button>
          </Card>
        ) : (
          <EmptyState title="This auction has ended" />
        )
      ) : (
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-3.5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Card>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-meta">Leading bid</p>
                <p className="mt-1 font-mono text-2xl font-medium text-ink">
                  {leadingBid ? formatCurrencyINR(leadingBid.amount) : "—"}
                </p>
                <p className="mt-1 text-[11px] text-meta-light">
                  per {requirement.expectedDurationUnit ?? "period"} · bidder identity withheld
                </p>
              </Card>
              <Card className={ownParticipant?.status === "selected" ? "border-l-[3px] border-l-success" : "border-l-[3px] border-l-danger"}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-danger">Your latest bid</p>
                <p className="mt-1 font-mono text-2xl font-medium text-ink">
                  {latestOwnBid ? formatCurrencyINR(latestOwnBid.amount) : "—"}
                </p>
                <p className="mt-1 text-[11px] text-danger">
                  {latestOwnBid && leadingBid && latestOwnBid.id !== leadingBid.id
                    ? `${formatCurrencyINR(Math.abs(latestOwnBid.amount - leadingBid.amount))} ${
                        auction.biddingDirection === "descending" ? "above" : "below"
                      } the leading bid`
                    : latestOwnBid
                      ? "you are leading"
                      : "no bid placed yet"}
                </p>
              </Card>
              <Card>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-meta">Base price</p>
                <p className="mt-1 font-mono text-2xl font-medium text-ink-muted">{formatCurrencyINR(auction.basePrice)}</p>
                <p className="mt-1 text-[11px] text-meta-light">
                  {auction.biddingDirection} · bids must go {auction.biddingDirection === "descending" ? "lower" : "higher"}
                </p>
              </Card>
            </div>

            {ownParticipant?.status === "selected" ? (
              <Card className="border-l-[3px] border-l-success">
                <p className="mb-2 text-sm font-semibold text-ink">You were selected for this requirement.</p>
                <p className="mb-3 text-sm text-meta">Create your commercial quotation to move forward.</p>
                <Link href={`/quotations?requirementId=${requirementId}&sourceAuctionId=${auction.id}`}>
                  <Button>Create quotation</Button>
                </Link>
              </Card>
            ) : auction.status === "closed" ? (
              <Card>
                <p className="text-sm text-meta">This auction has ended. You were not selected this time.</p>
              </Card>
            ) : ownParticipant?.status !== "approved" ? (
              <Card>
                <p className="text-sm text-meta">Waiting for approval to bid…</p>
              </Card>
            ) : (
              <Card>
                <div className="mb-3 flex items-baseline gap-2">
                  <h2 className="text-sm font-semibold text-ink">Place a bid</h2>
                  {leadingBid && (
                    <span className="text-xs text-meta">
                      Must be {auction.biddingDirection === "descending" ? "below" : "above"}{" "}
                      {formatCurrencyINR(leadingBid.amount)}. Bids are final once placed.
                    </span>
                  )}
                </div>
                <form onSubmit={handleBid} className="flex flex-wrap items-end gap-3">
                  <Input
                    label="Your bid amount"
                    type="number"
                    step="0.01"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    required
                  />
                  <Button type="submit" disabled={auction.status !== "live" || remaining === 0}>
                    Place bid
                  </Button>
                  {remaining !== null && (
                    <span className="text-xs text-meta">{remaining} of {auction.maxBidsPerParticipant} bids remaining</span>
                  )}
                </form>
              </Card>
            )}

            <Card>
              <div className="mb-3 flex items-baseline gap-2">
                <h2 className="text-sm font-semibold text-ink">Bid history</h2>
                <span className="text-xs text-meta">Your bids in full; other participants anonymized.</span>
              </div>
              <BidHistoryTable bids={detail.bids} ownParticipantId={ownParticipant?.id} />
            </Card>
          </div>

          <div className="flex flex-col gap-3.5">
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-ink">Auction terms</h2>
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline gap-2 border-b border-border pb-2 text-sm">
                  <span className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wide text-meta">
                    Requirement
                  </span>
                  <Link href={`/requirements/${requirementId}`} className="text-accent-text">
                    {requirement.projectName ?? `RFQ-${requirementId.slice(0, 8).toUpperCase()}`}
                  </Link>
                </div>
                {[
                  ["Owner", ownerName ?? "—"],
                  ["Direction", auction.biddingDirection === "descending" ? "Descending — lowest bid leads" : "Ascending — highest bid leads"],
                  ["Base price", formatCurrencyINR(auction.basePrice)],
                  ["Bid limit", auction.maxBidsPerParticipant ? `${auction.maxBidsPerParticipant} bids per participant` : "No limit"],
                  ["Window", `${formatDate(auction.startsAt)} → ${formatDate(auction.endsAt)}`],
                  ["Site", requirement.projectLocation ?? "—"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline gap-2 border-b border-border pb-2 text-sm">
                    <span className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wide text-meta">{label}</span>
                    <span className="text-ink">{value}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="border-l-[3px] border-l-accent">
              <p className="mb-1 text-sm font-semibold text-ink">
                The {auction.biddingDirection === "descending" ? "lowest" : "highest"} bid does not win automatically
              </p>
              <p className="text-xs text-meta">
                When the clock stops, the owner reviews the approved participants and selects one. A negotiation opens
                with the participant selected, and the formal quotation follows from that.
              </p>
            </Card>
            <AuctionLogPanel events={activity} />
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-meta">{label}</span>
      <span className={["text-sm text-ink", mono && "font-mono"].filter(Boolean).join(" ")}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page shell: requirement picker + role routing
// ---------------------------------------------------------------------------

export default function AuctionsPage() {
  const { currentMembership } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  const searchParams = useSearchParams();
  const requirementIdParam = searchParams.get("requirementId");
  const auctionIdParam = searchParams.get("auctionId");

  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [selectedRequirementId, setSelectedRequirementId] = useState<string | null>(requirementIdParam);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId || !organizationType) return;
    void (async () => {
      try {
        const list =
          organizationType === "renter"
            ? ((await apiClient.listRequirements(organizationId)) as Requirement[])
            : ((await apiClient.discoverRequirements(organizationId)) as Requirement[]);
        setRequirements(list);
      } finally {
        setLoading(false);
      }
    })();
  }, [organizationId, organizationType]);

  useEffect(() => {
    if (!organizationId || !auctionIdParam) return;
    void (async () => {
      try {
        const detail = (await apiClient.getAuctionDetail(organizationId, auctionIdParam)) as AuctionDetail;
        setSelectedRequirementId(detail.auction.requirementId);
      } catch {
        // The current organization may not be an auction party yet.
      }
    })();
  }, [organizationId, auctionIdParam]);

  const selectedRequirement = useMemo(
    () => requirements.find((r) => r.id === selectedRequirementId) ?? null,
    [requirements, selectedRequirementId],
  );

  if (!organizationId || !organizationType) return <LoadingState label="Loading…" />;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Auctions" description="Time-bound competitive bidding on a requirement." />
      {loading ? (
        <LoadingState label="Loading requirements…" />
      ) : (
        <Card>
          <Select
            label="Requirement"
            value={selectedRequirementId ?? ""}
            onChange={(event) => setSelectedRequirementId(event.target.value || null)}
            options={[
              { value: "", label: "Select a requirement" },
              ...requirements.map((r) => ({ value: r.id, label: r.projectName ?? r.id.slice(0, 8) })),
            ]}
          />
        </Card>
      )}
      {selectedRequirement &&
        (organizationType === "renter" ? (
          <RenterAuctionPanel
            organizationId={organizationId}
            requirement={selectedRequirement}
            highlightedAuctionId={auctionIdParam}
          />
        ) : (
          <RentalCompanyAuctionPanel
            organizationId={organizationId}
            requirement={selectedRequirement}
            highlightedAuctionId={auctionIdParam}
          />
        ))}
    </div>
  );
}
