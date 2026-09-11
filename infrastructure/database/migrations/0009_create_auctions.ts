import { type Kysely, sql } from "kysely";

/**
 * Creates the Auction schema (auctions, participants, bids, append-only
 * event log, and a one-row-per-auction result) plus the `auction.manage`
 * (Renter) / `auction.participate` (Rental Company) permissions, granted to
 * `owner` in this same migration.
 *
 * Ordered before quotations (0010) on purpose: `commercial_quotations.
 * source_auction_id` references `auctions.id`, and auctions never reference
 * quotations — putting auctions first avoids a forward-reference FK.
 *
 * See docs/marketplace-core-loop-design.md §8.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("auctions")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("requirement_id", "uuid", (col) =>
      col.notNull().references("requirements.id").onDelete("cascade"),
    )
    .addColumn("created_by_organization_id", "uuid", (col) =>
      col.notNull().references("organizations.id").onDelete("cascade"),
    )
    .addColumn("bidding_direction", "text", (col) => col.notNull())
    .addColumn("base_price", "numeric", (col) => col.notNull())
    .addColumn("max_bids_per_participant", "integer")
    .addColumn("starts_at", "timestamptz", (col) => col.notNull())
    .addColumn("ends_at", "timestamptz", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema
    .createIndex("auctions_requirement_id_idx")
    .on("auctions")
    .column("requirement_id")
    .execute();

  await db.schema
    .createTable("auction_participants")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("auction_id", "uuid", (col) =>
      col.notNull().references("auctions.id").onDelete("cascade"),
    )
    .addColumn("rental_company_organization_id", "uuid", (col) =>
      col.notNull().references("organizations.id").onDelete("cascade"),
    )
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("auction_participants_auction_id_org_id_key", [
      "auction_id",
      "rental_company_organization_id",
    ])
    .execute();

  await db.schema
    .createTable("auction_bids")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("auction_id", "uuid", (col) =>
      col.notNull().references("auctions.id").onDelete("cascade"),
    )
    .addColumn("participant_id", "uuid", (col) =>
      col.notNull().references("auction_participants.id").onDelete("cascade"),
    )
    .addColumn("amount", "numeric", (col) => col.notNull())
    // Server time is the sole source of truth for bid ordering — never
    // client-supplied. See docs/marketplace-core-loop-design.md §8.
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema
    .createIndex("auction_bids_auction_id_idx")
    .on("auction_bids")
    .column("auction_id")
    .execute();

  await db.schema
    .createTable("auction_events")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("auction_id", "uuid", (col) =>
      col.notNull().references("auctions.id").onDelete("cascade"),
    )
    .addColumn("event_type", "text", (col) => col.notNull())
    .addColumn("actor_organization_id", "uuid", (col) =>
      col.references("organizations.id").onDelete("set null"),
    )
    .addColumn("payload", "jsonb")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema
    .createIndex("auction_events_auction_id_idx")
    .on("auction_events")
    .column("auction_id")
    .execute();

  await db.schema
    .createTable("auction_results")
    .addColumn("auction_id", "uuid", (col) =>
      col.primaryKey().references("auctions.id").onDelete("cascade"),
    )
    .addColumn("winning_bid_id", "uuid", (col) =>
      col.references("auction_bids.id").onDelete("restrict"),
    )
    .addColumn("winning_amount", "numeric")
    .addColumn("closed_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  const permissions = await db
    .insertInto("permissions")
    .values([{ code: "auction.manage" }, { code: "auction.participate" }])
    .returning(["id"])
    .execute();

  const ownerRole = await db
    .selectFrom("roles")
    .select("id")
    .where("name", "=", "owner")
    .executeTakeFirstOrThrow();

  await db
    .insertInto("role_permissions")
    .values(
      permissions.map((permission) => ({ role_id: ownerRole.id, permission_id: permission.id })),
    )
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  const permissions = await db
    .selectFrom("permissions")
    .select("id")
    .where("code", "in", ["auction.manage", "auction.participate"])
    .execute();
  if (permissions.length > 0) {
    await db
      .deleteFrom("role_permissions")
      .where(
        "permission_id",
        "in",
        permissions.map((permission) => permission.id),
      )
      .execute();
  }
  await db
    .deleteFrom("permissions")
    .where("code", "in", ["auction.manage", "auction.participate"])
    .execute();

  await db.schema.dropTable("auction_results").execute();
  await db.schema.dropTable("auction_events").execute();
  await db.schema.dropTable("auction_bids").execute();
  await db.schema.dropTable("auction_participants").execute();
  await db.schema.dropTable("auctions").execute();
}
