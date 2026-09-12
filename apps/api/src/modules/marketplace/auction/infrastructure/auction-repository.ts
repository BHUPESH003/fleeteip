import type { ParticipantStatus } from "@fleetip/contracts/auction";
import { sql, type Kysely, type Transaction } from "kysely";
import type { Database } from "../../../../infrastructure/database/types.js";
import { ConflictError, ValidationError } from "../../../../shared/errors.js";
import { isImprovingBid, pickWinningBid } from "../domain/auction-rules.js";
import type {
  AuctionBidRecord,
  AuctionParticipantRecord,
  AuctionRecord,
  AuctionRepositoryPort,
  AuctionResultRecord,
  AuctionSummaryOwnerRow,
  AuctionSummaryParticipantRow,
  CreateAuctionInput,
} from "../domain/ports.js";

const AUCTION_COLUMNS = [
  "id",
  "requirement_id",
  "created_by_organization_id",
  "bidding_direction",
  "base_price",
  "max_bids_per_participant",
  "starts_at",
  "ends_at",
  "status",
  "created_at",
  "updated_at",
] as const;

const BID_COLUMNS = ["id", "auction_id", "participant_id", "amount", "created_at"] as const;

// status/bidding_direction are plain `text` columns — this app is the only
// writer, always through the closed contract enums (same reasoning as
// RentalRepository's toRentalRecord).
function toAuctionRecord(
  row: Omit<AuctionRecord, "status" | "bidding_direction"> & {
    status: string;
    bidding_direction: string;
  },
): AuctionRecord {
  return row as AuctionRecord;
}

function toParticipantRecord(row: Omit<AuctionParticipantRecord, "status"> & { status: string }) {
  return row as AuctionParticipantRecord;
}

