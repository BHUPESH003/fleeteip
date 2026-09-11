import type { Kysely } from "kysely";

/**
 * `products.product_subcategory_id` had no index despite being the exact
 * filter column for `ProductRepository.listAll(subcategoryId)` — the
 * category → subcategory → product cascade picker used on every Machine
 * and Requirement creation form. Caught during the MVP performance review
 * (docs/performance-review.md); harmless at today's curated-catalogue scale
 * but worth fixing now since it's a real, demonstrated filter column, not a
 * speculative index.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createIndex("products_product_subcategory_id_idx")
    .on("products")
    .column("product_subcategory_id")
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("products_product_subcategory_id_idx").execute();
}
