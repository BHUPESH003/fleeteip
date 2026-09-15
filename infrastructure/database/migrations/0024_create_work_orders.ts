import { type Kysely, sql } from "kysely";

/**
 * Creates `work_orders` — the finalized commercial order between the
 * parties, auto-created the moment a CommercialQuotation is awarded
 * (CommercialQuotationService.awardQuotation), snapshotting every
 * negotiated term so it stays stable independent of the source quotation.
 * See this phase's brief §10.
 *
 * `quotation_id`/`rental_id` are both unique — exactly one Work Order per
 * awarded quotation/created rental, never re-derived or re-entered.
 * `project_id` is nullable: a Path B (direct, no Requirement) quotation has
 * no Project to inherit.
 *
 * `work_order_scope_items` mirrors `quotation_scope_items` (0023) — a
 * snapshot copy taken at award time, not a live reference, so it stays
 * stable too.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("work_order_reference_sequences")
    .addColumn("organization_id", "uuid", (col) =>
      col.primaryKey().references("organizations.id").onDelete("cascade"),
    )
    .addColumn("next_value", "integer", (col) => col.notNull().defaultTo(1))
    .execute();

  await db.schema
    .createTable("work_orders")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("reference_number", "text", (col) => col.notNull())
    .addColumn("quotation_id", "uuid", (col) =>
      col.notNull().unique().references("commercial_quotations.id").onDelete("restrict"),
    )
    .addColumn("rental_id", "uuid", (col) =>
      col.notNull().unique().references("rentals.id").onDelete("restrict"),
    )
    .addColumn("rental_company_organization_id", "uuid", (col) =>
      col.notNull().references("organizations.id").onDelete("cascade"),
    )
    .addColumn("renter_organization_id", "uuid", (col) =>
      col.references("organizations.id").onDelete("cascade"),
    )
    .addColumn("client_snapshot", "jsonb")
    .addColumn("project_id", "uuid", (col) => col.references("projects.id").onDelete("restrict"))
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
    .addColumn("fuel_scope", "text")
    .addColumn("dehire_terms", "text")
    .addColumn("operator_scope", "text")
    .addColumn("accommodation_scope", "text")
    .addColumn("working_hours", "numeric")
    .addColumn("working_days_per_week", "integer")
    .addColumn("minimum_rental_period_value", "integer")
    .addColumn("minimum_rental_period_unit", "text")
    .addColumn("gst_terms", "text")
    .addColumn("notice_period_days", "integer")
    .addColumn("commercial_notes", "text")
    .addColumn("company_terms", "text")
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "work_orders_exactly_one_party",
      sql`(renter_organization_id IS NOT NULL) != (client_snapshot IS NOT NULL)`,
    )
    .execute();
  await db.schema
    .createIndex("work_orders_rental_company_organization_id_idx")
    .on("work_orders")
    .column("rental_company_organization_id")
    .execute();
  await db.schema
    .createIndex("work_orders_renter_organization_id_idx")
    .on("work_orders")
    .column("renter_organization_id")
    .execute();

  await db.schema
    .createTable("work_order_scope_items")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("work_order_id", "uuid", (col) =>
      col.notNull().references("work_orders.id").onDelete("cascade"),
    )
    .addColumn("item", "text", (col) => col.notNull())
    .addColumn("responsible_party", "text", (col) => col.notNull())
    .addColumn("notes", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema
    .createIndex("work_order_scope_items_work_order_id_idx")
    .on("work_order_scope_items")
    .column("work_order_id")
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("work_order_scope_items").execute();
  await db.schema.dropTable("work_orders").execute();
  await db.schema.dropTable("work_order_reference_sequences").execute();
}