export class AuctionRepository implements AuctionRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async create(input: CreateAuctionInput): Promise<AuctionRecord> {
    const row = await this.db
      .insertInto("auctions")
      .values({
        requirement_id: input.requirementId,
        created_by_organization_id: input.createdByOrganizationId,
        bidding_direction: input.biddingDirection,
        base_price: input.basePrice,
        max_bids_per_participant: input.maxBidsPerParticipant ?? null,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        status: "scheduled",
      })
      .returning(AUCTION_COLUMNS)
      .executeTakeFirstOrThrow();
    return toAuctionRecord(row);
  }

  async findById(id: string) {
    const row = await this.db
      .selectFrom("auctions")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toAuctionRecord(row) : undefined;
  }

  async listByRequirement(requirementId: string) {
    const rows = await this.db
      .selectFrom("auctions")
      .selectAll()
      .where("requirement_id", "=", requirementId)
      .orderBy("created_at", "desc")
      .execute();
    return rows.map(toAuctionRecord);
  }

  // One query: every auction this org owns, joined to its requirement (for
  // the project name) and aggregated against auction_participants (count +
  // whether one has been selected) — avoids looping listParticipants per
  // auction for a dashboard/list screen.
  async listByOwnerOrganization(organizationId: string): Promise<AuctionSummaryOwnerRow[]> {
    const result = await sql<AuctionSummaryOwnerRow>`
      SELECT
        a.id, a.requirement_id, a.created_by_organization_id, a.bidding_direction,
        a.base_price, a.max_bids_per_participant, a.starts_at, a.ends_at, a.status,
        a.created_at, a.updated_at,
        r.project_name AS requirement_project_name,
        COUNT(ap.id)::int AS participant_count,
        COALESCE(BOOL_OR(ap.status = 'selected'), false) AS has_selected_participant
      FROM auctions a
      JOIN requirements r ON r.id = a.requirement_id
      LEFT JOIN auction_participants ap ON ap.auction_id = a.id
      WHERE a.created_by_organization_id = ${organizationId}
      GROUP BY a.id, r.project_name
      ORDER BY a.created_at DESC
    `.execute(this.db);
    return result.rows;
  }

  // One query: every auction this org is a participant in, joined to its own
  // participant row (never another organization's) and the requirement's
  // project name.
  async listByParticipantOrganization(
    organizationId: string,
  ): Promise<AuctionSummaryParticipantRow[]> {
    const result = await sql<AuctionSummaryParticipantRow>`
      SELECT
        a.id, a.requirement_id, a.created_by_organization_id, a.bidding_direction,
        a.base_price, a.max_bids_per_participant, a.starts_at, a.ends_at, a.status,
        a.created_at, a.updated_at,
        r.project_name AS requirement_project_name,
        ap.status AS own_participant_status
      FROM auctions a
      JOIN requirements r ON r.id = a.requirement_id
      JOIN auction_participants ap
        ON ap.auction_id = a.id AND ap.rental_company_organization_id = ${organizationId}
      ORDER BY a.created_at DESC
    `.execute(this.db);
    return result.rows;
  }

  // Locks the row, promotes scheduled -> live -> closed as needed, and
  // returns the fresh record — every method below that touches one auction
  // by id runs this first, so the persisted status is never more than one
  // call stale. See docs/marketplace-core-loop-design.md §8.
  private async syncStatusLocked(
    trx: Transaction<Database>,
    id: string,
  ): Promise<AuctionRecord | undefined> {
    const auction = await trx
      .selectFrom("auctions")
      .selectAll()
      .where("id", "=", id)
      .forUpdate()
      .executeTakeFirst();
    if (!auction) return undefined;

    const now = new Date();
    if (auction.status === "scheduled" && now >= new Date(auction.starts_at)) {
      if (now >= new Date(auction.ends_at)) {
        return this.closeLocked(trx, toAuctionRecord(auction));
      }
      const promoted = await trx
        .updateTable("auctions")
        .set({ status: "live", updated_at: now })
        .where("id", "=", id)
        .returning(AUCTION_COLUMNS)
        .executeTakeFirstOrThrow();
      return toAuctionRecord(promoted);
    }
    if (auction.status === "live" && now >= new Date(auction.ends_at)) {
      return this.closeLocked(trx, toAuctionRecord(auction));
    }
    return toAuctionRecord(auction);
  }

  private async closeLocked(
    trx: Transaction<Database>,
    auction: AuctionRecord,
  ): Promise<AuctionRecord> {
    const bidRows = await trx
      .selectFrom("auction_bids")
      .selectAll()
      .where("auction_id", "=", auction.id)
      .execute();
    const bids = bidRows as AuctionBidRecord[];
    const winner = pickWinningBid(bids, auction.bidding_direction);

    await trx
      .insertInto("auction_results")
      .values({
        auction_id: auction.id,
        winning_bid_id: winner?.id ?? null,
        winning_amount: winner?.amount ?? null,
      })
      .execute();
    await trx
      .insertInto("auction_events")
      .values({
        auction_id: auction.id,
        event_type: "closed",
        actor_organization_id: null,
        payload: JSON.stringify({
          winningBidId: winner?.id ?? null,
          winningAmount: winner?.amount ?? null,
        }),
      })
      .execute();
    const closed = await trx
      .updateTable("auctions")
      .set({ status: "closed", updated_at: new Date() })
      .where("id", "=", auction.id)
      .returning(AUCTION_COLUMNS)
      .executeTakeFirstOrThrow();
    return toAuctionRecord(closed);
  }

  async syncStatus(id: string) {
    return this.db.transaction().execute((trx) => this.syncStatusLocked(trx, id));
  }

  async closeNow(id: string) {
    return this.db.transaction().execute(async (trx) => {
      const auction = await trx
        .selectFrom("auctions")
        .selectAll()
        .where("id", "=", id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      if (auction.status !== "live" && auction.status !== "scheduled") {
        throw new ConflictError("Auction is not running");
      }
      return this.closeLocked(trx, toAuctionRecord(auction));
    });
  }

  async cancel(id: string) {
    const row = await this.db
      .updateTable("auctions")
      .set({ status: "cancelled", updated_at: new Date() })
      .where("id", "=", id)
      .returning(AUCTION_COLUMNS)
      .executeTakeFirstOrThrow();
    return toAuctionRecord(row);
  }

  async addParticipant(auctionId: string, rentalCompanyOrganizationId: string) {
    const row = await this.db
      .insertInto("auction_participants")
      .values({
        auction_id: auctionId,
        rental_company_organization_id: rentalCompanyOrganizationId,
        status: "pending",
      })
      .returning(["id", "auction_id", "rental_company_organization_id", "status", "created_at"])
      .executeTakeFirstOrThrow();
    return toParticipantRecord(row);
  }

  async findParticipantByOrganization(auctionId: string, rentalCompanyOrganizationId: string) {
    const row = await this.db
      .selectFrom("auction_participants")
      .selectAll()
      .where("auction_id", "=", auctionId)
      .where("rental_company_organization_id", "=", rentalCompanyOrganizationId)
      .executeTakeFirst();
    return row ? toParticipantRecord(row) : undefined;
  }

  async findParticipantById(participantId: string) {
    const row = await this.db
      .selectFrom("auction_participants")
      .selectAll()
      .where("id", "=", participantId)
      .executeTakeFirst();
    return row ? toParticipantRecord(row) : undefined;
  }

  async listParticipants(auctionId: string) {
    const rows = await this.db
      .selectFrom("auction_participants")
      .selectAll()
      .where("auction_id", "=", auctionId)
      .execute();
    return rows.map(toParticipantRecord);
  }

  async updateParticipantStatus(participantId: string, status: ParticipantStatus) {
    const row = await this.db
      .updateTable("auction_participants")
      .set({ status })
      .where("id", "=", participantId)
      .returning(["id", "auction_id", "rental_company_organization_id", "status", "created_at"])
      .executeTakeFirstOrThrow();
    return toParticipantRecord(row);
  }

  async placeBid(auctionId: string, participantId: string, amount: number) {
    return this.db.transaction().execute(async (trx) => {
      const synced = await this.syncStatusLocked(trx, auctionId);
      if (!synced) {
        throw new ConflictError("Auction not found");
      }
      if (synced.status !== "live") {
        throw new ConflictError(
          synced.status === "scheduled"
            ? "Auction has not started yet"
            : `Auction is ${synced.status}`,
        );
      }

      if (synced.max_bids_per_participant !== null) {
        const countRow = await trx
          .selectFrom("auction_bids")
          .select((eb) => eb.fn.countAll<string>().as("count"))
          .where("auction_id", "=", auctionId)
          .where("participant_id", "=", participantId)
          .executeTakeFirstOrThrow();
        if (Number(countRow.count) >= synced.max_bids_per_participant) {
          throw new ConflictError("Bid limit reached for this participant");
        }
      }

      const bidRows = await trx
        .selectFrom("auction_bids")
        .selectAll()
        .where("auction_id", "=", auctionId)
        .execute();
      const bids = bidRows as AuctionBidRecord[];
      const leader = pickWinningBid(bids, synced.bidding_direction);
      if (!isImprovingBid(amount, synced.base_price, leader, synced.bidding_direction)) {
        throw new ValidationError("Bid does not improve on the current standing bid");
      }

      const bidRow = await trx
        .insertInto("auction_bids")
        .values({ auction_id: auctionId, participant_id: participantId, amount })
        .returning(BID_COLUMNS)
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("auction_events")
        .values({
          auction_id: auctionId,
          event_type: "bid_placed",
          actor_organization_id: null,
          payload: JSON.stringify({ participantId, amount }),
        })
        .execute();
      return bidRow as AuctionBidRecord;
    });
  }

  async listBids(auctionId: string) {
    const rows = await this.db
      .selectFrom("auction_bids")
      .selectAll()
      .where("auction_id", "=", auctionId)
      .orderBy("created_at", "asc")
      .execute();
    return rows as AuctionBidRecord[];
  }

  async findResult(auctionId: string) {
    const row = await this.db
      .selectFrom("auction_results")
      .selectAll()
      .where("auction_id", "=", auctionId)
      .executeTakeFirst();
    return row as AuctionResultRecord | undefined;
  }

  async listEvents(auctionId: string) {
    const rows = await this.db
      .selectFrom("auction_events")
      .selectAll()
      .where("auction_id", "=", auctionId)
      .orderBy("created_at", "asc")
      .execute();
    return rows;
  }
}
