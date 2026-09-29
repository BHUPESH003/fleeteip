import type { Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type { SessionRepositoryPort } from "../domain/ports.js";

const SESSION_COLUMNS = ["id", "user_id", "expires_at", "last_seen_at"] as const;

export class SessionRepository implements SessionRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  create(input: { userId: string; tokenHash: string; expiresAt: Date; userAgent?: string | null }) {
    return this.db
      .insertInto("sessions")
      .values({
        user_id: input.userId,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt,
        user_agent: input.userAgent ?? null,
      })
      .returning(SESSION_COLUMNS)
      .executeTakeFirstOrThrow();
  }

  findActiveByTokenHash(tokenHash: string) {
    return this.db
      .selectFrom("sessions")
      .select(SESSION_COLUMNS)
      .where("token_hash", "=", tokenHash)
      .where("expires_at", ">", new Date())
      .executeTakeFirst();
  }

  deleteByTokenHash(tokenHash: string) {
    return this.db.deleteFrom("sessions").where("token_hash", "=", tokenHash).execute();
  }

  deleteByUserId(userId: string) {
    return this.db.deleteFrom("sessions").where("user_id", "=", userId).execute();
  }

  touch(id: string) {
    return this.db.updateTable("sessions").set({ last_seen_at: new Date() }).where("id", "=", id).execute();
  }

  listActiveByUserId(userId: string) {
    return this.db
      .selectFrom("sessions")
      .select(["id", "created_at", "last_seen_at", "user_agent"])
      .where("user_id", "=", userId)
      .where("expires_at", ">", new Date())
      .orderBy("last_seen_at", "desc")
      .execute();
  }

  async deleteByIdForUser(id: string, userId: string) {
    const result = await this.db
      .deleteFrom("sessions")
      .where("id", "=", id)
      .where("user_id", "=", userId)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }

  deleteOthersForUser(userId: string, keepSessionId: string) {
    return this.db
      .deleteFrom("sessions")
      .where("user_id", "=", userId)
      .where("id", "!=", keepSessionId)
      .execute();
  }
}
