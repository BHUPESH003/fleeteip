import { type Kysely, sql } from "kysely";

/**
 * Session list for Settings > Security: when each session was last used and
 * from what browser. sessions.created_at already exists (0001). last_seen_at
 * is bumped at most every ~5 minutes (AuthService.resolveSession), so it is
 * "roughly when", not an audit trail.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("sessions")
    .addColumn("last_seen_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("user_agent", "text")
    .execute();

  await db.schema.createIndex("sessions_user_id_idx").ifNotExists().on("sessions").column("user_id").execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("sessions_user_id_idx").ifExists().execute();
  await db.schema.alterTable("sessions").dropColumn("last_seen_at").dropColumn("user_agent").execute();
}
