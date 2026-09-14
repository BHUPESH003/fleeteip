import { type Kysely, sql } from "kysely";

/**
 * Replaces the email-lookup "invite" (which created a membership with
 * status "invited" that nothing ever activated — a confirmed dead end,
 * see docs/decisions.md) with a real, working link-based invite:
 *
 *   owner creates an invite (role only, no email required) -> gets a
 *   one-time token -> shares the link however they like (copy/paste today,
 *   email delivery later) -> the recipient opens it and either signs up
 *   fresh (no separate organization ever created for them — this invite
 *   IS their route into an org) or accepts while already logged in as an
 *   existing FleetIP user (who may already own a different organization).
 *   Either way, the resulting membership is "active" immediately — the act
 *   of redeeming the token is the accept step that was previously missing.
 *
 * token_hash follows the exact same discipline as sessions.token_hash —
 * the raw token is returned to the caller once and never stored.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("organization_invites")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("organization_id", "uuid", (col) =>
      col.notNull().references("organizations.id").onDelete("cascade"),
    )
    .addColumn("role_id", "uuid", (col) => col.notNull().references("roles.id").onDelete("restrict"))
    .addColumn("token_hash", "text", (col) => col.notNull().unique())
    .addColumn("invited_by_user_id", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .addColumn("accepted_by_user_id", "uuid", (col) =>
      col.references("users.id").onDelete("set null"),
    )
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("organization_invites_organization_id_idx")
    .on("organization_invites")
    .column("organization_id")
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("organization_invites").execute();
}
