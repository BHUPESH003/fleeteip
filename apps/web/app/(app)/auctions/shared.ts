import { AuctionStatus, BiddingDirection, type Auction, type AuctionBid } from "@fleetip/contracts/auction";
import { formatDateTime, formatMoney } from "../../../lib/format";

/** Auctions have no stored reference number; the display reference is derived from the id. */
export function auctionRef(id: string): string {
  return `AU-${id.slice(0, 8).toUpperCase()}`;
}

export const DIRECTION: Record<BiddingDirection, { label: string; rule: string; better: "higher" | "lower"; best: string }> = {
  // 'ascending' = highest bid wins (legacy "H1"); 'descending' = lowest bid wins (legacy "L1").
  ascending: { label: "Ascending", rule: "Highest bid leads", better: "higher", best: "Highest bid" },
  descending: { label: "Descending", rule: "Lowest bid leads", better: "lower", best: "Lowest bid" },
};

export function isRunning(status: AuctionStatus): boolean {
  return status === AuctionStatus.scheduled || status === AuctionStatus.live;
}

/** Leading / Outbid (own latest, not leading) / Superseded (own, older, not leading). */
export function bidTag(bid: AuctionBid, ownParticipantId: string | undefined, allBids: AuctionBid[]): "Leading" | "Outbid" | "Superseded" | null {
  if (bid.isLeading) return "Leading";
  if (!ownParticipantId || bid.participantId !== ownParticipantId) return null;
  const ownBids = allBids.filter((b) => b.participantId === ownParticipantId);
  const latestOwn = ownBids[ownBids.length - 1];
  return latestOwn?.id === bid.id ? "Outbid" : "Superseded";
}

/** "2 d 04:10:03" / "04:10:03" until the target; "00:00:00" once it's passed. */
export function formatCountdown(targetIso: string, now: number): string {
  const ms = new Date(targetIso).getTime() - now;
  if (ms <= 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const h = Math.floor((totalSeconds % 86_400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const clock = [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
  return days > 0 ? `${days} d ${clock}` : clock;
}

export function bidsRemaining(auction: Auction, ownBidCount: number): number | null {
  if (!auction.maxBidsPerParticipant) return null;
  return Math.max(auction.maxBidsPerParticipant - ownBidCount, 0);
}

/**
 * When the auction runs, in words. Status is stored but only moves on the
 * server when someone touches the auction (lazy close), so the clock is
 * worked out from startsAt/endsAt here.
 */
export function timing(auction: Auction, now: number): { label: string; tone: "live" | "waiting" | "done" } {
  const starts = new Date(auction.startsAt).getTime();
  const ends = new Date(auction.endsAt).getTime();
  if (auction.status === AuctionStatus.cancelled) return { label: `Cancelled · was ${formatDateTime(auction.startsAt)} → ${formatDateTime(auction.endsAt)}`, tone: "done" };
  if (auction.status === AuctionStatus.closed || now >= ends) return { label: `Ended ${formatDateTime(auction.status === AuctionStatus.closed ? auction.updatedAt : auction.endsAt)}`, tone: "done" };
  if (now < starts) return { label: `Starts in ${formatCountdown(auction.startsAt, now)}`, tone: "waiting" };
  return { label: `Closes in ${formatCountdown(auction.endsAt, now)}`, tone: "live" };
}

/**
 * The server's rule (auction-rules.ts isImprovingBid): ascending bids must be
 * at least the base price and higher than the leading bid; descending bids
 * at most the base price and lower than the leading bid.
 */
export function bidError(raw: string, auction: Auction, leadingAmount: number | null): string | null {
  if (!raw.trim()) return "Enter your bid amount.";
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) return "Enter a bid above ₹0.";
  if (auction.biddingDirection === BiddingDirection.ascending) {
    if (leadingAmount !== null && amount <= leadingAmount) return `Bids must be higher than ${formatMoney(leadingAmount)}, the leading bid.`;
    if (amount < auction.basePrice) return `Bids must be ${formatMoney(auction.basePrice)} or more — that's the base price.`;
  } else {
    if (leadingAmount !== null && amount >= leadingAmount) return `Bids must be lower than ${formatMoney(leadingAmount)}, the leading bid.`;
    if (amount > auction.basePrice) return `Bids must be ${formatMoney(auction.basePrice)} or less — that's the base price.`;
  }
  return null;
}

/** "Bids must be higher than ₹X" — the rule in words, for the form's hint. */
export function bidRuleText(auction: Auction, leadingAmount: number | null): string {
  if (leadingAmount !== null) return `Bids must be ${DIRECTION[auction.biddingDirection].better} than ${formatMoney(leadingAmount)}.`;
  return auction.biddingDirection === BiddingDirection.ascending
    ? `No bids yet. Bids start at ${formatMoney(auction.basePrice)}.`
    : `No bids yet. Bids can be at most ${formatMoney(auction.basePrice)}.`;
}
