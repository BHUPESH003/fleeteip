import type { Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type { MembershipRepositoryPort } from "../domain/ports.js";

/**
 * This repository reads across into `roles` (owned by the permissions
 * module) via plain SQL joins below. That's a deliberate, contained
 * exception, not a boundary violation: the modular monolith shares one
 * Postgres database specifically so read-only projections like "role name
 * for this membership" don't need an app-level join. Ownership of *business
 * rules* about roles/permissions still lives entirely in the permissions
 * module (see permissions/domain/ports.ts) — this class only ever reads
 * `roles.name`, never writes to or decides anything about roles.
 */
export class MembershipRepository implements MembershipRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  create(input: { userId: string; organizationId: string; roleId: string; status: string }) {
    return this.db
      .insertInto("memberships")
      .values({
        user_id: input.userId,
        organization_id: input.organizationId,
        role_id: input.roleId,
        status: input.status,
      })
      .returning(["id", "user_id", "organization_id", "role_id", "status", "created_at"])
      .executeTakeFirstOrThrow();
  }

  /** Every membership for a user, joined with its organization/type and role name — feeds the "who am I" response. */
  listWithOrganizationByUserId(userId: string) {
    return this.db
      .selectFrom("memberships")
      .innerJoin("organizations", "organizations.id", "memberships.organization_id")
      .innerJoin(
        "organization_types",
        "organization_types.id",
        "organizations.organization_type_id",
      )
      .innerJoin("roles", "roles.id", "memberships.role_id")
      .select([
        "memberships.id as id",
        "memberships.status as status",
        "memberships.created_at as created_at",
        "memberships.role_id as role_id",
        "roles.name as role_name",
        "organizations.id as organization_id",
        "organizations.name as organization_name",
        "organizations.code as organization_code",
        "organizations.created_at as organization_created_at",
        "organization_types.code as organization_type_code",
      ])
      .where("memberships.user_id", "=", userId)
      .execute();
  }

  findActiveMembership(userId: string, organizationId: string) {
    return this.db
      .selectFrom("memberships")
      .innerJoin("roles", "roles.id", "memberships.role_id")
      .select(["memberships.id as id", "memberships.status as status", "roles.id as role_id"])
      .where("memberships.user_id", "=", userId)
      .where("memberships.organization_id", "=", organizationId)
      .where("memberships.status", "=", "active")
      .executeTakeFirst();
  }
}
