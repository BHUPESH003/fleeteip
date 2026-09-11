import type { BiddingDirection } from "@fleetip/contracts/auction";
import type { AuctionBidRecord } from "./ports.js";

/**
 * The winner is the best bid by direction — 'ascending' (highest wins,
 * legacy "H1") or 'descending' (lowest wins, legacy "L1") — ties broken by
 * whichever bid was placed first. Pure and DB-independent so it can be unit
 * tested directly; the repository only supplies the bid list and persists
 * the result. See docs/marketplace-core-loop-design.md §8.
 */
export function pickWinningBid(
  bids: AuctionBidRecord[],
  direction: BiddingDirection,
): AuctionBidRecord | undefined {
  if (bids.length === 0) return undefined;
  return [...bids].sort((a, b) => {
    const diff = direction === "ascending" ? b.amount - a.amount : a.amount - b.amount;
    if (diff !== 0) return diff;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  })[0];
}

/**
 * A bid is valid only if it respects the auction's base price AND strictly
 * improves on the current standing bid (never merely matches it) — an
 * auction with no improving move possible is, by definition, over.
 */
export function isImprovingBid(
  amount: number,
  basePrice: number,
  currentLeader: AuctionBidRecord | undefined,
  direction: BiddingDirection,
): boolean {
  if (direction === "ascending") {
    if (amount < basePrice) return false;
    if (currentLeader && amount <= currentLeader.amount) return false;
    return true;
  }
  if (amount > basePrice) return false;
  if (currentLeader && amount >= currentLeader.amount) return false;
  return true;
}
