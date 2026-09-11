import { type Kysely, sql } from "kysely";

/**
 * Creates the Billing schema: invoices, invoice_line_items, payments, and a
 * per-organization invoice-number counter (same race-free pattern as
 * quotation_reference_sequences). Seeds `billing.manage` (Rental Company)
 * and `billing.respond` (Renter, read-only), granted to `owner`. See
 * docs/execution-and-billing-design.md §6.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("invoice_reference_sequences")
    .addColumn("organization_id", "uuid", (col) =>
      col.primaryKey().references("organizations.id").onDelete("cascade"),
    )
    .addColumn("next_value", "integer", (col) => col.notNull().defaultTo(1))
    .execute();

  await db.schema
    .createTable("invoices")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("rental_company_organization_id", "uuid", (col) =>
      col.notNull().references("organizations.id").onDelete("cascade"),
    )
    .addColumn("rental_id", "uuid", (col) =>
      col.notNull().references("rentals.id").onDelete("restrict"),
    )
    .addColumn("invoice_number", "text", (col) => col.notNull())
    .addColumn("billing_period_start", "date", (col) => col.notNull())
    .addColumn("billing_period_end", "date", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("subtotal", "numeric", (col) => col.notNull())
    .addColumn("tax_amount", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("adjustment_amount", "numeric", (col) => col.notNull().defaultTo(0))
    .addColumn("total_amount", "numeric", (col) => col.notNull())
    .addColumn("due_date", "date", (col) => col.notNull())
    .addColumn("notes", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("invoices_rental_company_organization_id_idx")
    .on("invoices")
    .column("rental_company_organization_id")
    .execute();
  await db.schema
    .createIndex("invoices_rental_id_idx")
    .on("invoices")
    .column("rental_id")
    .execute();

  await db.schema
    .createTable("invoice_line_items")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("invoice_id", "uuid", (col) =>
      col.notNull().references("invoices.id").onDelete("cascade"),
    )
    .addColumn("description", "text", (col) => col.notNull())
    .addColumn("quantity", "numeric", (col) => col.notNull())
    .addColumn("rate", "numeric", (col) => col.notNull())
    .addColumn("amount", "numeric", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema
    .createIndex("invoice_line_items_invoice_id_idx")
    .on("invoice_line_items")
    .column("invoice_id")
    .execute();

  await db.schema
    .createTable("payments")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("invoice_id", "uuid", (col) =>
      col.notNull().references("invoices.id").onDelete("cascade"),
    )
    .addColumn("amount", "numeric", (col) => col.notNull())
    .addColumn("paid_date", "date", (col) => col.notNull())
    .addColumn("method", "text")
    .addColumn("reference", "text")
    .addColumn("notes", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema
    .createIndex("payments_invoice_id_idx")
    .on("payments")
    .column("invoice_id")
    .execute();

  const permissions = await db
    .insertInto("permissions")
    .values([{ code: "billing.manage" }, { code: "billing.respond" }])
    .returning(["id"])
    .execute();

  const ownerRole = await db
    .selectFrom("roles")
    .select("id")
    .where("name", "=", "owner")
    .executeTakeFirstOrThrow();

  await db
    .insertInto("role_permissions")
    .values(
      permissions.map((permission) => ({ role_id: ownerRole.id, permission_id: permission.id })),
    )
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  const permissions = await db
    .selectFrom("permissions")
    .select("id")
    .where("code", "in", ["billing.manage", "billing.respond"])
    .execute();
  if (permissions.length > 0) {
    await db
      .deleteFrom("role_permissions")
      .where(
        "permission_id",
        "in",
        permissions.map((permission) => permission.id),
      )
      .execute();
  }
  await db
    .deleteFrom("permissions")
    .where("code", "in", ["billing.manage", "billing.respond"])
    .execute();

  await db.schema.dropTable("payments").execute();
  await db.schema.dropTable("invoice_line_items").execute();
  await db.schema.dropTable("invoices").execute();
  await db.schema.dropTable("invoice_reference_sequences").execute();
}
