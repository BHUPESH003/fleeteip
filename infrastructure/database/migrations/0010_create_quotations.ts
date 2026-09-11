import { type Kysely, sql } from "kysely";

/**
 * Creates the Quotation schema: `quotation_responses` (a Rental Company's
 * lightweight reply to a Requirement), `commercial_quotations` (the formal,
 * negotiable, awardable document — mirrors rentals' term columns exactly),
 * `quotation_offers` (the append-only negotiation trail), and a small
 * per-organization reference-number counter. Plus the `quotation.manage`
 * (Rental Company) / `quotation.respond` (Renter) permissions, granted to
 * `owner` in this same migration.
 *
 * See docs/marketplace-core-loop-design.md §5-§7, §10.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("quotation_responses")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("requirement_id", "uuid", (col) =>
      col.notNull().references("requirements.id").onDelete("cascade"),
    )
    .addColumn("rental_company_organization_id", "uuid", (col) =>
      col.notNull().references("organizations.id").onDelete("cascade"),
    )
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("indicative_rate", "numeric")
    .addColumn("indicative_rate_unit", "text")
    .addColumn("notes", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("quotation_responses_requirement_id_org_id_key", [
      "requirement_id",
      "rental_company_organization_id",
    ])
    .execute();

  // Per-organization reference-number counter — avoids a SELECT MAX(...) scan
  // or advisory lock; `UPDATE ... RETURNING next_value - 1` is race-free.
  await db.schema
    .createTable("quotation_reference_sequences")
    .addColumn("organization_id", "uuid", (col) =>
      col.primaryKey().references("organizations.id").onDelete("cascade"),
    )
    .addColumn("next_value", "integer", (col) => col.notNull().defaultTo(1))
    .execute();

  await db.schema
    .createTable("commercial_quotations")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("rental_company_organization_id", "uuid", (col) =>
      col.notNull().references("organizations.id").onDelete("cascade"),
    )
    .addColumn("renter_organization_id", "uuid", (col) =>
      col.references("organizations.id").onDelete("cascade"),
    )
    .addColumn("client_snapshot", "jsonb")
    .addColumn("requirement_id", "uuid", (col) =>
      col.references("requirements.id").onDelete("set null"),
    )
    .addColumn("quotation_response_id", "uuid", (col) =>
      col.references("quotation_responses.id").onDelete("set null"),
    )
    .addColumn("source_auction_id", "uuid", (col) =>
      col.references("auctions.id").onDelete("set null"),
    )
    .addColumn("reference_number", "text", (col) => col.notNull())
    .addColumn("machine_id", "uuid", (col) =>
      col.notNull().references("machines.id").onDelete("restrict"),
    )
    .addColumn("start_date", "date", (col) => col.notNull())
    .addColumn("end_date", "date")
    .addColumn("rate", "numeric", (col) => col.notNull())
    .addColumn("rate_unit", "text", (col) => col.notNull())
    .addColumn("mobilization_charge", "numeric")
    .addColumn("demobilization_charge", "numeric")
    .addColumn("overtime_rate", "numeric")
    .addColumn("payment_terms", "text")
    .addColumn("shift_structure", "text")
    .addColumn("sunday_condition", "text")
    .addColumn("fuel_norms", "text")
    .addColumn("dehire_terms", "text")
    .addColumn("operator_scope", "text")
    .addColumn("notice_period_days", "integer")
    .addColumn("validity_date", "date", (col) => col.notNull())
    .addColumn("commercial_notes", "text")
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "commercial_quotations_exactly_one_party",
      sql`(renter_organization_id IS NOT NULL) != (client_snapshot IS NOT NULL)`,
    )
    .execute();
  await db.schema
    .createIndex("commercial_quotations_rental_company_organization_id_idx")
    .on("commercial_quotations")
    .column("rental_company_organization_id")
    .execute();
  await db.schema
    .createIndex("commercial_quotations_renter_organization_id_idx")
    .on("commercial_quotations")
    .column("renter_organization_id")
    .execute();

  await db.schema
    .createTable("quotation_offers")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("quotation_id", "uuid", (col) =>
      col.notNull().references("commercial_quotations.id").onDelete("cascade"),
    )
    .addColumn("offered_by_organization_id", "uuid", (col) =>
      col.notNull().references("organizations.id").onDelete("cascade"),
    )
    .addColumn("rate", "numeric", (col) => col.notNull())
    .addColumn("rate_unit", "text", (col) => col.notNull())
    .addColumn("start_date", "date", (col) => col.notNull())
    .addColumn("end_date", "date")
    .addColumn("notes", "text")
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema
    .createIndex("quotation_offers_quotation_id_idx")
    .on("quotation_offers")
    .column("quotation_id")
    .execute();

  const permissions = await db
    .insertInto("permissions")
    .values([{ code: "quotation.manage" }, { code: "quotation.respond" }])
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
    .where("code", "in", ["quotation.manage", "quotation.respond"])
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
    .where("code", "in", ["quotation.manage", "quotation.respond"])
    .execute();

  await db.schema.dropTable("quotation_offers").execute();
  await db.schema.dropTable("commercial_quotations").execute();
  await db.schema.dropTable("quotation_reference_sequences").execute();
  await db.schema.dropTable("quotation_responses").execute();
}
