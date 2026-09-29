import type { Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type { CreateProductCategoryInput, ProductCategoryRepositoryPort } from "../domain/ports.js";

export class ProductCategoryRepository implements ProductCategoryRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  listAll(includeDisabled = false) {
    let query = this.db.selectFrom("product_categories").selectAll();
    if (!includeDisabled) query = query.where("disabled_at", "is", null);
    return query.execute();
  }

  findById(id: string) {
    return this.db
      .selectFrom("product_categories")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  }

  create(input: CreateProductCategoryInput) {
    return this.db
      .insertInto("product_categories")
      .values({ name: input.name, code: input.code })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  updateName(id: string, name: string) {
    return this.db
      .updateTable("product_categories")
      .set({ name })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  setDisabledAt(id: string, disabledAt: Date | null) {
    return this.db
      .updateTable("product_categories")
      .set({ disabled_at: disabledAt })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  codeExists(code: string) {
    return this.db
      .selectFrom("product_categories")
      .select("id")
      .where("code", "=", code)
      .executeTakeFirst()
      .then((row) => row !== undefined);
  }
}
