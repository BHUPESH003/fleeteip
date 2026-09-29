import type { Kysely } from "kysely";

/**
 * Soft disable for catalogue Products: a nullable `disabled_at` marks a
 * Product as retired without deleting it (machines.product_id references it
 * with ON DELETE RESTRICT, and existing machines/rentals must keep resolving
 * its name). Disabled Products are hidden from picker lists and rejected for
 * new Machine registrations; get-by-id and admin lists still return them.
 *
 * Only `products` gets the column: a Product is the leaf a Machine binds to.
 * Categories/subcategories are taxonomy — retiring one would need cascade
 * semantics (hide children, reject Requirements filed against a
 * subcategory) that nothing asks for yet.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("products").addColumn("disabled_at", "timestamptz").execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("products").dropColumn("disabled_at").execute();
}
