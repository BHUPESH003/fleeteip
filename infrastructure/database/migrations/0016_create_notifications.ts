import { type Kysely, sql } from "kysely";

/**
 * A small in-app notification system for the multi-party, asynchronous
 * marketplace workflow (negotiation, auction selection, award, ...) — see
 * docs/autonomus-building-instructions.md's correction-pass brief §9.
 * Notifications are organization-scoped (matches every other table's
 * tenant-isolation pattern) rather than per-user, since every organization
 * today has exactly one member; a `recipient_user_id` column can be added
 * later if per-member targeting is ever actually needed.
 *
 * No new permission code — reads/mark-read reuse the existing
 * `organization.manage` permission (both org types, currently unused, every
 * org's owner already holds it), rather than adding a dedicated one for a
 * capability every member of an org should have by default.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("notifications")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("recipient_organization_id", "uuid", (col) =>
      col.notNull().references("organizations.id").onDelete("cascade"),
    )
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("message", "text", (col) => col.notNull())
    .addColumn("related_resource_type", "text")
    .addColumn("related_resource_id", "uuid")
    .addColumn("read_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("notifications_recipient_org_read_at_idx")
    .on("notifications")
    .columns(["recipient_organization_id", "read_at"])
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("notifications").execute();
}
