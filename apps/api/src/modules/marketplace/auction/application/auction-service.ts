import type {
  Auction,
  AuctionBid,
  AuctionDetail,
  AuctionEvent,
  AuctionParticipant,
  AuctionResult,
  AuctionSummary,
  CreateAuctionRequest,
} from "@fleetip/contracts/auction";
import { ConflictError, ForbiddenError, NotFoundError } from "../../../../shared/errors.js";
import type { OrganizationRepositoryPort } from "../../../organizations/domain/ports.js";
import type { RequirementRepositoryPort } from "../../rfq/domain/ports.js";
import { NotificationService } from "../../../notification/application/notification-service.js";
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

function toParticipant(
  record: AuctionParticipantRecord,
  organizationName: string,
): AuctionParticipant {
  return {
    id: record.id,
    auctionId: record.auction_id,
    rentalCompanyOrganizationId: record.rental_company_organization_id,
    rentalCompanyOrganizationName: organizationName,
    status: record.status,
    createdAt: new Date(record.created_at).toISOString(),
  };
}

function toBid(
  record: AuctionBidRecord,
  isLeading: boolean,
  organizationName: string | null,
): AuctionBid {
  return {
    id: record.id,
    auctionId: record.auction_id,
    participantId: record.participant_id,
    amount: record.amount,
    createdAt: new Date(record.created_at).toISOString(),
    isLeading,
    rentalCompanyOrganizationName: organizationName,
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
    private readonly organizationRepository: OrganizationRepositoryPort,
    private readonly notificationService: NotificationService,
  ) {}

  // Resolves organization ids to display names in bulk — one lookup per
  // unique id, not per row. Fine at this app's participant-count scale;
  // revisit only if a real auction ever has dozens of bidders.
  private async resolveOrganizationNames(organizationIds: string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(organizationIds)];
    const entries = await Promise.all(
      uniqueIds.map(async (id): Promise<[string, string]> => {
        const organization = await this.organizationRepository.findById(id);
        return [id, organization?.name ?? "Unknown organization"];
      }),
    );
    return new Map(entries);
  }

  // Notification failures must never block the real business action they're
  // attached to — this is a best-effort side effect, not part of the
  // transaction.
  private async notify(input: Parameters<NotificationService["notify"]>[0]): Promise<void> {
    try {
      await this.notificationService.notify(input);
    } catch {
      // swallow — see comment above.
    }
  }

  // Fires when a caller's touch causes AuctionRepository's lazy
  // scheduled->live->closed transition to actually happen — deliberately
  // detected at the SERVICE layer, never inside the repository: every
  // repository in this codebase depends only on Kysely, never on another
  // service, and this stays that way. Wired into the handful of read paths
  // that a caller (owner or participant, including this page's own ~4s
  // live-auction poll) actually exercises, not every single action method —
  // a bid, for instance, can never by itself cause a close (it only
  // succeeds while still "live"), so it isn't wired here.
  private async notifyOnTransition(
    before: AuctionRecord["status"] | undefined,
    after: AuctionRecord,
  ): Promise<void> {
    if (before === after.status) return;
    if (before === "scheduled" && after.status === "live") {
      const participants = await this.auctionRepository.listParticipants(after.id);
      for (const p of participants.filter((p) => p.status === "approved")) {
        await this.notify({
          recipientOrganizationId: p.rental_company_organization_id,
          type: "auction.started",
          title: "Auction started",
          message: "An auction you're approved to bid on has started.",
          relatedResourceType: "auction",
          relatedResourceId: after.id,
        });
      }
    } else if ((before === "scheduled" || before === "live") && after.status === "closed") {
      await this.notify({
        recipientOrganizationId: after.created_by_organization_id,
        type: "auction.ended",
        title: "Auction ended",
        message: "Your auction has ended — review the bids and select a participant.",
        relatedResourceType: "auction",
        relatedResourceId: after.id,
      });
      const participants = await this.auctionRepository.listParticipants(after.id);
      for (const p of participants.filter((p) => p.status === "approved")) {
        await this.notify({
          recipientOrganizationId: p.rental_company_organization_id,
          type: "auction.ended",
          title: "Auction ended",
          message: "An auction you participated in has ended.",
          relatedResourceType: "auction",
          relatedResourceId: after.id,
        });
      }
    }
  }

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

  // Org-scoped dashboard/list view — a Renter sees every auction it owns, a
  // Rental Company sees every auction it participates in, without looping
  // getAuctionDetail (N+1) over each one. Mirrors RentalService.listRentals'
  // org-type branch.
  async listAuctionsForOrganization(
    userId: string,
    organizationId: string,
  ): Promise<AuctionSummary[]> {
    const organization = await this.organizationRepository.findWithTypeById(organizationId);
    if (organization?.organization_type_code === "rental_company") {
      await this.permissionService.requirePermission(userId, organizationId, "auction.participate");
      const rows = await this.auctionRepository.listByParticipantOrganization(organizationId);
      return rows.map((row) => ({
        ...toAuction(row),
        requirementProjectName: row.requirement_project_name,
        participantCount: null,
        ownParticipantStatus: row.own_participant_status,
        needsAttention: row.own_participant_status === "selected",
      }));
    }

    await this.permissionService.requirePermission(userId, organizationId, "auction.manage");
    const rows = await this.auctionRepository.listByOwnerOrganization(organizationId);
    return rows.map((row) => ({
      ...toAuction(row),
      requirementProjectName: row.requirement_project_name,
      participantCount: row.participant_count,
      ownParticipantStatus: null,
      needsAttention: row.status === "closed" && !row.has_selected_participant,
    }));
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
    if (synced) await this.notifyOnTransition(active.status, synced);
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
    const record =
      existing ??
      (await this.auctionRepository.addParticipant(auctionId, rentalCompanyOrganizationId));
    const organizationName = (
      await this.resolveOrganizationNames([rentalCompanyOrganizationId])
    ).get(rentalCompanyOrganizationId) as string;
    return toParticipant(record, organizationName);
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
    if (status === "approved") {
      await this.notify({
        recipientOrganizationId: record.rental_company_organization_id,
        type: "auction.participant_approved",
        title: "Approved to bid",
        message: "You were approved to bid in an auction.",
        relatedResourceType: "auction",
        relatedResourceId: auctionId,
      });
    }
    const organizationName = (
      await this.resolveOrganizationNames([record.rental_company_organization_id])
    ).get(record.rental_company_organization_id) as string;
    return toParticipant(record, organizationName);
  }

  // The auction owner's explicit post-close choice of which approved
  // participant to proceed with — distinct from, and not implied by, the
  // bid-ranking "leader". This is the only gate that lets a Rental Company
  // formalize an auction win into a CommercialQuotation (see
  // CommercialQuotationService.assertSelectedParticipant) — closing the gap
  // where the top bidder could otherwise award itself with zero owner
  // action. Selection is a one-time, irreversible action for this MVP, same
  // as an auction's own "closed" status being terminal.
  async selectParticipant(
    userId: string,
    renterOrganizationId: string,
    auctionId: string,
    participantId: string,
  ): Promise<AuctionParticipant> {
    await this.permissionService.requirePermission(userId, renterOrganizationId, "auction.manage");
    const auction = await this.auctionRepository.findById(auctionId);
    if (!auction || auction.created_by_organization_id !== renterOrganizationId) {
      throw new NotFoundError("Auction not found in this organization");
    }
    if (auction.status !== "closed") {
      throw new ConflictError("Can only select a participant once the auction has closed");
    }
    const participant = await this.auctionRepository.findParticipantById(participantId);
    if (!participant || participant.auction_id !== auctionId) {
      throw new NotFoundError("Participant not found in this auction");
    }
    if (participant.status !== "approved") {
      throw new ConflictError("Only an approved participant may be selected");
    }
    const allParticipants = await this.auctionRepository.listParticipants(auctionId);
    if (allParticipants.some((p) => p.status === "selected")) {
      throw new ConflictError("A participant has already been selected for this auction");
    }
    const record = await this.auctionRepository.updateParticipantStatus(participantId, "selected");
    await this.notify({
      recipientOrganizationId: record.rental_company_organization_id,
      type: "auction.participant_selected",
      title: "You were selected",
      message: "The auction owner selected you — you may now create a commercial quotation.",
      relatedResourceType: "auction",
      relatedResourceId: auctionId,
    });
    const organizationName = (
      await this.resolveOrganizationNames([record.rental_company_organization_id])
    ).get(record.rental_company_organization_id) as string;
    return toParticipant(record, organizationName);
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
    const organizationName = (
      await this.resolveOrganizationNames([rentalCompanyOrganizationId])
    ).get(rentalCompanyOrganizationId) as string;
    // placeBid only ever accepts a strictly-improving bid (isImprovingBid),
    // so the bid just placed is always the new leader.
    return toBid(record, true, organizationName);
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
    await this.notifyOnTransition(auction.status, record);
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

    const before = await this.auctionRepository.findById(auctionId);
    const auction = await this.auctionRepository.syncStatus(auctionId);
    if (!auction) throw new NotFoundError("Auction not found");
    await this.notifyOnTransition(before?.status, auction);

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
    const leader = pickWinningBid(bids, auction.bidding_direction);

    if (isOwner) {
      const namesByOrgId = await this.resolveOrganizationNames(
        participants.map((p) => p.rental_company_organization_id),
      );
      const nameByParticipantId = new Map(
        participants.map((p) => [
          p.id,
          namesByOrgId.get(p.rental_company_organization_id) ?? "Unknown organization",
        ]),
      );
      return {
        auction: toAuction(auction),
        participants: participants.map((p) =>
          toParticipant(p, nameByParticipantId.get(p.id) as string),
        ),
        bids: bids.map((bid) =>
          toBid(bid, bid.id === leader?.id, nameByParticipantId.get(bid.participant_id) ?? null),
        ),
        result: result ? toResult(result) : null,
      };
    }

    const ownOrganizationName = (await this.resolveOrganizationNames([organizationId])).get(
      organizationId,
    ) as string;
    const ownBids = bids.filter((bid) => bid.participant_id === participant!.id);
    const visibleBids =
      leader && !ownBids.some((bid) => bid.id === leader.id) ? [leader, ...ownBids] : ownBids;
    return {
      auction: toAuction(auction),
      participants: [toParticipant(participant!, ownOrganizationName)],
      // A competitor's identity must never leak just because their bid
      // (e.g. the current leader) is visible — only reveal the name on
      // bids that belong to the caller's own participant.
      bids: visibleBids.map((bid) =>
        toBid(
          bid,
          bid.id === leader?.id,
          bid.participant_id === participant!.id ? ownOrganizationName : null,
        ),
      ),
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
