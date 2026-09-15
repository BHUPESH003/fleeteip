import type { Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type { UserRepositoryPort } from "../domain/ports.js";

export class UserRepository implements UserRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  findByEmail(email: string) {
    return this.db
      .selectFrom("users")
      .select(["id", "email", "password_hash", "display_name", "status", "created_at"])
      .where("email", "=", email)
      .executeTakeFirst();
  }

  findById(id: string) {
    return this.db
      .selectFrom("users")
      .select(["id", "email", "display_name", "status", "created_at"])
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
      .returning(["id", "email", "display_name", "status", "created_at"])
      .executeTakeFirstOrThrow();
  }

  // Platform Admin only — every user, no per-caller scoping.
  listAllForPlatformAdmin() {
    return this.db
      .selectFrom("users")
      .select(["id", "email", "display_name", "status", "created_at"])
      .orderBy("created_at", "desc")
      .execute();
  }

  updateStatus(id: string, status: "active" | "suspended") {
    return this.db
      .updateTable("users")
      .set({ status })
      .where("id", "=", id)
      .returning(["id", "email", "display_name", "status", "created_at"])
      .executeTakeFirstOrThrow();
  }
}
