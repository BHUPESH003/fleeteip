import type {
  AuctionStatus,
  BiddingDirection,
  ParticipantStatus,
} from "@fleetip/contracts/auction";

export interface AuctionRecord {
  id: string;
  requirement_id: string;
  created_by_organization_id: string;
  bidding_direction: BiddingDirection;
  base_price: number;
  max_bids_per_participant: number | null;
  starts_at: Date | string;
  ends_at: Date | string;
  status: AuctionStatus;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateAuctionInput {
  requirementId: string;
  createdByOrganizationId: string;
  biddingDirection: BiddingDirection;
  basePrice: number;
  maxBidsPerParticipant?: number;
  startsAt: string;
  endsAt: string;
}

export interface AuctionParticipantRecord {
  id: string;
  auction_id: string;
  rental_company_organization_id: string;
  status: ParticipantStatus;
  created_at: Date | string;
}

export interface AuctionBidRecord {
  id: string;
  auction_id: string;
  participant_id: string;
  amount: number;
  created_at: Date | string;
}

export interface AuctionResultRecord {
  auction_id: string;
  winning_bid_id: string | null;
  winning_amount: number | null;
  closed_at: Date | string;
}

export interface AuctionEventRecord {
  id: string;
  auction_id: string;
  event_type: string;
  actor_organization_id: string | null;
  payload: unknown | null;
  created_at: Date | string;
}

// One row per auction the calling organization owns, with the requirement's
// project name and a participant-roster aggregate — a single joined query,
// not a loop over per-auction lookups. See AuctionRepository.listByOwnerOrganization.
export interface AuctionSummaryOwnerRow extends AuctionRecord {
  requirement_project_name: string | null;
  participant_count: number;
  has_selected_participant: boolean;
}

// One row per auction the calling organization participates in, with its own
// participant status resolved in the same query.
export interface AuctionSummaryParticipantRow extends AuctionRecord {
  requirement_project_name: string | null;
  own_participant_status: ParticipantStatus;
}

export interface AuctionRepositoryPort {
  create(input: CreateAuctionInput): Promise<AuctionRecord>;
  // Plain read, no side effect — status may be stale by up to one
  // syncStatus() call's worth of lazy transition. Used for simple listings.
  findById(id: string): Promise<AuctionRecord | undefined>;
  listByRequirement(requirementId: string): Promise<AuctionRecord[]>;
  // Org-scoped dashboard/list views — same "no syncStatus on a list" staleness
  // tradeoff as listByRequirement (opening the detail page syncs it).
  listByOwnerOrganization(organizationId: string): Promise<AuctionSummaryOwnerRow[]>;
  listByParticipantOrganization(organizationId: string): Promise<AuctionSummaryParticipantRow[]>;

  // Lazily promotes scheduled -> live -> closed (computing and persisting the
  // winner) based on starts_at/ends_at vs. server time, inside a single
  // locked transaction — idempotent, safe under concurrent callers. See
  // docs/marketplace-core-loop-design.md §8.
  syncStatus(id: string): Promise<AuctionRecord | undefined>;
  // Manual early close (owner action) — same winner computation, skips the
  // endsAt check. Throws ConflictError if the auction isn't running.
  closeNow(id: string): Promise<AuctionRecord>;
  cancel(id: string): Promise<AuctionRecord>;

  addParticipant(
    auctionId: string,
    rentalCompanyOrganizationId: string,
  ): Promise<AuctionParticipantRecord>;
  findParticipantByOrganization(
    auctionId: string,
    rentalCompanyOrganizationId: string,
  ): Promise<AuctionParticipantRecord | undefined>;
  findParticipantById(participantId: string): Promise<AuctionParticipantRecord | undefined>;
  listParticipants(auctionId: string): Promise<AuctionParticipantRecord[]>;
  updateParticipantStatus(
    participantId: string,
    status: ParticipantStatus,
  ): Promise<AuctionParticipantRecord>;

  // Runs syncStatus first (inside the same transaction/lock) and validates
  // direction/base-price/leading-bid-improvement/bid-cap against a fresh,
  // locked snapshot — the row lock is what makes this safe under
  // simultaneous submissions, not the validation alone. Throws
  // ConflictError/ValidationError on rejection.
  placeBid(auctionId: string, participantId: string, amount: number): Promise<AuctionBidRecord>;
  listBids(auctionId: string): Promise<AuctionBidRecord[]>;

  findResult(auctionId: string): Promise<AuctionResultRecord | undefined>;
  listEvents(auctionId: string): Promise<AuctionEventRecord[]>;
}
