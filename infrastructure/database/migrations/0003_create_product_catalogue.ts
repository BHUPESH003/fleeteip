import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("product_categories")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("code", "text", (col) => col.notNull().unique())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("product_subcategories")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("product_category_id", "uuid", (col) =>
      col.notNull().references("product_categories.id").onDelete("restrict"),
    )
    .addColumn("code", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("product_subcategories_category_code_unique", [
      "product_category_id",
      "code",
    ])
    .execute();

  await db.schema
    .createTable("products")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("product_subcategory_id", "uuid", (col) =>
      col.notNull().references("product_subcategories.id").onDelete("restrict"),
    )
    .addColumn("manufacturer", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("capacity", "numeric")
    .addColumn("capacity_unit", "text")
    .addColumn("specifications", "jsonb")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("products_manufacturer_name_unique", ["manufacturer", "name"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("products").execute();
  await db.schema.dropTable("product_subcategories").execute();
  await db.schema.dropTable("product_categories").execute();
}
