export interface ProductCategoryRecord {
  id: string;
  code: string;
  name: string;
  created_at: Date | string;
}

export interface ProductCategoryRepositoryPort {
  listAll(): Promise<ProductCategoryRecord[]>;
  findById(id: string): Promise<ProductCategoryRecord | undefined>;
}

export interface ProductSubcategoryRecord {
  id: string;
  product_category_id: string;
  code: string;
  name: string;
  created_at: Date | string;
}

export interface ProductSubcategoryRepositoryPort {
  listByCategory(categoryId: string): Promise<ProductSubcategoryRecord[]>;
  findById(id: string): Promise<ProductSubcategoryRecord | undefined>;
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

export interface ProductRepositoryPort {
  listAll(subcategoryId?: string): Promise<ProductRecord[]>;
  findById(id: string): Promise<ProductRecord | undefined>;
}
