import type { Kysely } from "kysely";

/**
 * Grants a new catalogue.manage permission to the existing `owner` role,
 * mirroring exactly how 0005 granted equipment.manage. Scoped to
 * rental_company only (see PERMISSION_ORGANIZATION_TYPES in
 * packages/contracts/src/organization/index.ts) — Renters have no reason to
 * create/edit the platform-level Product Catalogue.
 *
 * This is a known imperfection, not an oversight: the Product Catalogue is
 * platform-level (shared across every Rental Company organization), but the
 * MVP authorization model has no tier above "member of an organization" —
 * see docs/platform-admin-architecture-requirements.md. Granting this
 * permission to every Rental Company's own `owner` role means any Rental
 * Company administrator can edit the SHARED catalogue, not just their own
 * organization's data — the same authorization shape already used for every
 * other permission in this codebase, applied to a resource that isn't
 * actually org-scoped. Recorded in docs/backend-hardening-report.md as a
 * new observation for the later platform-admin-authorization pass.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  const permission = await db
    .insertInto("permissions")
    .values({ code: "catalogue.manage" })
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
    .where("code", "=", "catalogue.manage")
    .executeTakeFirst();

  if (permission) {
    await db.deleteFrom("role_permissions").where("permission_id", "=", permission.id).execute();
  }

  await db.deleteFrom("permissions").where("code", "=", "catalogue.manage").execute();
}
