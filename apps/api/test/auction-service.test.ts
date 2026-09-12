import { describe, expect, it } from "vitest";
import type { OrganizationTypeCode } from "@fleetip/contracts/organization";
import type {
  ActiveMembershipRecord,
  MembershipRepositoryPort,
  OrganizationRepositoryPort,
} from "../src/modules/organizations/domain/ports.js";
import type { RoleRepositoryPort } from "../src/modules/permissions/domain/ports.js";
import { PermissionService } from "../src/modules/permissions/application/permission-service.js";
import type {
  RequirementRecord,
  RequirementRepositoryPort,
} from "../src/modules/marketplace/rfq/domain/ports.js";
import {
  isImprovingBid,
  pickWinningBid,
} from "../src/modules/marketplace/auction/domain/auction-rules.js";
import type {
  AuctionBidRecord,
  AuctionEventRecord,
  AuctionParticipantRecord,
  AuctionRecord,
  AuctionRepositoryPort,
  AuctionResultRecord,
  CreateAuctionInput,
} from "../src/modules/marketplace/auction/domain/ports.js";
import { AuctionService } from "../src/modules/marketplace/auction/application/auction-service.js";
import type { NotificationRepositoryPort } from "../src/modules/notification/domain/ports.js";
import { NotificationService } from "../src/modules/notification/application/notification-service.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../src/shared/errors.js";

const OWNER_ROLE_ID = "role-owner";
const RENTER_ORG_ID = "org-renter";
const OTHER_RENTER_ORG_ID = "org-other-renter";
const RC_ORG_ID = "org-rental-company";
const OTHER_RC_ORG_ID = "org-other-rental-company";
const REQUIREMENT_ID = "requirement-1";

function fakePermissionService(organizationTypeCode: OrganizationTypeCode = "renter") {
  const membershipRepository: MembershipRepositoryPort = {
    findActiveMembership: async (): Promise<ActiveMembershipRecord | undefined> => ({
      id: "membership-1",
      status: "active",
      role_id: OWNER_ROLE_ID,
    }),
    create: async () => {
      throw new Error("not used in this test");
    },
    listWithOrganizationByUserId: async () => [],
  };
  const roleRepository: RoleRepositoryPort = {
    findByName: async (name) => ({ id: OWNER_ROLE_ID, name }),
    hasPermission: async (roleId) => roleId === OWNER_ROLE_ID,
    listPermissionCodesByRoleId: async (roleId) =>
      roleId === OWNER_ROLE_ID ? ["auction.manage", "auction.participate"] : [],
  };
  return new PermissionService(
    membershipRepository,
    roleRepository,
    fakeOrganizationTypeRepository({
      [RENTER_ORG_ID]: organizationTypeCode,
      [OTHER_RENTER_ORG_ID]: "renter",
      [RC_ORG_ID]: "rental_company",
      [OTHER_RC_ORG_ID]: "rental_company",
    }),
  );
}

// Every caller swallows notification failures (best-effort side effect), so
// a throwing fake is sufficient wherever this file isn't testing
// notification behavior itself.
function fakeNotificationService(): NotificationService {
  const throwingRepo: NotificationRepositoryPort = {
    create: async () => {
      throw new Error("not used in this test");
    },
    listByOrganization: async () => {
      throw new Error("not used in this test");
    },
    countUnread: async () => {
      throw new Error("not used in this test");
    },
    markRead: async () => {
      throw new Error("not used in this test");
    },
    markAllRead: async () => {
      throw new Error("not used in this test");
    },
  };
  return new NotificationService(throwingRepo, fakePermissionService());
}

function fakeOrgRepo(): OrganizationRepositoryPort {
  return fakeOrganizationTypeRepository({
    [RENTER_ORG_ID]: "renter",
    [OTHER_RENTER_ORG_ID]: "renter",
    [RC_ORG_ID]: "rental_company",
    [OTHER_RC_ORG_ID]: "rental_company",
  });
}

