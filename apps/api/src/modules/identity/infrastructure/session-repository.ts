import type { Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type { SessionRepositoryPort } from "../domain/ports.js";

export class SessionRepository implements SessionRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  create(input: { userId: string; tokenHash: string; expiresAt: Date }) {
    return this.db
      .insertInto("sessions")
      .values({ user_id: input.userId, token_hash: input.tokenHash, expires_at: input.expiresAt })
      .returning(["id", "user_id", "expires_at"])
      .executeTakeFirstOrThrow();
  }

  findActiveByTokenHash(tokenHash: string) {
    return this.db
      .selectFrom("sessions")
      .select(["id", "user_id", "expires_at"])
      .where("token_hash", "=", tokenHash)
      .where("expires_at", ">", new Date())
      .executeTakeFirst();
  }

  deleteByTokenHash(tokenHash: string) {
    return this.db.deleteFrom("sessions").where("token_hash", "=", tokenHash).execute();
  }
}
