import type {
  CapacityUnit,
  CatalogueDisabledBy,
  CreateProductCategoryRequest,
  CreateProductRequest,
  CreateProductSubcategoryRequest,
  Product,
  ProductCategory,
  ProductSpecifications,
  ProductSubcategory,
  UpdateProductCategoryRequest,
  UpdateProductRequest,
  UpdateProductSubcategoryRequest,
} from "@fleetip/contracts/catalogue";
import { ConflictError, NotFoundError } from "../../../shared/errors.js";
import { PermissionService } from "../../permissions/application/permission-service.js";
import type {
  ProductCategoryRecord,
  ProductRecord,
  ProductRepositoryPort,
  ProductCategoryRepositoryPort,
  ProductSubcategoryRecord,
  ProductSubcategoryRepositoryPort,
} from "../domain/ports.js";

const iso = (value: Date | string | null | undefined) =>
  value ? new Date(value).toISOString() : null;

// Soft cascade (0037): the highest disabled level wins — that's the one an
// admin has to re-enable first.
function disabledBy(record: {
  disabled_at?: Date | string | null;
  subcategory_disabled_at?: Date | string | null;
  category_disabled_at?: Date | string | null;
}): CatalogueDisabledBy | null {
  if (record.category_disabled_at) return "category";
  if (record.subcategory_disabled_at) return "subcategory";
  if (record.disabled_at) return "self";
  return null;
}

function toProductCategory(record: ProductCategoryRecord): ProductCategory {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    disabledAt: iso(record.disabled_at),
    disabledBy: disabledBy(record),
    createdAt: new Date(record.created_at).toISOString(),
  };
}

function toProductSubcategory(record: ProductSubcategoryRecord): ProductSubcategory {
  return {
    id: record.id,
    productCategoryId: record.product_category_id,
    code: record.code,
    name: record.name,
    disabledAt: iso(record.disabled_at),
    disabledBy: disabledBy(record),
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
    disabledAt: iso(record.disabled_at),
    disabledBy: disabledBy(record),
    createdAt: new Date(record.created_at).toISOString(),
  };
}

