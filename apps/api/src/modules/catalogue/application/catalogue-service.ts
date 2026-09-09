import type {
  CapacityUnit,
  Product,
  ProductCategory,
  ProductSpecifications,
  ProductSubcategory,
} from "@fleetip/contracts/catalogue";
import type {
  ProductCategoryRecord,
  ProductRecord,
  ProductRepositoryPort,
  ProductCategoryRepositoryPort,
  ProductSubcategoryRecord,
  ProductSubcategoryRepositoryPort,
} from "../domain/ports.js";

function toProductCategory(record: ProductCategoryRecord): ProductCategory {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    createdAt: new Date(record.created_at).toISOString(),
  };
}

function toProductSubcategory(record: ProductSubcategoryRecord): ProductSubcategory {
  return {
    id: record.id,
    productCategoryId: record.product_category_id,
    code: record.code,
    name: record.name,
    createdAt: new Date(record.created_at).toISOString(),
  };
}

// `products.capacity_unit`/`specifications` are plain `text`/`jsonb` columns
// with no DB-level constraint (see docs/equipment-domain-design.md) — this
// app is the only writer, always through the closed Zod schemas, so
// narrowing them back to their real contract types here is safe.
function toProduct(record: ProductRecord): Product {
  return {
    id: record.id,
    productSubcategoryId: record.product_subcategory_id,
    manufacturer: record.manufacturer,
    name: record.name,
    capacity: record.capacity,
    capacityUnit: record.capacity_unit as CapacityUnit | null,
    specifications: record.specifications as ProductSpecifications | null,
    createdAt: new Date(record.created_at).toISOString(),
  };
}

export class CatalogueService {
  constructor(
    private readonly productCategoryRepository: ProductCategoryRepositoryPort,
    private readonly productSubcategoryRepository: ProductSubcategoryRepositoryPort,
    private readonly productRepository: ProductRepositoryPort,
  ) {}

  async listCategories(): Promise<ProductCategory[]> {
    const records = await this.productCategoryRepository.listAll();
    return records.map(toProductCategory);
  }

  async listSubcategories(categoryId: string): Promise<ProductSubcategory[]> {
    const records = await this.productSubcategoryRepository.listByCategory(categoryId);
    return records.map(toProductSubcategory);
  }

  async listProducts(subcategoryId?: string): Promise<Product[]> {
    const records = await this.productRepository.listAll(subcategoryId);
    return records.map(toProduct);
  }
}
