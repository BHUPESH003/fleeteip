import type { AuctionStatus } from "@fleetip/contracts/auction";

// 'live' and 'closed' are otherwise reached lazily by
// AuctionRepository.syncStatus, based on starts_at/ends_at vs. server time —
// this guard covers only the owner-initiated manual action. See
// docs/marketplace-core-loop-design.md §8.
const CANCELLABLE_FROM: AuctionStatus[] = ["scheduled", "live"];

export function canCancel(status: AuctionStatus): boolean {
  return CANCELLABLE_FROM.includes(status);
}
