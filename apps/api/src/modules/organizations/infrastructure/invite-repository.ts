import type { Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type { InviteRepositoryPort } from "../domain/ports.js";

const INVITE_COLUMNS = [
  "id",
  "organization_id",
  "role_id",
  "token_hash",
  "invited_by_user_id",
  "status",
  "expires_at",
  "accepted_by_user_id",
  "created_at",
] as const;

export class InviteRepository implements InviteRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  create(input: {
    organizationId: string;
    roleId: string;
    tokenHash: string;
    invitedByUserId: string;
    expiresAt: Date;
  }) {
    return this.db
      .insertInto("organization_invites")
      .values({
        organization_id: input.organizationId,
        role_id: input.roleId,
        token_hash: input.tokenHash,
        invited_by_user_id: input.invitedByUserId,
        status: "pending",
        expires_at: input.expiresAt,
      })
      .returning(INVITE_COLUMNS)
      .executeTakeFirstOrThrow();
  }

  findByTokenHash(tokenHash: string) {
    return this.db
      .selectFrom("organization_invites")
      .select(INVITE_COLUMNS)
      .where("token_hash", "=", tokenHash)
      .executeTakeFirst();
  }

  findWithContextByTokenHash(tokenHash: string) {
    return this.db
      .selectFrom("organization_invites")
      .innerJoin("organizations", "organizations.id", "organization_invites.organization_id")
      .innerJoin(
        "organization_types",
        "organization_types.id",
        "organizations.organization_type_id",
      )
      .innerJoin("roles", "roles.id", "organization_invites.role_id")
      .select([
        "organization_invites.id as id",
        "organization_invites.organization_id as organization_id",
        "organizations.name as organization_name",
        "organization_types.code as organization_type_code",
        "organization_invites.role_id as role_id",
        "roles.name as role_name",
        "organization_invites.status as status",
        "organization_invites.expires_at as expires_at",
      ])
      .where("organization_invites.token_hash", "=", tokenHash)
      .executeTakeFirst();
  }

  markAccepted(id: string, acceptedByUserId: string) {
    return this.db
      .updateTable("organization_invites")
      .set({ status: "accepted", accepted_by_user_id: acceptedByUserId })
      .where("id", "=", id)
      .returning(INVITE_COLUMNS)
      .executeTakeFirstOrThrow();
  }
}
