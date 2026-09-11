import { describe, expect, it } from "vitest";
import type { AuctionBidRecord } from "../src/modules/marketplace/auction/domain/ports.js";
import {
  isImprovingBid,
  pickWinningBid,
} from "../src/modules/marketplace/auction/domain/auction-rules.js";

function bid(overrides: Partial<AuctionBidRecord> = {}): AuctionBidRecord {
  return {
    id: "bid-1",
    auction_id: "auction-1",
    participant_id: "participant-1",
    amount: 100,
    created_at: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("pickWinningBid", () => {
  it("returns undefined for no bids", () => {
    expect(pickWinningBid([], "ascending")).toBeUndefined();
  });

  it("picks the highest amount when ascending (highest wins, H1)", () => {
    const bids = [bid({ id: "b1", amount: 100 }), bid({ id: "b2", amount: 150 })];
    expect(pickWinningBid(bids, "ascending")?.id).toBe("b2");
  });

  it("picks the lowest amount when descending (lowest wins, L1)", () => {
    const bids = [bid({ id: "b1", amount: 100 }), bid({ id: "b2", amount: 80 })];
    expect(pickWinningBid(bids, "descending")?.id).toBe("b2");
  });

  it("breaks a tie by whichever bid was placed first", () => {
    const bids = [
      bid({ id: "b1", amount: 100, created_at: new Date("2026-01-01T00:00:05Z") }),
      bid({ id: "b2", amount: 100, created_at: new Date("2026-01-01T00:00:01Z") }),
    ];
    expect(pickWinningBid(bids, "ascending")?.id).toBe("b2");
  });
});

describe("isImprovingBid", () => {
  it("rejects an ascending bid below the base price", () => {
    expect(isImprovingBid(90, 100, undefined, "ascending")).toBe(false);
  });

  it("accepts an ascending bid at the base price with no leader yet", () => {
    expect(isImprovingBid(100, 100, undefined, "ascending")).toBe(true);
  });

  it("rejects an ascending bid that merely matches the current leader", () => {
    expect(isImprovingBid(150, 100, bid({ amount: 150 }), "ascending")).toBe(false);
  });

  it("accepts an ascending bid that strictly exceeds the current leader", () => {
    expect(isImprovingBid(151, 100, bid({ amount: 150 }), "ascending")).toBe(true);
  });

  it("rejects a descending bid above the base price", () => {
    expect(isImprovingBid(110, 100, undefined, "descending")).toBe(false);
  });

  it("rejects a descending bid that merely matches the current leader", () => {
    expect(isImprovingBid(80, 100, bid({ amount: 80 }), "descending")).toBe(false);
  });

  it("accepts a descending bid that strictly undercuts the current leader", () => {
    expect(isImprovingBid(79, 100, bid({ amount: 80 }), "descending")).toBe(true);
  });
});
