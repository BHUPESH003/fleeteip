import type { Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type { UserRepositoryPort } from "../domain/ports.js";

export class UserRepository implements UserRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  findByEmail(email: string) {
    return this.db
      .selectFrom("users")
      .select(["id", "email", "password_hash", "display_name", "created_at"])
      .where("email", "=", email)
      .executeTakeFirst();
  }

  findById(id: string) {
    return this.db
      .selectFrom("users")
      .select(["id", "email", "display_name", "created_at"])
      .where("id", "=", id)
      .executeTakeFirst();
  }

  create(input: { email: string; passwordHash: string; displayName: string }) {
    return this.db
      .insertInto("users")
      .values({
        email: input.email,
        password_hash: input.passwordHash,
        display_name: input.displayName,
      })
      .returning(["id", "email", "display_name", "created_at"])
      .executeTakeFirstOrThrow();
  }
}
