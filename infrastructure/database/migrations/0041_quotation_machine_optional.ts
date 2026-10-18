import { sql, type Kysely } from "kysely";

/**
 * A commercial quotation may be for equipment the company doesn't own yet
 * (planning to buy or rehire it): it carries the catalogue product instead
 * of a machine, and a machine is assigned before the quotation is awarded.
 * Exactly the legacy rows keep machine_id; product_id stays null for them.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("commercial_quotations")
    .addColumn("product_id", "uuid", (col) => col.references("products.id").onDelete("restrict"))
    .execute();
  await db.schema
    .alterTable("commercial_quotations")
    .alterColumn("machine_id", (col) => col.dropNotNull())
    .execute();
  await sql`ALTER TABLE commercial_quotations
    ADD CONSTRAINT commercial_quotations_machine_or_product
    CHECK (machine_id IS NOT NULL OR product_id IS NOT NULL)`.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  // Quotations still waiting for a machine can't satisfy NOT NULL; drop them.
  await sql`DELETE FROM commercial_quotations WHERE machine_id IS NULL`.execute(db);
  await sql`ALTER TABLE commercial_quotations DROP CONSTRAINT commercial_quotations_machine_or_product`.execute(db);
  await db.schema
    .alterTable("commercial_quotations")
    .alterColumn("machine_id", (col) => col.setNotNull())
    .execute();
  await db.schema.alterTable("commercial_quotations").dropColumn("product_id").execute();
}
