import type { Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import { ConflictError } from "../../../shared/errors.js";
import type {
  CreateProductInput,
  ProductRepositoryPort,
  UpdateProductInput,
} from "../domain/ports.js";

// SQLSTATE 23505 = unique_violation — backstops against
// products_manufacturer_name_unique (0003_create_product_catalogue.ts),
// same pattern as MachineRepository.isUniqueViolation.
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export class ProductRepository implements ProductRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  // Every read joins the ancestors' own flags (soft cascade, 0037).
  private selectWithAncestors() {
    return this.db
      .selectFrom("products as p")
      .innerJoin("product_subcategories as s", "s.id", "p.product_subcategory_id")
      .innerJoin("product_categories as c", "c.id", "s.product_category_id")
      .selectAll("p")
      .select(["s.disabled_at as subcategory_disabled_at", "c.disabled_at as category_disabled_at"]);
  }

  listAll(subcategoryId?: string, includeDisabled = false) {
    let query = this.selectWithAncestors();
    if (subcategoryId !== undefined) {
      query = query.where("p.product_subcategory_id", "=", subcategoryId);
    }
    if (!includeDisabled) {
      query = query
        .where("p.disabled_at", "is", null)
        .where("s.disabled_at", "is", null)
        .where("c.disabled_at", "is", null);
    }
    return query.execute();
  }

  findById(id: string) {
    return this.selectWithAncestors().where("p.id", "=", id).executeTakeFirst();
  }

  async create(input: CreateProductInput) {
    try {
      const { id } = await this.db
        .insertInto("products")
        .values({
          product_subcategory_id: input.productSubcategoryId,
          name: input.name,
          manufacturer: input.manufacturer,
          capacity: input.capacity ?? null,
          capacity_unit: input.capacityUnit ?? null,
          specifications: input.specifications ? JSON.stringify(input.specifications) : null,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      return await this.selectWithAncestors().where("p.id", "=", id).executeTakeFirstOrThrow();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("A product with this manufacturer and name already exists");
      }
      throw error;
    }
  }

  async update(id: string, updates: UpdateProductInput) {
    try {
      await this.db
        .updateTable("products")
        .set({
          ...(updates.name !== undefined && { name: updates.name }),
          ...(updates.manufacturer !== undefined && { manufacturer: updates.manufacturer }),
          ...(updates.capacity !== undefined && { capacity: updates.capacity }),
          ...(updates.capacityUnit !== undefined && { capacity_unit: updates.capacityUnit }),
          ...(updates.specifications !== undefined && {
            specifications: JSON.stringify(updates.specifications),
          }),
          ...(updates.disabledAt !== undefined && { disabled_at: updates.disabledAt }),
        })
        .where("id", "=", id)
        .execute();
      return await this.selectWithAncestors().where("p.id", "=", id).executeTakeFirstOrThrow();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("A product with this manufacturer and name already exists");
      }
      throw error;
    }
  }
}
