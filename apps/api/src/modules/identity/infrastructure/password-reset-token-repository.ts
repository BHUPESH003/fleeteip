import type { Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type { PasswordResetTokenRepositoryPort } from "../domain/ports.js";

export class PasswordResetTokenRepository implements PasswordResetTokenRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  create(input: { userId: string; tokenHash: string; expiresAt: Date }) {
    return this.db
      .insertInto("password_reset_tokens")
      .values({ user_id: input.userId, token_hash: input.tokenHash, expires_at: input.expiresAt })
      .execute();
  }

  invalidateUnusedByUserId(userId: string) {
    return this.db
      .updateTable("password_reset_tokens")
      .set({ used_at: new Date() })
      .where("user_id", "=", userId)
      .where("used_at", "is", null)
      .execute();
  }

  findByTokenHash(tokenHash: string) {
    return this.db
      .selectFrom("password_reset_tokens")
      .select(["id", "user_id", "expires_at", "used_at"])
      .where("token_hash", "=", tokenHash)
      .executeTakeFirst();
  }

  redeem(input: { tokenId: string; userId: string; passwordHash: string }) {
    return this.db.transaction().execute(async (trx) => {
      // The used_at IS NULL guard makes this the single point where a token
      // is consumed — two concurrent redeems can't both win.
      const claimed = await trx
        .updateTable("password_reset_tokens")
        .set({ used_at: new Date() })
        .where("id", "=", input.tokenId)
        .where("used_at", "is", null)
        .returning("id")
        .executeTakeFirst();
      if (!claimed) return false;
      await trx
        .updateTable("users")
        .set({ password_hash: input.passwordHash })
        .where("id", "=", input.userId)
        .execute();
      return true;
    });
  }
}
