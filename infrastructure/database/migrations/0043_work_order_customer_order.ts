import type { Kysely } from "kysely";

/**
 * The customer's own work order / PO: customers issue one to the rental
 * company and quote it on invoices, so the number and date are recorded on
 * the FleetIP work order. Both optional, editable.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("work_orders")
    .addColumn("customer_work_order_number", "text")
    .addColumn("customer_work_order_date", "date")
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("work_orders")
    .dropColumn("customer_work_order_number")
    .dropColumn("customer_work_order_date")
    .execute();
}
