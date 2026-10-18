import type { Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type { EmailVerificationTokenRepositoryPort } from "../domain/ports.js";

export class EmailVerificationTokenRepository implements EmailVerificationTokenRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  create(input: { userId: string; tokenHash: string; expiresAt: Date }) {
    return this.db
      .insertInto("email_verification_tokens")
      .values({ user_id: input.userId, token_hash: input.tokenHash, expires_at: input.expiresAt })
      .execute();
  }

  invalidateUnusedByUserId(userId: string) {
    return this.db
      .updateTable("email_verification_tokens")
      .set({ used_at: new Date() })
      .where("user_id", "=", userId)
      .where("used_at", "is", null)
      .execute();
  }

  findByTokenHash(tokenHash: string) {
    return this.db
      .selectFrom("email_verification_tokens")
      .select(["id", "user_id", "expires_at", "used_at"])
      .where("token_hash", "=", tokenHash)
      .executeTakeFirst();
  }

  redeem(input: { tokenId: string; userId: string }) {
    return this.db.transaction().execute(async (trx) => {
      // used_at IS NULL makes this the single point where a token is consumed.
      const claimed = await trx
        .updateTable("email_verification_tokens")
        .set({ used_at: new Date() })
        .where("id", "=", input.tokenId)
        .where("used_at", "is", null)
        .returning("id")
        .executeTakeFirst();
      if (!claimed) return false;
      // Older links for the same account are spent too.
      await trx
        .updateTable("email_verification_tokens")
        .set({ used_at: new Date() })
        .where("user_id", "=", input.userId)
        .where("used_at", "is", null)
        .execute();
      await trx
        .updateTable("users")
        .set((eb) => ({ email_verified_at: eb.fn.coalesce("email_verified_at", eb.val(new Date())) }))
        .where("id", "=", input.userId)
        .execute();
      return true;
    });
  }
}