function fakeOrganizationTypeRepository(
  organizationTypes: Record<string, OrganizationTypeCode>,
): OrganizationRepositoryPort {
  return {
    findTypeByCode: async () => {
      throw new Error("not used in this test");
    },
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async (id) => {
      const organizationTypeCode = organizationTypes[id];
      if (!organizationTypeCode) return undefined;
      return {
        id,
        organization_type_id: `type-${organizationTypeCode}`,
        name: `Org ${id}`,
        code: "TESTORG",
        created_at: new Date(),
      };
    },
    findWithTypeById: async (id) => {
      const organizationTypeCode = organizationTypes[id];
      if (!organizationTypeCode) return undefined;
      return {
        id,
        organization_type_id: `type-${organizationTypeCode}`,
        organization_type_code: organizationTypeCode,
        name: `Org ${id}`,
        code: "TESTORG",
        created_at: new Date(),
      };
    },
    codeExists: async () => {
      throw new Error("not used in this test");
    },
    listByType: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeRequirementRepository(
  requirements: RequirementRecord[] = [
    {
      id: REQUIREMENT_ID,
      renter_organization_id: RENTER_ORG_ID,
      product_subcategory_id: "subcategory-1",
      capacity: null,
      capacity_unit: null,
      quantity: 1,
      project_name: null,
      project_location: null,
      requested_start_date: "2026-03-01",
      expected_duration_value: null,
      expected_duration_unit: null,
      shift_requirement: null,
      validity_date: "2026-02-15",
      status: "open",
      notes: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ],
): RequirementRepositoryPort {
  return {
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async (id) => requirements.find((r) => r.id === id),
    listByRenter: async () => {
      throw new Error("not used in this test");
    },
    listOpenForDiscovery: async () => {
      throw new Error("not used in this test");
    },
    updateStatus: async () => {
      throw new Error("not used in this test");
    },
    updateFields: async () => {
      throw new Error("not used in this test");
    },
  };
}

// Mirrors AuctionRepository's transactional logic against an in-memory
// store, reusing the same pure domain functions the real repository uses —
// this tests AuctionService's orchestration, not Postgres's row-locking
// (that guarantee is verified by manual/E2E testing against a real DB).
function fakeAuctionRepository(): AuctionRepositoryPort {
  const auctions = new Map<string, AuctionRecord>();
  const participants = new Map<string, AuctionParticipantRecord>();
  const bids = new Map<string, AuctionBidRecord>();
  const results = new Map<string, AuctionResultRecord>();
  const events: AuctionEventRecord[] = [];
  let nextId = 1;

  function close(auction: AuctionRecord): AuctionRecord {
    const auctionBids = [...bids.values()].filter((b) => b.auction_id === auction.id);
    const winner = pickWinningBid(auctionBids, auction.bidding_direction);
    results.set(auction.id, {
      auction_id: auction.id,
      winning_bid_id: winner?.id ?? null,
      winning_amount: winner?.amount ?? null,
      closed_at: new Date(),
    });
    events.push({
      id: `event-${nextId++}`,
      auction_id: auction.id,
      event_type: "closed",
      actor_organization_id: null,
      payload: { winningBidId: winner?.id ?? null },
      created_at: new Date(),
    });
    const updated: AuctionRecord = { ...auction, status: "closed", updated_at: new Date() };
    auctions.set(auction.id, updated);
    return updated;
  }

  function syncStatus(id: string): AuctionRecord | undefined {
    const auction = auctions.get(id);
    if (!auction) return undefined;
    const now = new Date();
    if (auction.status === "scheduled" && now >= new Date(auction.starts_at)) {
      if (now >= new Date(auction.ends_at)) return close(auction);
      const updated: AuctionRecord = { ...auction, status: "live", updated_at: now };
      auctions.set(id, updated);
      return updated;
    }
    if (auction.status === "live" && now >= new Date(auction.ends_at)) {
      return close(auction);
    }
    return auction;
  }

  return {
    create: async (input: CreateAuctionInput) => {
      const record: AuctionRecord = {
        id: `auction-${nextId++}`,
        requirement_id: input.requirementId,
        created_by_organization_id: input.createdByOrganizationId,
        bidding_direction: input.biddingDirection,
        base_price: input.basePrice,
        max_bids_per_participant: input.maxBidsPerParticipant ?? null,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        status: "scheduled",
        created_at: new Date(),
        updated_at: new Date(),
      };
      auctions.set(record.id, record);
      return record;
    },
    findById: async (id) => auctions.get(id),
    listByRequirement: async (requirementId) =>
      [...auctions.values()].filter((a) => a.requirement_id === requirementId),
    syncStatus: async (id) => syncStatus(id),
    closeNow: async (id) => {
      const auction = auctions.get(id);
      if (!auction) throw new Error("not used in this test");
      if (auction.status !== "live" && auction.status !== "scheduled") {
        throw new ConflictError("Auction is not running");
      }
      return close(auction);
    },
    cancel: async (id) => {
      const auction = auctions.get(id);
      if (!auction) throw new Error("not used in this test");
      const updated: AuctionRecord = { ...auction, status: "cancelled", updated_at: new Date() };
      auctions.set(id, updated);
      return updated;
    },
    addParticipant: async (auctionId, rentalCompanyOrganizationId) => {
      const record: AuctionParticipantRecord = {
        id: `participant-${nextId++}`,
        auction_id: auctionId,
        rental_company_organization_id: rentalCompanyOrganizationId,
        status: "pending",
        created_at: new Date(),
      };
      participants.set(record.id, record);
      return record;
    },
    findParticipantByOrganization: async (auctionId, rentalCompanyOrganizationId) =>
      [...participants.values()].find(
        (p) =>
          p.auction_id === auctionId &&
          p.rental_company_organization_id === rentalCompanyOrganizationId,
      ),
    findParticipantById: async (participantId) => participants.get(participantId),
    listParticipants: async (auctionId) =>
      [...participants.values()].filter((p) => p.auction_id === auctionId),
    updateParticipantStatus: async (participantId, status) => {
      const existing = participants.get(participantId);
      if (!existing) throw new Error("not used in this test");
      const updated = { ...existing, status };
      participants.set(participantId, updated);
      return updated;
    },
    placeBid: async (auctionId, participantId, amount) => {
      const synced = syncStatus(auctionId);
      if (!synced) throw new ConflictError("Auction not found");
      if (synced.status !== "live") {
        throw new ConflictError(
          synced.status === "scheduled"
            ? "Auction has not started yet"
            : `Auction is ${synced.status}`,
        );
      }
      if (synced.max_bids_per_participant !== null) {
        const count = [...bids.values()].filter(
          (b) => b.auction_id === auctionId && b.participant_id === participantId,
        ).length;
        if (count >= synced.max_bids_per_participant) {
          throw new ConflictError("Bid limit reached for this participant");
        }
      }
      const auctionBids = [...bids.values()].filter((b) => b.auction_id === auctionId);
      const leader = pickWinningBid(auctionBids, synced.bidding_direction);
      if (!isImprovingBid(amount, synced.base_price, leader, synced.bidding_direction)) {
        throw new ValidationError("Bid does not improve on the current standing bid");
      }
      const record: AuctionBidRecord = {
        id: `bid-${nextId++}`,
        auction_id: auctionId,
        participant_id: participantId,
        amount,
        created_at: new Date(),
      };
      bids.set(record.id, record);
      return record;
    },
    listBids: async (auctionId) => [...bids.values()].filter((b) => b.auction_id === auctionId),
    findResult: async (auctionId) => results.get(auctionId),
    listEvents: async (auctionId) => events.filter((e) => e.auction_id === auctionId),
  };
}

const RUNNING_WINDOW = {
  startsAt: new Date(Date.now() - 60_000).toISOString(),
  endsAt: new Date(Date.now() + 60_000).toISOString(),
};

function buildService(requirements?: RequirementRecord[]) {
  return new AuctionService(
    fakeAuctionRepository(),
    fakeRequirementRepository(requirements),
    fakePermissionService(),
    fakeOrgRepo(),
    fakeNotificationService(),
  );
}

async function createRunningAuction(service: AuctionService) {
  return service.createAuction("user-1", RENTER_ORG_ID, {
    requirementId: REQUIREMENT_ID,
    biddingDirection: "ascending",
    basePrice: 1000,
    startsAt: RUNNING_WINDOW.startsAt,
    endsAt: RUNNING_WINDOW.endsAt,
  });
}

async function approvedParticipant(
  service: AuctionService,
  auctionId: string,
  organizationId = RC_ORG_ID,
) {
  const participant = await service.requestToJoin("user-2", organizationId, auctionId);
  return service.reviewParticipant("user-1", RENTER_ORG_ID, auctionId, participant.id, "approved");
}

describe("AuctionService", () => {
  it("rejects creating an auction against a requirement in a different organization", async () => {
    const service = buildService();
    await expect(
      service.createAuction("user-1", OTHER_RENTER_ORG_ID, {
        requirementId: REQUIREMENT_ID,
        biddingDirection: "ascending",
        basePrice: 1000,
        ...RUNNING_WINDOW,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects creating an auction against a requirement that isn't open", async () => {
    const service = buildService([
      {
        id: REQUIREMENT_ID,
        renter_organization_id: RENTER_ORG_ID,
        product_subcategory_id: "subcategory-1",
        capacity: null,
        capacity_unit: null,
        quantity: 1,
        project_name: null,
        project_location: null,
        requested_start_date: "2026-03-01",
        expected_duration_value: null,
        expected_duration_unit: null,
        shift_requirement: null,
        validity_date: "2026-02-15",
        status: "closed",
        notes: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
    await expect(
      service.createAuction("user-1", RENTER_ORG_ID, {
        requirementId: REQUIREMENT_ID,
        biddingDirection: "ascending",
        basePrice: 1000,
        ...RUNNING_WINDOW,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects auction management for a Rental Company organization", async () => {
    const service = new AuctionService(
      fakeAuctionRepository(),
      fakeRequirementRepository(),
      fakePermissionService("rental_company"),
      fakeOrgRepo(),
      fakeNotificationService(),
    );
    await expect(createRunningAuction(service)).rejects.toThrow(ForbiddenError);
  });

  it("lets a Rental Company request to join and the Renter approve it", async () => {
    const service = buildService();
    const auction = await createRunningAuction(service);
    const participant = await service.requestToJoin("user-2", RC_ORG_ID, auction.id);
    expect(participant.status).toBe("pending");

    const approved = await service.reviewParticipant(
      "user-1",
      RENTER_ORG_ID,
      auction.id,
      participant.id,
      "approved",
    );
    expect(approved.status).toBe("approved");
  });

  it("rejects an unauthorized bid from an organization that never joined", async () => {
    const service = buildService();
    const auction = await createRunningAuction(service);
    await expect(service.placeBid("user-2", RC_ORG_ID, auction.id, 1000)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("rejects a bid from a participant still pending approval", async () => {
    const service = buildService();
    const auction = await createRunningAuction(service);
    await service.requestToJoin("user-2", RC_ORG_ID, auction.id);
    await expect(service.placeBid("user-2", RC_ORG_ID, auction.id, 1000)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("rejects a bid that does not improve on the base price", async () => {
    const service = buildService();
    const auction = await createRunningAuction(service);
    await approvedParticipant(service, auction.id);
    await expect(service.placeBid("user-2", RC_ORG_ID, auction.id, 900)).rejects.toThrow(
      ValidationError,
    );
  });

  it("accepts a strictly improving bid and rejects the next equal one", async () => {
    const service = buildService();
    const auction = await createRunningAuction(service);
    await approvedParticipant(service, auction.id);
    const bid = await service.placeBid("user-2", RC_ORG_ID, auction.id, 1200);
    expect(bid.amount).toBe(1200);

    await expect(service.placeBid("user-2", RC_ORG_ID, auction.id, 1200)).rejects.toThrow(
      ValidationError,
    );
  });

  it("enforces the per-participant bid cap", async () => {
    const service = new AuctionService(
      fakeAuctionRepository(),
      fakeRequirementRepository(),
      fakePermissionService(),
      fakeOrgRepo(),
      fakeNotificationService(),
    );
    const auction = await service.createAuction("user-1", RENTER_ORG_ID, {
      requirementId: REQUIREMENT_ID,
      biddingDirection: "ascending",
      basePrice: 1000,
      maxBidsPerParticipant: 1,
      ...RUNNING_WINDOW,
    });
    await approvedParticipant(service, auction.id);
    await service.placeBid("user-2", RC_ORG_ID, auction.id, 1200);
    await expect(service.placeBid("user-2", RC_ORG_ID, auction.id, 1300)).rejects.toThrow(
      ConflictError,
    );
  });

  it("rejects a bid placed after the auction has ended", async () => {
    const service = buildService();
    const auction = await service.createAuction("user-1", RENTER_ORG_ID, {
      requirementId: REQUIREMENT_ID,
      biddingDirection: "ascending",
      basePrice: 1000,
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      endsAt: new Date(Date.now() + 50).toISOString(),
    });
    // Joins and gets approved while the auction is still live.
    await approvedParticipant(service, auction.id);
    await new Promise((resolve) => setTimeout(resolve, 100));

    await expect(service.placeBid("user-2", RC_ORG_ID, auction.id, 1200)).rejects.toThrow(
      ConflictError,
    );
  });

  it("closes early and persists the winning bid as an auditable result", async () => {
    const service = buildService();
    const auction = await createRunningAuction(service);
    await approvedParticipant(service, auction.id);
    await service.placeBid("user-2", RC_ORG_ID, auction.id, 1200);

    const closed = await service.closeAuctionEarly("user-1", RENTER_ORG_ID, auction.id);
    expect(closed.status).toBe("closed");

    const detail = await service.getAuctionDetail("user-1", RENTER_ORG_ID, auction.id);
    expect(detail.result?.winningAmount).toBe(1200);
  });

  it("lazily closes an expired auction and computes the winner on next touch", async () => {
    const service = buildService();
    const auction = await service.createAuction("user-1", RENTER_ORG_ID, {
      requirementId: REQUIREMENT_ID,
      biddingDirection: "descending",
      basePrice: 1000,
      startsAt: new Date(Date.now() - 5000).toISOString(),
      endsAt: new Date(Date.now() + 50).toISOString(),
    });
    await approvedParticipant(service, auction.id);
    await service.placeBid("user-2", RC_ORG_ID, auction.id, 900);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const detail = await service.getAuctionDetail("user-1", RENTER_ORG_ID, auction.id);
    expect(detail.auction.status).toBe("closed");
    expect(detail.result?.winningAmount).toBe(900);
  });

  it("hides the competitor roster from a participant's own auction view", async () => {
    const service = buildService();
    const auction = await createRunningAuction(service);
    await approvedParticipant(service, auction.id, RC_ORG_ID);
    await service.placeBid("user-2", RC_ORG_ID, auction.id, 1200);
    await approvedParticipant(service, auction.id, OTHER_RC_ORG_ID);
    await service.placeBid("user-3", OTHER_RC_ORG_ID, auction.id, 1300);

    const view = await service.getAuctionDetail("user-2", RC_ORG_ID, auction.id);
    expect(view.participants).toHaveLength(1);
    expect(view.participants[0]?.rentalCompanyOrganizationId).toBe(RC_ORG_ID);
    // Sees its own bid plus the current leading amount, never the full roster.
    expect(view.bids.every((bid) => bid.amount === 1200 || bid.amount === 1300)).toBe(true);
  });

  it("hides an auction entirely from an organization that never joined it", async () => {
    const service = buildService();
    const auction = await createRunningAuction(service);
    await expect(service.getAuctionDetail("user-3", OTHER_RC_ORG_ID, auction.id)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("rejects cancelling an auction that has already closed", async () => {
    const service = buildService();
    const auction = await createRunningAuction(service);
    await service.closeAuctionEarly("user-1", RENTER_ORG_ID, auction.id);
    await expect(service.cancelAuction("user-1", RENTER_ORG_ID, auction.id)).rejects.toThrow(
      ConflictError,
    );
  });

  describe("selectParticipant", () => {
    it("lets the owner select an approved participant once the auction has closed", async () => {
      const service = buildService();
      const auction = await createRunningAuction(service);
      const participant = await approvedParticipant(service, auction.id);
      await service.placeBid("user-2", RC_ORG_ID, auction.id, 1200);
      await service.closeAuctionEarly("user-1", RENTER_ORG_ID, auction.id);

      const selected = await service.selectParticipant(
        "user-1",
        RENTER_ORG_ID,
        auction.id,
        participant.id,
      );
      expect(selected.status).toBe("selected");
      expect(selected.rentalCompanyOrganizationName).toBe(`Org ${RC_ORG_ID}`);
    });

    it("rejects selecting a participant before the auction has closed", async () => {
      const service = buildService();
      const auction = await createRunningAuction(service);
      const participant = await approvedParticipant(service, auction.id);
      await expect(
        service.selectParticipant("user-1", RENTER_ORG_ID, auction.id, participant.id),
      ).rejects.toThrow(ConflictError);
    });

    it("rejects selecting a participant who was never approved", async () => {
      const service = buildService();
      const auction = await createRunningAuction(service);
      const participant = await service.requestToJoin("user-2", RC_ORG_ID, auction.id);
      await service.closeAuctionEarly("user-1", RENTER_ORG_ID, auction.id);
      await expect(
        service.selectParticipant("user-1", RENTER_ORG_ID, auction.id, participant.id),
      ).rejects.toThrow(ConflictError);
    });

    it("rejects selecting a second participant once one has already been selected", async () => {
      const service = buildService();
      const auction = await createRunningAuction(service);
      const first = await approvedParticipant(service, auction.id, RC_ORG_ID);
      const second = await approvedParticipant(service, auction.id, OTHER_RC_ORG_ID);
      await service.closeAuctionEarly("user-1", RENTER_ORG_ID, auction.id);
      await service.selectParticipant("user-1", RENTER_ORG_ID, auction.id, first.id);
      await expect(
        service.selectParticipant("user-1", RENTER_ORG_ID, auction.id, second.id),
      ).rejects.toThrow(ConflictError);
    });

    it("rejects a Rental Company (non-owner) attempting to select a participant", async () => {
      const service = buildService();
      const auction = await createRunningAuction(service);
      const participant = await approvedParticipant(service, auction.id);
      await service.closeAuctionEarly("user-1", RENTER_ORG_ID, auction.id);
      await expect(
        service.selectParticipant("user-2", RC_ORG_ID, auction.id, participant.id),
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