// A malformed id can't exist; checking here keeps it a 404 instead of a
// Postgres uuid cast error (500) on the public get-by-id routes.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CatalogueService {
  constructor(
    private readonly productCategoryRepository: ProductCategoryRepositoryPort,
    private readonly productSubcategoryRepository: ProductSubcategoryRepositoryPort,
    private readonly productRepository: ProductRepositoryPort,
    private readonly permissionService: PermissionService,
  ) {}

  // Reads stay public/unauthenticated — the Product Catalogue is
  // platform-level browsable reference data (see catalogue routes), not
  // organization-scoped, so there is nothing to authorize here.
  // Lists leave out effectively-disabled items (pickers) unless
  // includeDisabled; get-by-id always resolves.
  async listCategories(includeDisabled = false): Promise<ProductCategory[]> {
    const records = await this.productCategoryRepository.listAll(includeDisabled);
    return records.map(toProductCategory);
  }

  async listSubcategories(categoryId: string, includeDisabled = false): Promise<ProductSubcategory[]> {
    const records = await this.productSubcategoryRepository.listByCategory(
      categoryId,
      includeDisabled,
    );
    return records.map(toProductSubcategory);
  }

  async listProducts(subcategoryId?: string, includeDisabled = false): Promise<Product[]> {
    const records = await this.productRepository.listAll(subcategoryId, includeDisabled);
    return records.map(toProduct);
  }

  // Get-by-id returns disabled items too — existing machines/rentals
  // must keep resolving their product.
  async getCategory(categoryId: string): Promise<ProductCategory> {
    const record = UUID.test(categoryId) ? await this.productCategoryRepository.findById(categoryId) : undefined;
    if (!record) throw new NotFoundError("Product category not found");
    return toProductCategory(record);
  }

  async getSubcategory(subcategoryId: string): Promise<ProductSubcategory> {
    const record = UUID.test(subcategoryId) ? await this.productSubcategoryRepository.findById(subcategoryId) : undefined;
    if (!record) throw new NotFoundError("Product subcategory not found");
    return toProductSubcategory(record);
  }

  async getProduct(productId: string): Promise<Product> {
    const record = UUID.test(productId) ? await this.productRepository.findById(productId) : undefined;
    if (!record) throw new NotFoundError("Product not found");
    return toProduct(record);
  }

  // --- Writes: gated by catalogue.manage. organizationId identifies the
  // caller's own membership for the permission check only — it is never
  // stored anywhere; the Product Catalogue has no organization_id column
  // (it is shared platform-wide by design). See the migration seeding
  // catalogue.manage and docs/platform-admin-architecture-requirements.md
  // for why this is the best fit available today, not a real platform-admin
  // authorization tier. ---

  async createCategory(
    userId: string,
    organizationId: string,
    input: CreateProductCategoryRequest,
  ): Promise<ProductCategory> {
    await this.permissionService.requirePermission(userId, organizationId, "catalogue.manage");
    return this.doCreateCategory(input);
  }

  // Platform Admin entry points — see this phase's brief §12/§13. Staff
  // authentication/authorization already happened at the route layer
  // (getAuthenticatedStaffId); these skip the tenant permission check
  // entirely rather than faking an organizationId, and share the exact same
  // validation/write logic as the tenant-facing methods above.
  async createCategoryAsPlatformAdmin(
    input: CreateProductCategoryRequest,
  ): Promise<ProductCategory> {
    return this.doCreateCategory(input);
  }

  private async doCreateCategory(input: CreateProductCategoryRequest): Promise<ProductCategory> {
    const codeExists = await this.productCategoryRepository.codeExists(input.code);
    if (codeExists) {
      throw new ConflictError("A product category with this code already exists", "code");
    }
    const record = await this.productCategoryRepository.create(input);
    return toProductCategory(record);
  }

  async updateCategory(
    userId: string,
    organizationId: string,
    categoryId: string,
    input: UpdateProductCategoryRequest,
  ): Promise<ProductCategory> {
    await this.permissionService.requirePermission(userId, organizationId, "catalogue.manage");
    return this.doUpdateCategory(categoryId, input);
  }

  async updateCategoryAsPlatformAdmin(
    categoryId: string,
    input: UpdateProductCategoryRequest,
  ): Promise<ProductCategory> {
    return this.doUpdateCategory(categoryId, input);
  }

  private async doUpdateCategory(
    categoryId: string,
    input: UpdateProductCategoryRequest,
  ): Promise<ProductCategory> {
    const existing = await this.productCategoryRepository.findById(categoryId);
    if (!existing) throw new NotFoundError("Product category not found");
    const record = await this.productCategoryRepository.updateName(categoryId, input.name);
    return toProductCategory(record);
  }

  async createSubcategory(
    userId: string,
    organizationId: string,
    input: CreateProductSubcategoryRequest,
  ): Promise<ProductSubcategory> {
    await this.permissionService.requirePermission(userId, organizationId, "catalogue.manage");
    return this.doCreateSubcategory(input);
  }

  async createSubcategoryAsPlatformAdmin(
    input: CreateProductSubcategoryRequest,
  ): Promise<ProductSubcategory> {
    return this.doCreateSubcategory(input);
  }

  private async doCreateSubcategory(
    input: CreateProductSubcategoryRequest,
  ): Promise<ProductSubcategory> {
    const category = await this.productCategoryRepository.findById(input.productCategoryId);
    if (!category) throw new NotFoundError("Product category not found");
    const codeExists = await this.productSubcategoryRepository.codeExistsInCategory(
      input.productCategoryId,
      input.code,
    );
    if (codeExists) {
      throw new ConflictError("A subcategory with this code already exists in this category", "code");
    }
    const record = await this.productSubcategoryRepository.create(input);
    return toProductSubcategory(record);
  }

  async updateSubcategory(
    userId: string,
    organizationId: string,
    subcategoryId: string,
    input: UpdateProductSubcategoryRequest,
  ): Promise<ProductSubcategory> {
    await this.permissionService.requirePermission(userId, organizationId, "catalogue.manage");
    return this.doUpdateSubcategory(subcategoryId, input);
  }

  async updateSubcategoryAsPlatformAdmin(
    subcategoryId: string,
    input: UpdateProductSubcategoryRequest,
  ): Promise<ProductSubcategory> {
    return this.doUpdateSubcategory(subcategoryId, input);
  }

  private async doUpdateSubcategory(
    subcategoryId: string,
    input: UpdateProductSubcategoryRequest,
  ): Promise<ProductSubcategory> {
    const existing = await this.productSubcategoryRepository.findById(subcategoryId);
    if (!existing) throw new NotFoundError("Product subcategory not found");
    const record = await this.productSubcategoryRepository.updateName(subcategoryId, input.name);
    return toProductSubcategory(record);
  }

  async createProduct(
    userId: string,
    organizationId: string,
    input: CreateProductRequest,
  ): Promise<Product> {
    await this.permissionService.requirePermission(userId, organizationId, "catalogue.manage");
    return this.doCreateProduct(input);
  }

  async createProductAsPlatformAdmin(input: CreateProductRequest): Promise<Product> {
    return this.doCreateProduct(input);
  }

  private async doCreateProduct(input: CreateProductRequest): Promise<Product> {
    const subcategory = await this.productSubcategoryRepository.findById(
      input.productSubcategoryId,
    );
    if (!subcategory) throw new NotFoundError("Product subcategory not found");
    const record = await this.productRepository.create(input);
    return toProduct(record);
  }

  async updateProduct(
    userId: string,
    organizationId: string,
    productId: string,
    input: UpdateProductRequest,
  ): Promise<Product> {
    await this.permissionService.requirePermission(userId, organizationId, "catalogue.manage");
    return this.doUpdateProduct(productId, input);
  }

  async updateProductAsPlatformAdmin(
    productId: string,
    input: UpdateProductRequest,
  ): Promise<Product> {
    return this.doUpdateProduct(productId, input);
  }

  private async doUpdateProduct(productId: string, input: UpdateProductRequest): Promise<Product> {
    const existing = await this.productRepository.findById(productId);
    if (!existing) throw new NotFoundError("Product not found");
    const record = await this.productRepository.update(productId, input);
    return toProduct(record);
  }

  // --- Soft disable (0030). Never deletes: machines reference products. ---

  async setProductDisabled(
    userId: string,
    organizationId: string,
    productId: string,
    disabled: boolean,
  ): Promise<Product> {
    await this.permissionService.requirePermission(userId, organizationId, "catalogue.manage");
    return this.doSetProductDisabled(productId, disabled);
  }

  async setProductDisabledAsPlatformAdmin(productId: string, disabled: boolean): Promise<Product> {
    return this.doSetProductDisabled(productId, disabled);
  }

  private async doSetProductDisabled(productId: string, disabled: boolean): Promise<Product> {
    const existing = await this.productRepository.findById(productId);
    if (!existing) throw new NotFoundError("Product not found");
    // Re-disabling keeps the original timestamp.
    if (disabled === Boolean(existing.disabled_at)) return toProduct(existing);
    const record = await this.productRepository.update(productId, {
      disabledAt: disabled ? new Date() : null,
    });
    return toProduct(record);
  }

  // --- Soft disable for taxonomy (0037). Children are left untouched: they
  // read as disabled through the join, and re-enabling the parent restores
  // every child that isn't disabled by itself. ---

  async setCategoryDisabled(
    userId: string,
    organizationId: string,
    categoryId: string,
    disabled: boolean,
  ): Promise<ProductCategory> {
    await this.permissionService.requirePermission(userId, organizationId, "catalogue.manage");
    return this.doSetCategoryDisabled(categoryId, disabled);
  }

  async setCategoryDisabledAsPlatformAdmin(
    categoryId: string,
    disabled: boolean,
  ): Promise<ProductCategory> {
    return this.doSetCategoryDisabled(categoryId, disabled);
  }

  private async doSetCategoryDisabled(
    categoryId: string,
    disabled: boolean,
  ): Promise<ProductCategory> {
    const existing = UUID.test(categoryId)
      ? await this.productCategoryRepository.findById(categoryId)
      : undefined;
    if (!existing) throw new NotFoundError("Product category not found");
    if (disabled === Boolean(existing.disabled_at)) return toProductCategory(existing);
    const record = await this.productCategoryRepository.setDisabledAt(
      categoryId,
      disabled ? new Date() : null,
    );
    return toProductCategory(record);
  }

  async setSubcategoryDisabled(
    userId: string,
    organizationId: string,
    subcategoryId: string,
    disabled: boolean,
  ): Promise<ProductSubcategory> {
    await this.permissionService.requirePermission(userId, organizationId, "catalogue.manage");
    return this.doSetSubcategoryDisabled(subcategoryId, disabled);
  }

  async setSubcategoryDisabledAsPlatformAdmin(
    subcategoryId: string,
    disabled: boolean,
  ): Promise<ProductSubcategory> {
    return this.doSetSubcategoryDisabled(subcategoryId, disabled);
  }

  private async doSetSubcategoryDisabled(
    subcategoryId: string,
    disabled: boolean,
  ): Promise<ProductSubcategory> {
    const existing = UUID.test(subcategoryId)
      ? await this.productSubcategoryRepository.findById(subcategoryId)
      : undefined;
    if (!existing) throw new NotFoundError("Product subcategory not found");
    if (disabled === Boolean(existing.disabled_at)) return toProductSubcategory(existing);
    const record = await this.productSubcategoryRepository.setDisabledAt(
      subcategoryId,
      disabled ? new Date() : null,
    );
    return toProductSubcategory(record);
  }
}
