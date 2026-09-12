import type { Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import { ConflictError } from "../../../shared/errors.js";
import type { CreateProductInput, ProductRepositoryPort, UpdateProductInput } from "../domain/ports.js";

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

  async create(input: CreateProductInput) {
    try {
      return await this.db
        .insertInto("products")
        .values({
          product_subcategory_id: input.productSubcategoryId,
          name: input.name,
          manufacturer: input.manufacturer,
          capacity: input.capacity ?? null,
          capacity_unit: input.capacityUnit ?? null,
          specifications: input.specifications ? JSON.stringify(input.specifications) : null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("A product with this manufacturer and name already exists");
      }
      throw error;
    }
  }

  async update(id: string, updates: UpdateProductInput) {
    try {
      return await this.db
        .updateTable("products")
        .set({
          ...(updates.name !== undefined && { name: updates.name }),
          ...(updates.manufacturer !== undefined && { manufacturer: updates.manufacturer }),
          ...(updates.capacity !== undefined && { capacity: updates.capacity }),
          ...(updates.capacityUnit !== undefined && { capacity_unit: updates.capacityUnit }),
          ...(updates.specifications !== undefined && {
            specifications: JSON.stringify(updates.specifications),
          }),
        })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("A product with this manufacturer and name already exists");
      }
      throw error;
    }
  }
}
