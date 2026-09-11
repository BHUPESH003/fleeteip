"use client";

import type { AuctionDetail, BiddingDirection } from "@fleetip/contracts/auction";
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
import { useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { useSession } from "../../../lib/session-context";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function RenterAuctionPanel({
  organizationId,
  requirementId,
}: {
  organizationId: string;
  requirementId: string;
}) {
  const [detail, setDetail] = useState<AuctionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const auction = await apiClient.listAuctionsForRequirement(organizationId, requirementId);
      const active = (auction as { id: string }[])[0];
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
  }

  useEffect(() => {
    void load();
  }, [organizationId, requirementId]);

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
    try {
      await apiClient.reviewParticipant(organizationId, detail.auction.id, participantId, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to review participant");
    }
  }

  async function handleClose() {
    if (!detail) return;
    try {
      await apiClient.closeAuctionEarly(organizationId, detail.auction.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close auction");
    }
  }

  if (loading) return <LoadingState label="Loading auction…" />;

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
                  <span>{p.rentalCompanyOrganizationId.slice(0, 8)}…</span>
                  <Badge tone={p.status === "approved" ? "success" : "warning"}>{p.status}</Badge>
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
                </li>
              ))}
            </ul>
          )}

          <h3 className="mb-2 text-sm font-semibold text-gray-900">Bids</h3>
          {detail.bids.length === 0 ? (
            <p className="text-sm text-gray-500">No bids yet.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {detail.bids.map((bid) => (
                <li key={bid.id}>{bid.amount}</li>
              ))}
            </ul>
          )}

          {detail.result && (
            <p className="mt-3 text-sm font-medium text-gray-900">
              Winning amount: {detail.result.winningAmount ?? "No valid bids"}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function RentalCompanyAuctionPanel({
  organizationId,
  requirementId,
}: {
  organizationId: string;
  requirementId: string;
}) {
  const [auction, setAuction] = useState<{ id: string } | null>(null);
  const [detail, setDetail] = useState<AuctionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState("");

  async function load() {
    try {
      const found = await apiClient.getActiveAuctionForRequirement(organizationId, requirementId);
      setAuction(found as { id: string });
      setDetail(
        (await apiClient.getAuctionDetail(
          organizationId,
          (found as { id: string }).id,
        )) as AuctionDetail,
      );
    } catch (err) {
      setAuction(null);
      setDetail(null);
      setError(err instanceof Error ? err.message : null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [organizationId, requirementId]);

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

  return (
    <Card className="mt-4">
      {error && <ErrorState message={error} />}
      {!detail ? (
        <EmptyState
          title="No auction running"
          description="This requirement doesn't have an active auction."
        />
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-900">
              Auction · {detail.auction.biddingDirection} · base {detail.auction.basePrice}
            </h2>
            <Badge tone={detail.auction.status === "closed" ? "neutral" : "success"}>
              {detail.auction.status}
            </Badge>
          </div>
          {detail.participants.length === 0 ? (
            <Button onClick={() => void handleJoin()}>Request to join</Button>
          ) : detail.participants[0]?.status !== "approved" ? (
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
              <Button type="submit" disabled={detail.auction.status !== "live"}>
                Place bid
              </Button>
            </form>
          )}
          <h3 className="mb-2 mt-4 text-sm font-semibold text-gray-900">Visible bids</h3>
          {detail.bids.length === 0 ? (
            <p className="text-sm text-gray-500">No bids yet.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {detail.bids.map((bid) => (
                <li key={bid.id}>{bid.amount}</li>
              ))}
            </ul>
          )}
          {detail.result && (
            <p className="mt-3 text-sm font-medium text-gray-900">
              Winning amount: {detail.result.winningAmount ?? "No valid bids"}
            </p>
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
          />
        ) : (
          <RentalCompanyAuctionPanel
            organizationId={organizationId}
            requirementId={selectedRequirementId}
          />
        ))}
    </>
  );
}
