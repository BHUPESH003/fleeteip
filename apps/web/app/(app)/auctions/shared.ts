import type { Auction, AuctionBid } from "@fleetip/contracts/auction";
import type { StatusMap } from "@fleetip/ui";

export const PARTICIPANT_STATUS_MAP: StatusMap = {
  pending: { label: "Pending", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  selected: { label: "Selected", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

export const AUCTION_STATUS_MAP: StatusMap = {
  scheduled: { label: "Scheduled", tone: "neutral" },
  live: { label: "Live", tone: "info" },
  closed: { label: "Closed", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

/** Leading / Outbid (own latest, not leading) / Superseded (own, older, not leading). */
export function bidTag(bid: AuctionBid, ownParticipantId: string | undefined, allBids: AuctionBid[]): string | null {
  if (bid.isLeading) return "Leading";
  if (!ownParticipantId || bid.participantId !== ownParticipantId) return null;
  const ownBids = allBids.filter((b) => b.participantId === ownParticipantId);
  const latestOwn = ownBids[ownBids.length - 1];
  return latestOwn?.id === bid.id ? "Outbid" : "Superseded";
}

export function formatCountdown(endsAt: string, now: number): string {
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export function bidsRemaining(auction: Auction, ownBidCount: number): number | null {
  if (!auction.maxBidsPerParticipant) return null;
  return Math.max(auction.maxBidsPerParticipant - ownBidCount, 0);
}
