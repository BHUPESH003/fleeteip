import type { Kysely } from "kysely";

/**
 * Grants the new rental.respond permission (read-only view of a Renter's own
 * rentals — the Renter had no way to see machines currently on rent to them)
 * to the existing `owner` role, mirroring exactly how 0007 granted
 * rental.manage and how 0014 granted billing.respond.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  const permission = await db
    .insertInto("permissions")
    .values({ code: "rental.respond" })
    .returning(["id"])
    .executeTakeFirstOrThrow();

  const ownerRole = await db
    .selectFrom("roles")
    .select("id")
    .where("name", "=", "owner")
    .executeTakeFirstOrThrow();

  await db
    .insertInto("role_permissions")
    .values({ role_id: ownerRole.id, permission_id: permission.id })
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  const permission = await db
    .selectFrom("permissions")
    .select("id")
    .where("code", "=", "rental.respond")
    .executeTakeFirst();

  if (permission) {
    await db.deleteFrom("role_permissions").where("permission_id", "=", permission.id).execute();
  }

  await db.deleteFrom("permissions").where("code", "=", "rental.respond").execute();
}
