import { type Kysely, sql } from "kysely";

/**
 * Extends CommercialQuotation with the remaining client-validated structured
 * commercial terms (fuel/accommodation responsibility, working hours/days,
 * minimum rental period, GST term) and `company_terms` (the flexible
 * company-specific-T&Cs bucket, distinct from the existing `commercial_notes`
 * special/site-conditions field) — see this phase's brief §5/§8.
 *
 * Also creates `quotation_scope_items`: a structured collection for
 * category/equipment-specific responsibilities (wire rope scope, ground
 * preparation, support crane, ...) instead of an ever-growing set of
 * `*_scope` columns — see this phase's brief §9.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("commercial_quotations")
    .addColumn("fuel_scope", "text")
    .execute();
  await db.schema
    .alterTable("commercial_quotations")
    .addColumn("accommodation_scope", "text")
    .execute();
  await db.schema
    .alterTable("commercial_quotations")
    .addColumn("working_hours", "numeric")
    .execute();
  await db.schema
    .alterTable("commercial_quotations")
    .addColumn("working_days_per_week", "integer")
    .execute();
  await db.schema
    .alterTable("commercial_quotations")
    .addColumn("minimum_rental_period_value", "integer")
    .execute();
  await db.schema
    .alterTable("commercial_quotations")
    .addColumn("minimum_rental_period_unit", "text")
    .execute();
  await db.schema.alterTable("commercial_quotations").addColumn("gst_terms", "text").execute();
  await db.schema
    .alterTable("commercial_quotations")
    .addColumn("company_terms", "text")
    .execute();

  await db.schema
    .createTable("quotation_scope_items")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("quotation_id", "uuid", (col) =>
      col.notNull().references("commercial_quotations.id").onDelete("cascade"),
    )
    .addColumn("item", "text", (col) => col.notNull())
    .addColumn("responsible_party", "text", (col) => col.notNull())
    .addColumn("notes", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema
    .createIndex("quotation_scope_items_quotation_id_idx")
    .on("quotation_scope_items")
    .column("quotation_id")
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("quotation_scope_items").execute();
  await db.schema.alterTable("commercial_quotations").dropColumn("company_terms").execute();
  await db.schema.alterTable("commercial_quotations").dropColumn("gst_terms").execute();
  await db.schema
    .alterTable("commercial_quotations")
    .dropColumn("minimum_rental_period_unit")
    .execute();
  await db.schema
    .alterTable("commercial_quotations")
    .dropColumn("minimum_rental_period_value")
    .execute();
  await db.schema
    .alterTable("commercial_quotations")
    .dropColumn("working_days_per_week")
    .execute();
  await db.schema.alterTable("commercial_quotations").dropColumn("working_hours").execute();
  await db.schema
    .alterTable("commercial_quotations")
    .dropColumn("accommodation_scope")
    .execute();
  await db.schema.alterTable("commercial_quotations").dropColumn("fuel_scope").execute();
}
