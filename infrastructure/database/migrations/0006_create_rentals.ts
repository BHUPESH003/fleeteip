import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Needed so GIST can index the plain-equality machine_id column alongside
  // the range column in the exclusion constraint below.
  await sql`CREATE EXTENSION IF NOT EXISTS btree_gist`.execute(db);

  await db.schema
    .createTable("rentals")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("rental_company_organization_id", "uuid", (col) =>
      col.notNull().references("organizations.id").onDelete("cascade"),
    )
    .addColumn("renter_organization_id", "uuid", (col) =>
      col.references("organizations.id").onDelete("cascade"),
    )
    .addColumn("client_snapshot", "jsonb")
    .addColumn("machine_id", "uuid", (col) =>
      col.notNull().references("machines.id").onDelete("restrict"),
    )
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("project_name", "text")
    .addColumn("project_location", "text")
    .addColumn("start_date", "date", (col) => col.notNull())
    .addColumn("end_date", "date")
    .addColumn("rate", "numeric", (col) => col.notNull())
    .addColumn("rate_unit", "text", (col) => col.notNull())
    .addColumn("mobilization_charge", "numeric")
    .addColumn("demobilization_charge", "numeric")
    .addColumn("payment_terms", "text")
    .addColumn("shift_structure", "text")
    .addColumn("overtime_rate", "numeric")
    .addColumn("sunday_condition", "text")
    .addColumn("fuel_norms", "text")
    .addColumn("operator_scope", "text")
    .addColumn("notice_period_days", "integer")
    .addColumn("dehire_terms", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "rentals_exactly_one_party",
      sql`(renter_organization_id IS NOT NULL) != (client_snapshot IS NOT NULL)`,
    )
    .execute();

  // No explicit end_date >= start_date CHECK constraint: it would be dead
  // code. Postgres's own daterange() construction (used by the generated
  // commitment_range column below) already rejects end_date < start_date on
  // its own, with a "range lower bound must be less than or equal to range
  // upper bound" error (SQLSTATE 22000) — confirmed empirically before this
  // constraint was written. A CHECK here could never fire.

  // Single source of truth for the inclusive [start_date, end_date] range —
  // both the exclusion constraint below and RentalRepository's availability
  // query read this column rather than each re-deriving the expression.
  // '[]' bounds make it inclusive on both ends; a null end_date produces an
  // unbounded-above range automatically (open-ended rental — see
  // docs/rental-domain-design.md §6/§9). Kysely's schema builder has no
  // first-class API for a generated column, hence raw SQL.
  await sql`
    ALTER TABLE rentals
      ADD COLUMN commitment_range daterange
      GENERATED ALWAYS AS (daterange(start_date, end_date, '[]')) STORED
  `.execute(db);

  // First-release integrity requirement (docs/rental-domain-design.md §10):
  // no two rentals for the same machine may have overlapping commitment
  // ranges while status is confirmed/active/off_rent.
  await sql`
    ALTER TABLE rentals
      ADD CONSTRAINT rentals_no_overlapping_commitment
      EXCLUDE USING gist (
        machine_id WITH =,
        commitment_range WITH &&
      )
      WHERE (status IN ('confirmed', 'active', 'off_rent'))
  `.execute(db);

  await db.schema
    .createIndex("rentals_rental_company_organization_id_idx")
    .on("rentals")
    .column("rental_company_organization_id")
    .execute();

  await db.schema
    .createIndex("rentals_renter_organization_id_idx")
    .on("rentals")
    .column("renter_organization_id")
    .execute();

  await db.schema
    .createIndex("rentals_machine_id_idx")
    .on("rentals")
    .column("machine_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("rentals").execute();
}
