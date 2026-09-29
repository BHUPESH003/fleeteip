"use client";

import { AuctionStatus, type Auction } from "@fleetip/contracts/auction";
import { useEffect, useState } from "react";
import { useInterval } from "../../../lib/use-interval";

/** Poll while live (bids move), and just before the start so "live" shows promptly. */
const LIVE_POLL_INTERVAL_MS = 4000;
const PRESTART_POLL_INTERVAL_MS = 5000;
const PRESTART_POLL_WINDOW_MS = 30_000;

/** A clock that ticks every second — drives countdowns and when polling starts. */
export function useTicker(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/**
 * MVP "realtime" is short-interval polling of the same REST endpoints
 * (docs/marketplace-core-loop-design.md §11) — the server closes an auction
 * lazily on the next read after endsAt, so polling is also what moves it
 * to Closed on screen. One interval at a time: every 4 s while live, every
 * 5 s in the 30 s before a scheduled start (worked out from the ticking
 * clock, so it starts on time without a separate timer), none otherwise.
 */
export function useAuctionPolling(auction: Auction | null, reload: () => void, now: number, paused = false): void {
  const startsIn = auction ? new Date(auction.startsAt).getTime() - now : Infinity;
  const live = auction?.status === AuctionStatus.live;
  const aboutToStart = auction?.status === AuctionStatus.scheduled && startsIn <= PRESTART_POLL_WINDOW_MS;
  useInterval(reload, LIVE_POLL_INTERVAL_MS, !paused && live);
  useInterval(reload, PRESTART_POLL_INTERVAL_MS, !paused && !live && aboutToStart);
}
