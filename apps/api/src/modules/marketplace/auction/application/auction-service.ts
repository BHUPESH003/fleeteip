import type {
  Auction,
  AuctionBid,
  AuctionDetail,
  AuctionEvent,
  AuctionParticipant,
  AuctionResult,
  CreateAuctionRequest,
} from "@fleetip/contracts/auction";
import { ConflictError, ForbiddenError, NotFoundError } from "../../../../shared/errors.js";
import type { RequirementRepositoryPort } from "../../rfq/domain/ports.js";
import { PermissionService } from "../../../permissions/application/permission-service.js";
import { pickWinningBid } from "../domain/auction-rules.js";
import { canCancel } from "../domain/auction-status.js";
import type {
  AuctionBidRecord,
  AuctionParticipantRecord,
  AuctionRecord,
  AuctionRepositoryPort,
  AuctionResultRecord,
} from "../domain/ports.js";

function toAuction(record: AuctionRecord): Auction {
  return {
    id: record.id,
    requirementId: record.requirement_id,
    createdByOrganizationId: record.created_by_organization_id,
    biddingDirection: record.bidding_direction,
    basePrice: record.base_price,
    maxBidsPerParticipant: record.max_bids_per_participant,
    startsAt: new Date(record.starts_at).toISOString(),
    endsAt: new Date(record.ends_at).toISOString(),
    status: record.status,
    createdAt: new Date(record.created_at).toISOString(),
    updatedAt: new Date(record.updated_at).toISOString(),
  };
}

function toParticipant(record: AuctionParticipantRecord): AuctionParticipant {
  return {
    id: record.id,
    auctionId: record.auction_id,
    rentalCompanyOrganizationId: record.rental_company_organization_id,
    status: record.status,
    createdAt: new Date(record.created_at).toISOString(),
  };
}

function toBid(record: AuctionBidRecord): AuctionBid {
  return {
    id: record.id,
    auctionId: record.auction_id,
    participantId: record.participant_id,
    amount: record.amount,
    createdAt: new Date(record.created_at).toISOString(),
  };
}

function toResult(record: AuctionResultRecord): AuctionResult {
  return {
    auctionId: record.auction_id,
    winningBidId: record.winning_bid_id,
    winningAmount: record.winning_amount,
    closedAt: new Date(record.closed_at).toISOString(),
  };
}

export class AuctionService {
  constructor(
    private readonly auctionRepository: AuctionRepositoryPort,
    private readonly requirementRepository: RequirementRepositoryPort,
    private readonly permissionService: PermissionService,
  ) {}

  async createAuction(
    userId: string,
    renterOrganizationId: string,
    input: CreateAuctionRequest,
  ): Promise<Auction> {
    await this.permissionService.requirePermission(userId, renterOrganizationId, "auction.manage");

    const requirement = await this.requirementRepository.findById(input.requirementId);
    if (!requirement || requirement.renter_organization_id !== renterOrganizationId) {
      throw new NotFoundError("Requirement not found in this organization");
    }
    if (requirement.status !== "open") {
      throw new ConflictError("Cannot run an auction against a requirement that is not open");
    }

    const record = await this.auctionRepository.create({
      requirementId: input.requirementId,
      createdByOrganizationId: renterOrganizationId,
      biddingDirection: input.biddingDirection,
      basePrice: input.basePrice,
      maxBidsPerParticipant: input.maxBidsPerParticipant,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    });
    return toAuction(record);
  }

  async listAuctionsForRequirement(
    userId: string,
    renterOrganizationId: string,
    requirementId: string,
  ): Promise<Auction[]> {
    await this.permissionService.requirePermission(userId, renterOrganizationId, "auction.manage");
    const requirement = await this.requirementRepository.findById(requirementId);
    if (!requirement || requirement.renter_organization_id !== renterOrganizationId) {
      throw new NotFoundError("Requirement not found in this organization");
    }
    const records = await this.auctionRepository.listByRequirement(requirementId);
    return records.map(toAuction);
  }

