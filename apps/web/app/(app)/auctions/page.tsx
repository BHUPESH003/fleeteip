"use client";

import type { Auction, AuctionBid, AuctionDetail, BiddingDirection } from "@fleetip/contracts/auction";
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
} from "@fleetip/ui";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, apiClient } from "../../../lib/api-client";
import { useInterval } from "../../../lib/use-interval";
import { useSession } from "../../../lib/session-context";

const AUCTION_POLL_INTERVAL_MS = 5000;
const AUCTION_PRESTART_POLL_WINDOW_MS = 30_000;
const LIVE_POLL_INTERVAL_MS = 4000;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function shouldPollAuction(detail: AuctionDetail | null): boolean {
  if (!detail) return false;
  if (detail.auction.status === "live") return true;
  if (detail.auction.status !== "scheduled") return false;
  return (
    new Date(detail.auction.startsAt).getTime() - Date.now() <= AUCTION_PRESTART_POLL_WINDOW_MS
  );
}

function msUntilAuctionPollingWindow(detail: AuctionDetail | null): number | null {
  if (!detail || detail.auction.status !== "scheduled") return null;
  return Math.max(
    new Date(detail.auction.startsAt).getTime() - Date.now() - AUCTION_PRESTART_POLL_WINDOW_MS,
    0,
  );
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

// Bid history table shared by both sides — the backend already decides what
// each caller is entitled to see (competitor identity withheld unless the
// caller is the auction owner or it's the caller's own bid), so this just
// renders whatever comes back.
function BidHistory({ bids }: { bids: AuctionBid[] }) {
  if (bids.length === 0) return <p className="text-sm text-gray-500">No bids yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="py-1 pr-4 font-medium">#</th>
            <th className="py-1 pr-4 font-medium">Bidder</th>
            <th className="py-1 pr-4 font-medium">Amount</th>
            <th className="py-1 pr-4 font-medium">Placed</th>
            <th className="py-1 pr-4 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {bids.map((bid, index) => (
            <tr key={bid.id} className="border-b border-gray-100">
              <td className="py-1 pr-4 text-gray-500">{index + 1}</td>
              <td className="py-1 pr-4">{bid.rentalCompanyOrganizationName ?? "—"}</td>
              <td className="py-1 pr-4 font-medium text-gray-900">{bid.amount}</td>
              <td className="py-1 pr-4 text-gray-500">{formatDateTime(bid.createdAt)}</td>
              <td className="py-1 pr-4">
                {bid.isLeading && <Badge tone="success">Leading</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PARTICIPANT_STATUS_TONE: Record<string, "success" | "warning" | "neutral" | "danger"> = {
  pending: "warning",
  approved: "success",
  selected: "success",
  rejected: "danger",
};

function RenterAuctionPanel({
  organizationId,
  requirementId,
  highlightedAuctionId,
}: {
  organizationId: string;
  requirementId: string;
  highlightedAuctionId: string | null;
}) {
  const [detail, setDetail] = useState<AuctionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const auction = await apiClient.listAuctionsForRequirement(organizationId, requirementId);
      const active =
        (auction as { id: string }[]).find((item) => item.id === highlightedAuctionId) ??
        (auction as { id: string }[])[0];
      if (active) {
        setDetail((await apiClient.getAuctionDetail(organizationId, active.id)) as AuctionDetail);
      } else {
        setDetail(null);
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

  async function handleSelect(participantId: string) {
    if (!detail) return;
    setError(null);
    try {
      await apiClient.selectParticipant(organizationId, detail.auction.id, participantId);
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

  if (loading) return <LoadingState label="Loading auction…" />;

  const selectedParticipant = detail?.participants.find((p) => p.status === "selected");
  const hasApprovedParticipant = detail?.participants.some((p) => p.status === "approved") ?? false;

  return (
    <Card className="mt-4">
      {error && <ErrorState message={error} />}
      {!detail ? (
        <>
          <h2 className="mb-4 text-lg font-medium text-gray-900">Run an auction</h2>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <Input label="Starts at" name="startsAt" type="datetime-local" required />
              <Input label="Ends at" name="endsAt" type="datetime-local" required />
            </div>
            <div>
              <Button type="submit">Start auction</Button>
            </div>
          </form>
        </>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-gray-900">
                Auction · {detail.auction.biddingDirection} · base {detail.auction.basePrice}
              </h2>
              <p className="text-sm text-gray-500">
                {formatDateTime(detail.auction.startsAt)} → {formatDateTime(detail.auction.endsAt)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={detail.auction.status === "closed" ? "neutral" : "success"}>
                {detail.auction.status}
              </Badge>
              {(detail.auction.status === "live" || detail.auction.status === "scheduled") && (
                <button
                  onClick={() => void handleClose()}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Close now
                </button>
              )}
            </div>
          </div>

          <h3 className="mb-2 text-sm font-semibold text-gray-900">Participants</h3>
          {detail.participants.length === 0 ? (
            <p className="mb-4 text-sm text-gray-500">No participants yet.</p>
          ) : (
            <ul className="mb-4 flex flex-col gap-2">
              {detail.participants.map((p) => (
                <li key={p.id} className="flex items-center gap-3 text-sm">
                  <span className="font-medium text-gray-900">
                    {p.rentalCompanyOrganizationName}
                  </span>
                  <Badge tone={PARTICIPANT_STATUS_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
                  {p.status === "pending" && (
                    <>
                      <button
                        onClick={() => void handleReview(p.id, "approved")}
                        className="rounded-md border border-green-300 bg-green-50 px-2 py-0.5 text-xs text-green-700 hover:bg-green-100"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => void handleReview(p.id, "rejected")}
                        className="rounded-md border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {p.status === "approved" &&
                    detail.auction.status === "closed" &&
                    !selectedParticipant && (
                      <button
                        onClick={() => void handleSelect(p.id)}
                        className="rounded-md border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-100"
                      >
                        Select
                      </button>
                    )}
                </li>
              ))}
            </ul>
          )}

          <h3 className="mb-2 text-sm font-semibold text-gray-900">Bids</h3>
          <BidHistory bids={detail.bids} />

          {detail.auction.status === "closed" && (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              {selectedParticipant ? (
                <p>
                  You selected <strong>{selectedParticipant.rentalCompanyOrganizationName}</strong> —
                  waiting for their commercial quotation.{" "}
                  <Link href="/quotations" className="underline">
                    View quotations
                  </Link>
                </p>
              ) : hasApprovedParticipant ? (
                <p>Auction ended — review the bids above and select a participant to proceed with.</p>
              ) : (
                <p>Auction ended with no approved participants to select from.</p>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function RentalCompanyAuctionPanel({
  organizationId,
  requirementId,
  highlightedAuctionId,
}: {
  organizationId: string;
  requirementId: string;
  highlightedAuctionId: string | null;
}) {
  const [auction, setAuction] = useState<Auction | null>(null);
  const [detail, setDetail] = useState<AuctionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState("");

  const load = useCallback(async () => {
    // Deliberately does NOT null out `auction`/`detail` before the fetch —
    // this runs on every poll tick (LIVE_POLL_INTERVAL_MS) and briefly
    // unmounted the bid form/EmptyState in between, which is what caused the
    // reported flicker. Update in place; only clear on a genuine 404 (no
    // active auction) or error.
    setError(null);
    try {
      let found: Auction | null = null;
      if (highlightedAuctionId) {
        try {
          const candidate = (await apiClient.getAuctionDetail(
            organizationId,
            highlightedAuctionId,
          )) as AuctionDetail;
          if (candidate.auction.requirementId === requirementId) {
            found = candidate.auction;
          }
        } catch {
          found = null;
        }
      }
      found ??= (await apiClient.getActiveAuctionForRequirement(
        organizationId,
        requirementId,
      )) as Auction;
      if (!found) throw new Error("No auction found for this requirement");
      setAuction(found);
      try {
        setDetail((await apiClient.getAuctionDetail(organizationId, found.id)) as AuctionDetail);
      } catch (detailErr) {
        // getAuctionDetail 404s for a caller that hasn't joined this auction
        // yet (participant isolation — see marketplace-core-loop-design.md
        // §8) — that's expected before "Request to join" is clicked, not a
        // failure. The `auction` summary above already has everything needed
        // to render the join prompt; only bids/participant detail is gated.
        if (!(detailErr instanceof ApiError && detailErr.status === 404)) {
          throw detailErr;
        }
        setDetail(null);
      }
    } catch (err) {
      // A Requirement simply not having an active auction yet is the normal
      // case (the "No auction running" EmptyState already covers it below) —
      // only a genuine failure (permissions, network, server error) is worth
      // surfacing as an ErrorState.
      if (err instanceof ApiError && err.status === 404) {
        setAuction(null);
        setDetail(null);
      } else {
        setError(err instanceof Error ? err.message : null);
      }
    } finally {
      setLoading(false);
    }
  }, [organizationId, requirementId, highlightedAuctionId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const canStillJoin = auction?.status === "live" || auction?.status === "scheduled";
  const ownParticipant = detail?.participants[0];

  return (
    <Card className="mt-4">
      {error && <ErrorState message={error} />}
      {!auction ? (
        <EmptyState
          title="No auction running"
          description="This requirement doesn't have an active auction."
        />
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-900">
              Auction · {auction.biddingDirection} · base {auction.basePrice}
            </h2>
            <Badge tone={auction.status === "closed" ? "neutral" : "success"}>
              {auction.status}
            </Badge>
          </div>
          {!detail ? (
            canStillJoin ? (
              <Button onClick={() => void handleJoin()}>Request to join</Button>
            ) : (
              <p className="text-sm text-gray-500">This auction has ended.</p>
            )
          ) : ownParticipant?.status === "selected" ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
              <p className="mb-2 font-medium">You were selected for this requirement.</p>
              <p className="mb-3">Create your commercial quotation to move forward.</p>
              <Link
                href={`/quotations?requirementId=${auction.requirementId}&sourceAuctionId=${auction.id}`}
                className="inline-block rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800"
              >
                Create quotation
              </Link>
            </div>
          ) : auction.status === "closed" ? (
            <p className="text-sm text-gray-500">
              This auction has ended. You were not selected this time.
            </p>
          ) : ownParticipant?.status !== "approved" ? (
            <p className="text-sm text-gray-500">Waiting for approval to bid…</p>
          ) : (
            <form onSubmit={handleBid} className="flex items-end gap-3">
              <Input
                label="Your bid"
                type="number"
                step="0.01"
                value={bidAmount}
                onChange={(event) => setBidAmount(event.target.value)}
                required
              />
              <Button type="submit" disabled={auction.status !== "live"}>
                Place bid
              </Button>
            </form>
          )}
          {detail && (
            <>
              <h3 className="mb-2 mt-4 text-sm font-semibold text-gray-900">Visible bids</h3>
              <BidHistory bids={detail.bids} />
            </>
          )}
        </>
      )}
    </Card>
  );
}

export default function AuctionsPage() {
  const { currentMembership } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  const searchParams = useSearchParams();
  const requirementIdParam = searchParams.get("requirementId");
  const auctionIdParam = searchParams.get("auctionId");

  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [selectedRequirementId, setSelectedRequirementId] = useState<string | null>(
    requirementIdParam,
  );
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
        const detail = (await apiClient.getAuctionDetail(
          organizationId,
          auctionIdParam,
        )) as AuctionDetail;
        setSelectedRequirementId(detail.auction.requirementId);
      } catch {
        // The current organization may not be an auction party yet.
      }
    })();
  }, [organizationId, auctionIdParam]);

  if (!organizationId || !organizationType) return null;

  return (
    <>
      <PageHeader title="Auctions" description="Time-bound competitive bidding on a requirement." />
      {loading ? (
        <LoadingState label="Loading requirements…" />
      ) : (
        <Card className="mt-4">
          <Select
            label="Requirement"
            value={selectedRequirementId ?? ""}
            onChange={(event) => setSelectedRequirementId(event.target.value || null)}
            options={[
              { value: "", label: "Select a requirement" },
              ...requirements.map((r) => ({
                value: r.id,
                label: r.projectName ?? r.id.slice(0, 8),
              })),
            ]}
          />
        </Card>
      )}
      {selectedRequirementId &&
        (organizationType === "renter" ? (
          <RenterAuctionPanel
            organizationId={organizationId}
            requirementId={selectedRequirementId}
            highlightedAuctionId={auctionIdParam}
          />
        ) : (
          <RentalCompanyAuctionPanel
            organizationId={organizationId}
            requirementId={selectedRequirementId}
            highlightedAuctionId={auctionIdParam}
          />
        ))}
    </>
  );
}
