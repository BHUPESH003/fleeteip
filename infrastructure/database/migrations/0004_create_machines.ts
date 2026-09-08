import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("machines")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("organization_id", "uuid", (col) =>
      col.notNull().references("organizations.id").onDelete("cascade"),
    )
    .addColumn("product_id", "uuid", (col) =>
      col.notNull().references("products.id").onDelete("restrict"),
    )
    .addColumn("asset_code", "text", (col) => col.notNull())
    .addColumn("chassis_number", "text")
    .addColumn("registration_number", "text", (col) => col.notNull())
    .addColumn("year_of_manufacture", "integer")
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("machines_organization_asset_code_unique", [
      "organization_id",
      "asset_code",
    ])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("machines").execute();
}