  // A Rental Company locating the auction running against a Requirement it
  // is already browsing via RFQ discovery.
  async getActiveAuctionForRequirement(
    userId: string,
    rentalCompanyOrganizationId: string,
    requirementId: string,
  ): Promise<Auction> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "auction.participate",
    );
    const auctions = await this.auctionRepository.listByRequirement(requirementId);
    const active = auctions.find((auction) => auction.status !== "cancelled");
    if (!active) {
      throw new NotFoundError("No auction found for this requirement");
    }
    const synced = await this.auctionRepository.syncStatus(active.id);
    return toAuction(synced ?? active);
  }

  async requestToJoin(
    userId: string,
    rentalCompanyOrganizationId: string,
    auctionId: string,
  ): Promise<AuctionParticipant> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "auction.participate",
    );
    const auction = await this.auctionRepository.syncStatus(auctionId);
    if (!auction) throw new NotFoundError("Auction not found");
    if (auction.status === "closed" || auction.status === "cancelled") {
      throw new ConflictError(`Cannot join an auction that is ${auction.status}`);
    }

    const existing = await this.auctionRepository.findParticipantByOrganization(
      auctionId,
      rentalCompanyOrganizationId,
    );
    if (existing) return toParticipant(existing);

    const record = await this.auctionRepository.addParticipant(
      auctionId,
      rentalCompanyOrganizationId,
    );
    return toParticipant(record);
  }

  async reviewParticipant(
    userId: string,
    renterOrganizationId: string,
    auctionId: string,
    participantId: string,
    status: "approved" | "rejected",
  ): Promise<AuctionParticipant> {
    await this.permissionService.requirePermission(userId, renterOrganizationId, "auction.manage");
    const auction = await this.auctionRepository.findById(auctionId);
    if (!auction || auction.created_by_organization_id !== renterOrganizationId) {
      throw new NotFoundError("Auction not found in this organization");
    }
    const participant = await this.auctionRepository.findParticipantById(participantId);
    if (!participant || participant.auction_id !== auctionId) {
      throw new NotFoundError("Participant not found in this auction");
    }
    const record = await this.auctionRepository.updateParticipantStatus(participantId, status);
    return toParticipant(record);
  }

  async placeBid(
    userId: string,
    rentalCompanyOrganizationId: string,
    auctionId: string,
    amount: number,
  ): Promise<AuctionBid> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "auction.participate",
    );
    const participant = await this.auctionRepository.findParticipantByOrganization(
      auctionId,
      rentalCompanyOrganizationId,
    );
    if (!participant || participant.status !== "approved") {
      throw new ForbiddenError("Only an approved participant may bid on this auction");
    }
    const record = await this.auctionRepository.placeBid(auctionId, participant.id, amount);
    return toBid(record);
  }

  async closeAuctionEarly(
    userId: string,
    renterOrganizationId: string,
    auctionId: string,
  ): Promise<Auction> {
    await this.permissionService.requirePermission(userId, renterOrganizationId, "auction.manage");
    const auction = await this.auctionRepository.findById(auctionId);
    if (!auction || auction.created_by_organization_id !== renterOrganizationId) {
      throw new NotFoundError("Auction not found in this organization");
    }
    const record = await this.auctionRepository.closeNow(auctionId);
    return toAuction(record);
  }

  async cancelAuction(
    userId: string,
    renterOrganizationId: string,
    auctionId: string,
  ): Promise<Auction> {
    await this.permissionService.requirePermission(userId, renterOrganizationId, "auction.manage");
    const auction = await this.auctionRepository.findById(auctionId);
    if (!auction || auction.created_by_organization_id !== renterOrganizationId) {
      throw new NotFoundError("Auction not found in this organization");
    }
    if (!canCancel(auction.status)) {
      throw new ConflictError(`Cannot cancel an auction that is ${auction.status}`);
    }
    const record = await this.auctionRepository.cancel(auctionId);
    return toAuction(record);
  }

  // Owner sees the full roster/bid history; a participant sees only its own
  // bids plus the current standing bid (enough to know whether it's
  // leading), never the competitor roster. See
  // docs/marketplace-core-loop-design.md §8 and the "participant isolation"
  // requirement in docs/autonomus-building-instructions.md §26.
  async getAuctionDetail(
    userId: string,
    organizationId: string,
    auctionId: string,
  ): Promise<AuctionDetail> {
    const canManage = await this.permissionService.hasPermission(
      userId,
      organizationId,
      "auction.manage",
    );
    const canParticipate =
      !canManage &&
      (await this.permissionService.hasPermission(userId, organizationId, "auction.participate"));
    if (!canManage && !canParticipate) throw new ForbiddenError();

    const auction = await this.auctionRepository.syncStatus(auctionId);
    if (!auction) throw new NotFoundError("Auction not found");

    const isOwner = auction.created_by_organization_id === organizationId;
    const participant = isOwner
      ? undefined
      : await this.auctionRepository.findParticipantByOrganization(auctionId, organizationId);
    if (!isOwner && !participant) {
      throw new NotFoundError("Auction not found");
    }

    const [participants, bids, result] = await Promise.all([
      this.auctionRepository.listParticipants(auctionId),
      this.auctionRepository.listBids(auctionId),
      this.auctionRepository.findResult(auctionId),
    ]);

    if (isOwner) {
      return {
        auction: toAuction(auction),
        participants: participants.map(toParticipant),
        bids: bids.map(toBid),
        result: result ? toResult(result) : null,
      };
    }

    const leader = pickWinningBid(bids, auction.bidding_direction);
    const ownBids = bids.filter((bid) => bid.participant_id === participant!.id);
    const visibleBids =
      leader && !ownBids.some((bid) => bid.id === leader.id) ? [leader, ...ownBids] : ownBids;
    return {
      auction: toAuction(auction),
      participants: [toParticipant(participant!)],
      bids: visibleBids.map(toBid),
      result: result ? toResult(result) : null,
    };
  }

  async listEvents(
    userId: string,
    renterOrganizationId: string,
    auctionId: string,
  ): Promise<AuctionEvent[]> {
    await this.permissionService.requirePermission(userId, renterOrganizationId, "auction.manage");
    const auction = await this.auctionRepository.findById(auctionId);
    if (!auction || auction.created_by_organization_id !== renterOrganizationId) {
      throw new NotFoundError("Auction not found in this organization");
    }
    const records = await this.auctionRepository.listEvents(auctionId);
    return records.map((record) => ({
      id: record.id,
      auctionId: record.auction_id,
      eventType: record.event_type,
      actorOrganizationId: record.actor_organization_id,
      payload: (record.payload ?? null) as Record<string, unknown> | null,
      createdAt: new Date(record.created_at).toISOString(),
    }));
  }
}
