import type { Kysely } from "kysely";

/**
 * Grants transport.respond and logsheet.respond (read-only view of a
 * Renter's own rentals' transport/logsheet records) to the existing `owner`
 * role, mirroring exactly how 0017 granted rental.respond and how 0014
 * granted billing.respond. Unlike quotation/rental/billing, Transport and
 * Logsheet previously had no Renter-facing permission at all — listByRental
 * was gated only behind transport.manage/logsheet.manage (Rental-Company-
 * only), a read-gate the frontend-revamp branch flagged (see
 * docs/frontend-backend-gap-report.md, Phase 7) as the one place the
 * established manage/respond pattern wasn't extended.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  const permissions = await db
    .insertInto("permissions")
    .values([{ code: "transport.respond" }, { code: "logsheet.respond" }])
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
    .where("code", "in", ["transport.respond", "logsheet.respond"])
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

  await db.deleteFrom("permissions").where("code", "in", ["transport.respond", "logsheet.respond"]).execute();
}
