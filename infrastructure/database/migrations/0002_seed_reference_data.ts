import type { Kysely } from "kysely";

/**
 * Seeds the fixed reference data for the Stage 5 foundation: the two MVP
 * organization types, and two roles (owner/member) shared across every
 * organization rather than per-organization custom roles.
 *
 * ponytail: fixed role set, not a per-organization custom-role builder.
 * Add custom roles when a real need for finer-grained responsibilities
 * appears — this table shape already supports it without a rewrite.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db
    .insertInto("organization_types")
    .values([
      { code: "rental_company", name: "Rental Company" },
      { code: "renter", name: "Renter" },
    ])
    .execute();

  const roles = await db
    .insertInto("roles")
    .values([{ name: "owner" }, { name: "member" }])
    .returning(["id", "name"])
    .execute();

  const permissions = await db
    .insertInto("permissions")
    .values([{ code: "organization.manage" }, { code: "membership.manage" }])
    .returning(["id"])
    .execute();

  const ownerRoleId = roles.find((role) => role.name === "owner")?.id;
  if (!ownerRoleId) throw new Error("seed migration: owner role not found after insert");

  await db
    .insertInto("role_permissions")
    .values(
      permissions.map((permission) => ({ role_id: ownerRoleId, permission_id: permission.id })),
    )
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  await db.deleteFrom("role_permissions").execute();
  await db.deleteFrom("permissions").execute();
  await db.deleteFrom("roles").execute();
  await db.deleteFrom("organization_types").execute();
}
