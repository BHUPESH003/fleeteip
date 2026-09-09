import type { Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type { ProductSubcategoryRepositoryPort } from "../domain/ports.js";

export class ProductSubcategoryRepository implements ProductSubcategoryRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  listByCategory(categoryId: string) {
    return this.db
      .selectFrom("product_subcategories")
      .selectAll()
      .where("product_category_id", "=", categoryId)
      .execute();
  }

  findById(id: string) {
    return this.db
      .selectFrom("product_subcategories")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  }
}
