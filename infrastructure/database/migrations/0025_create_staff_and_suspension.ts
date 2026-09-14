import { type Kysely, sql } from "kysely";

/**
 * Platform Admin, part 1 — the identity/session pieces.
 *
 * `staff_users`/`staff_sessions` are a wholly separate principal type from
 * tenant `users`/`sessions`: same password-hashing (scrypt) and
 * session-token discipline, but their own tables, own login endpoint, own
 * cookie. This deliberately does NOT touch `organizationTypeCodeSchema`
 * (still locked to rental_company/renter) — staff aren't a tenant type, so
 * this also keeps that enum free for real future tenant types (Transport,
 * OEM) without conflating them with FleetIP's own ops staff. See
 * docs/platform-admin-architecture-requirements.md.
 *
 * `organizations.status`/`users.status` back Platform Admin's
 * suspend/reactivate action — enforced at the two natural choke points:
 * PermissionService.hasPermission (a suspended org's memberships grant
 * nothing) and AuthService.login (a suspended user cannot start a session).
 *
 * ponytail: a single fixed staff role for now (any authenticated staff
 * session has the full documented Platform Admin scope) — no
 * staff_roles/staff_permissions table. Add one only if a second staff tier
 * (e.g. read-only support) is ever needed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("staff_users")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("email", "text", (col) => col.notNull().unique())
    .addColumn("password_hash", "text", (col) => col.notNull())
    .addColumn("display_name", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("staff_sessions")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("staff_user_id", "uuid", (col) =>
      col.notNull().references("staff_users.id").onDelete("cascade"),
    )
    .addColumn("token_hash", "text", (col) => col.notNull().unique())
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .alterTable("organizations")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
    .execute();
  await db.schema
    .alterTable("users")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("users").dropColumn("status").execute();
  await db.schema.alterTable("organizations").dropColumn("status").execute();
  await db.schema.dropTable("staff_sessions").execute();
  await db.schema.dropTable("staff_users").execute();
}
