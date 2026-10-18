import { type Kysely, sql } from "kysely";

/**
 * Email verification. users.email_verified_at is null until the owner of the
 * address follows the emailed link. Every account that exists when this runs
 * is marked verified, so turning verification on never locks anyone out.
 * Tokens follow the password_reset_tokens discipline: only the hash is stored,
 * used_at doubles as "invalidated".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("users").addColumn("email_verified_at", "timestamptz").execute();
  await sql`UPDATE users SET email_verified_at = now()`.execute(db);

  await db.schema
    .createTable("email_verification_tokens")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("token_hash", "text", (col) => col.notNull().unique())
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .addColumn("used_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema
    .createIndex("email_verification_tokens_user_id_idx")
    .on("email_verification_tokens")
    .column("user_id")
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("email_verification_tokens").execute();
  await db.schema.alterTable("users").dropColumn("email_verified_at").execute();
}
