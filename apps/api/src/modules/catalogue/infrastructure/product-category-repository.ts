import type { Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type { ProductCategoryRepositoryPort } from "../domain/ports.js";

export class ProductCategoryRepository implements ProductCategoryRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  listAll() {
    return this.db.selectFrom("product_categories").selectAll().execute();
  }

  findById(id: string) {
    return this.db
      .selectFrom("product_categories")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  }
}
