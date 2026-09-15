import type { Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type { StaffSessionRepositoryPort } from "../domain/ports.js";

export class StaffSessionRepository implements StaffSessionRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  create(input: { staffUserId: string; tokenHash: string; expiresAt: Date }) {
    return this.db
      .insertInto("staff_sessions")
      .values({
        staff_user_id: input.staffUserId,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt,
      })
      .returning(["id", "staff_user_id", "expires_at"])
      .executeTakeFirstOrThrow();
  }

  findActiveByTokenHash(tokenHash: string) {
    return this.db
      .selectFrom("staff_sessions")
      .select(["id", "staff_user_id", "expires_at"])
      .where("token_hash", "=", tokenHash)
      .where("expires_at", ">", new Date())
      .executeTakeFirst();
  }

  deleteByTokenHash(tokenHash: string) {
    return this.db.deleteFrom("staff_sessions").where("token_hash", "=", tokenHash).execute();
  }
}
