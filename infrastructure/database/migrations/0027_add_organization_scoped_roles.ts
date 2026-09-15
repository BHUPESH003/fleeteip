import { sql, type Kysely } from "kysely";

/**
 * Per-organization custom roles (client feedback: an invited "member" had
 * literally zero permissions, seeded nowhere, ever — and there was no
 * endpoint or UI for an owner to grant any). `roles.organization_id` is now
 * nullable: NULL means a built-in, global role (only "owner" — always full
 * access, never created/edited/deleted through the API); a non-null value
 * scopes a role, and everything it grants, to exactly one organization,
 * freely editable by that organization's own `organization.manage` holder.
 *
 * The old global "member" role is replaced with a real per-organization
 * "member" role for every existing organization — its memberships and any
 * pending invites are repointed first, so nothing is left referencing the
 * old row (both `memberships.role_id` and `organization_invites.role_id`
 * are ON DELETE RESTRICT) before it's deleted outright.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("roles").dropConstraint("roles_name_key").execute();
  await db.schema.alterTable("roles").addColumn("organization_id", "uuid").execute();
  await db.schema
    .alterTable("roles")
    .addForeignKeyConstraint("roles_organization_id_fkey", ["organization_id"], "organizations", [
      "id",
    ])
    .onDelete("cascade")
    .execute();
  await db.schema
    .alterTable("roles")
    .addUniqueConstraint("roles_organization_id_name_unique", ["organization_id", "name"])
    .execute();
  // The constraint above doesn't stop two builtin (organization_id IS NULL)
  // roles sharing a name — Postgres treats every NULL as distinct — but only
  // "owner" is ever builtin, so a partial index keeps that invariant real.
  await sql`create unique index roles_builtin_name_unique on roles (name) where organization_id is null`.execute(
    db,
  );

  const oldMemberRole = await db
    .selectFrom("roles")
    .select("id")
    .where("name", "=", "member")
    .where("organization_id", "is", null)
    .executeTakeFirst();

  if (oldMemberRole) {
    const organizations = await db.selectFrom("organizations").select("id").execute();
    for (const { id: organizationId } of organizations as { id: string }[]) {
      const newRole = await db
        .insertInto("roles")
        .values({ name: "member", organization_id: organizationId })
        .returning(["id"])
        .executeTakeFirstOrThrow();

      await db
        .updateTable("memberships")
        .set({ role_id: newRole.id })
        .where("organization_id", "=", organizationId)
        .where("role_id", "=", oldMemberRole.id)
        .execute();

      await db
        .updateTable("organization_invites")
        .set({ role_id: newRole.id })
        .where("organization_id", "=", organizationId)
        .where("role_id", "=", oldMemberRole.id)
        .execute();
    }

    // Nothing references the old global row any more — delete it outright
    // (its role_permissions cascade with it) rather than leave it orphaned.
    await db.deleteFrom("roles").where("id", "=", oldMemberRole.id).execute();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop index if exists roles_builtin_name_unique`.execute(db);
  await db.schema
    .alterTable("roles")
    .dropConstraint("roles_organization_id_name_unique")
    .execute();
  await db.schema.alterTable("roles").dropConstraint("roles_organization_id_fkey").execute();
  await db.schema.alterTable("roles").dropColumn("organization_id").execute();
  await db.schema.alterTable("roles").addUniqueConstraint("roles_name_key", ["name"]).execute();
  // Deliberately does not restore the old global "member" role or repoint
  // memberships back to it — down migrations here undo schema, not data,
  // same convention as every other migration in this codebase.
}
