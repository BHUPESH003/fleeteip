import type { Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type {
  CreateProductSubcategoryInput,
  ProductSubcategoryRepositoryPort,
} from "../domain/ports.js";

export class ProductSubcategoryRepository implements ProductSubcategoryRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  // Every read joins the parent category's own flag (soft cascade, 0037).
  private selectWithCategory() {
    return this.db
      .selectFrom("product_subcategories as s")
      .innerJoin("product_categories as c", "c.id", "s.product_category_id")
      .selectAll("s")
      .select("c.disabled_at as category_disabled_at");
  }

  listByCategory(categoryId: string, includeDisabled = false) {
    let query = this.selectWithCategory().where("s.product_category_id", "=", categoryId);
    if (!includeDisabled) {
      query = query.where("s.disabled_at", "is", null).where("c.disabled_at", "is", null);
    }
    return query.execute();
  }

  findById(id: string) {
    return this.selectWithCategory().where("s.id", "=", id).executeTakeFirst();
  }

  async create(input: CreateProductSubcategoryInput) {
    const { id } = await this.db
      .insertInto("product_subcategories")
      .values({
        product_category_id: input.productCategoryId,
        name: input.name,
        code: input.code,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return this.findByIdOrThrow(id);
  }

  async updateName(id: string, name: string) {
    await this.db.updateTable("product_subcategories").set({ name }).where("id", "=", id).execute();
    return this.findByIdOrThrow(id);
  }

  async setDisabledAt(id: string, disabledAt: Date | null) {
    await this.db
      .updateTable("product_subcategories")
      .set({ disabled_at: disabledAt })
      .where("id", "=", id)
      .execute();
    return this.findByIdOrThrow(id);
  }

  private findByIdOrThrow(id: string) {
    return this.selectWithCategory().where("s.id", "=", id).executeTakeFirstOrThrow();
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
