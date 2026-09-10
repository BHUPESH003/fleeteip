import type { Kysely } from "kysely";

/**
 * Grants the new rental.manage permission (introduced alongside the Rental
 * domain — see docs/rental-domain-design.md §17) to the existing `owner`
 * role, mirroring exactly how 0005 granted equipment.manage.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  const permission = await db
    .insertInto("permissions")
    .values({ code: "rental.manage" })
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
    .where("code", "=", "rental.manage")
    .executeTakeFirst();

  if (permission) {
    await db.deleteFrom("role_permissions").where("permission_id", "=", permission.id).execute();
  }

  await db.deleteFrom("permissions").where("code", "=", "rental.manage").execute();
}
