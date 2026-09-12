import type { Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type {
  CreateProductSubcategoryInput,
  ProductSubcategoryRepositoryPort,
} from "../domain/ports.js";

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

  create(input: CreateProductSubcategoryInput) {
    return this.db
      .insertInto("product_subcategories")
      .values({
        product_category_id: input.productCategoryId,
        name: input.name,
        code: input.code,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  updateName(id: string, name: string) {
    return this.db
      .updateTable("product_subcategories")
      .set({ name })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  codeExistsInCategory(categoryId: string, code: string) {
    return this.db
      .selectFrom("product_subcategories")
      .select("id")
      .where("product_category_id", "=", categoryId)
      .where("code", "=", code)
      .executeTakeFirst()
      .then((row) => row !== undefined);
  }
}
