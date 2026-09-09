import type { Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type { ProductRepositoryPort } from "../domain/ports.js";

export class ProductRepository implements ProductRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  listAll(subcategoryId?: string) {
    let query = this.db.selectFrom("products").selectAll();
    if (subcategoryId !== undefined) {
      query = query.where("product_subcategory_id", "=", subcategoryId);
    }
    return query.execute();
  }

  findById(id: string) {
    return this.db.selectFrom("products").selectAll().where("id", "=", id).executeTakeFirst();
  }
}
