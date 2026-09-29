import type { Kysely } from "kysely";

/**
 * Soft disable for catalogue taxonomy, extending 0030 (products) up the
 * tree. A category or subcategory with `disabled_at` set — and everything
 * beneath it — is "effectively disabled": hidden from picker lists and
 * rejected for new Machines (product) / Requirements (subcategory), while
 * get-by-id keeps resolving it so existing records keep their names.
 *
 * Soft cascade: children are not touched. Effective state is computed at
 * read time (self OR any ancestor), so re-enabling a parent restores every
 * child that isn't disabled by itself.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("product_categories").addColumn("disabled_at", "timestamptz").execute();
  await db.schema.alterTable("product_subcategories").addColumn("disabled_at", "timestamptz").execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("product_subcategories").dropColumn("disabled_at").execute();
  await db.schema.alterTable("product_categories").dropColumn("disabled_at").execute();
}
