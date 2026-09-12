export interface ProductCategoryRecord {
  id: string;
  code: string;
  name: string;
  created_at: Date | string;
}

export interface CreateProductCategoryInput {
  name: string;
  code: string;
}

export interface ProductCategoryRepositoryPort {
  listAll(): Promise<ProductCategoryRecord[]>;
  findById(id: string): Promise<ProductCategoryRecord | undefined>;
  create(input: CreateProductCategoryInput): Promise<ProductCategoryRecord>;
  updateName(id: string, name: string): Promise<ProductCategoryRecord>;
  codeExists(code: string): Promise<boolean>;
  // No delete() — product_subcategories.product_category_id references this
  // table with ON DELETE RESTRICT (0003_create_product_catalogue.ts), so a
  // populated category can never be hard-deleted anyway. No soft-delete
  // column exists on this table; adding one is deferred until the target UI
  // actually needs to retire a category (documented limitation, not an
  // oversight — see docs/frontend-backend-gap-report.md).
}

export interface ProductSubcategoryRecord {
  id: string;
  product_category_id: string;
  code: string;
  name: string;
  created_at: Date | string;
}

export interface CreateProductSubcategoryInput {
  productCategoryId: string;
  name: string;
  code: string;
}

export interface ProductSubcategoryRepositoryPort {
  listByCategory(categoryId: string): Promise<ProductSubcategoryRecord[]>;
  findById(id: string): Promise<ProductSubcategoryRecord | undefined>;
  create(input: CreateProductSubcategoryInput): Promise<ProductSubcategoryRecord>;
  updateName(id: string, name: string): Promise<ProductSubcategoryRecord>;
  codeExistsInCategory(categoryId: string, code: string): Promise<boolean>;
  // No delete() — same ON DELETE RESTRICT reasoning as ProductCategory above
  // (products.product_subcategory_id references this table).
}

export interface ProductRecord {
  id: string;
  product_subcategory_id: string;
  manufacturer: string;
  name: string;
  capacity: number | null;
  capacity_unit: string | null;
  specifications: unknown | null;
  created_at: Date | string;
}

export interface CreateProductInput {
  productSubcategoryId: string;
  name: string;
  manufacturer: string;
  capacity?: number;
  capacityUnit?: string;
  specifications?: unknown;
}

export interface UpdateProductInput {
  name?: string;
  manufacturer?: string;
  capacity?: number;
  capacityUnit?: string;
  specifications?: unknown;
}

export interface ProductRepositoryPort {
  listAll(subcategoryId?: string): Promise<ProductRecord[]>;
  findById(id: string): Promise<ProductRecord | undefined>;
  create(input: CreateProductInput): Promise<ProductRecord>;
  update(id: string, updates: UpdateProductInput): Promise<ProductRecord>;
  // No delete() — machines.product_id references this table with ON DELETE
  // RESTRICT (0004_create_machines.ts), so a Product referenced by a real
  // Machine can never be hard-deleted anyway; an unreferenced one could be,
  // but that's not a capability the target UI has asked for yet.
}
