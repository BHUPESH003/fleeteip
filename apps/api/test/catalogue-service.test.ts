import { describe, expect, it } from "vitest";
import type { OrganizationTypeCode } from "@fleetip/contracts/organization";
import type {
  ActiveMembershipRecord,
  MembershipRepositoryPort,
  OrganizationRepositoryPort,
} from "../src/modules/organizations/domain/ports.js";
import type { RoleRepositoryPort } from "../src/modules/permissions/domain/ports.js";
import { PermissionService } from "../src/modules/permissions/application/permission-service.js";
import type {
  ProductCategoryRecord,
  ProductCategoryRepositoryPort,
  ProductRecord,
  ProductRepositoryPort,
  ProductSubcategoryRecord,
  ProductSubcategoryRepositoryPort,
} from "../src/modules/catalogue/domain/ports.js";
import { CatalogueService } from "../src/modules/catalogue/application/catalogue-service.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../src/shared/errors.js";

const OWNER_ROLE_ID = "role-owner";
const RC_ORG_ID = "org-rental-company";
const CATEGORY_ID = "00000000-0000-4000-8000-000000000001";
const SUBCATEGORY_ID = "00000000-0000-4000-8000-000000000002";
const PRODUCT_ID = "00000000-0000-4000-8000-000000000003";

function fakePermissionService(organizationTypeCode: OrganizationTypeCode = "rental_company") {
  const membershipRepository: MembershipRepositoryPort = {
    updateRole: async () => {
      throw new Error("not used in this test");
    },
    findActiveMembership: async (): Promise<ActiveMembershipRecord | undefined> => ({
      id: "membership-1",
      status: "active",
      role_id: OWNER_ROLE_ID,
    }),
    create: async () => {
      throw new Error("not used in this test");
    },
    listWithOrganizationByUserId: async () => [],
    listByOrganization: async () => {
      throw new Error("not used in this test");
    },
  };
  const roleRepository: RoleRepositoryPort = {
    findByName: async (name) => ({ id: OWNER_ROLE_ID, name, organization_id: null }),
    findById: async () => {
      throw new Error("not used in this test");
    },
    listForOrganization: async () => {
      throw new Error("not used in this test");
    },
    create: async () => {
      throw new Error("not used in this test");
    },
    update: async () => {
      throw new Error("not used in this test");
    },
    delete: async () => {
      throw new Error("not used in this test");
    },
    hasPermission: async (roleId) => roleId === OWNER_ROLE_ID,
    listPermissionCodesByRoleId: async (roleId) =>
      roleId === OWNER_ROLE_ID ? ["catalogue.manage"] : [],
  };
  return new PermissionService(
    membershipRepository,
    roleRepository,
    fakeOrganizationTypeRepository(organizationTypeCode),
  );
}

function fakeOrganizationTypeRepository(
  organizationTypeCode: OrganizationTypeCode,
): OrganizationRepositoryPort {
  return {
    findTypeByCode: async () => {
      throw new Error("not used in this test");
    },
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async () => {
      throw new Error("not used in this test");
    },
    findWithTypeById: async (id) => ({
      id,
      organization_type_id: `type-${organizationTypeCode}`,
      organization_type_code: organizationTypeCode,
      name: "Test Org",
      code: "TESTORG",
      status: "active",
      created_at: new Date(),
    }),
    listAllForPlatformAdmin: async () => {
      throw new Error("not used in this test");
    },
    updateStatus: async () => {
      throw new Error("not used in this test");
    },
    codeExists: async () => {
      throw new Error("not used in this test");
    },
    listByType: async () => {
      throw new Error("not used in this test");
    },
  };
}

// Shared tables so the fakes can emulate the repositories' ancestor joins
// (soft cascade, 0037).
function fakeTables() {
  return {
    categories: new Map<string, ProductCategoryRecord>([
      [
        CATEGORY_ID,
        { id: CATEGORY_ID, code: "EXCAVATOR", name: "Excavator", created_at: new Date() },
      ],
    ]),
    subcategories: new Map<string, ProductSubcategoryRecord>([
      [
        SUBCATEGORY_ID,
        {
          id: SUBCATEGORY_ID,
          product_category_id: CATEGORY_ID,
          code: "TRACKED",
          name: "Tracked Excavator",
          created_at: new Date(),
        },
      ],
    ]),
    products: new Map<string, ProductRecord>([
      [
        PRODUCT_ID,
        {
          id: PRODUCT_ID,
          product_subcategory_id: SUBCATEGORY_ID,
          manufacturer: "Caterpillar",
          name: "320",
          capacity: 20,
          capacity_unit: "Ton",
          specifications: null,
          created_at: new Date(),
        },
      ],
    ]),
  };
}
type Tables = ReturnType<typeof fakeTables>;

function withCategory(tables: Tables, s: ProductSubcategoryRecord): ProductSubcategoryRecord {
  return { ...s, category_disabled_at: tables.categories.get(s.product_category_id)?.disabled_at ?? null };
}

function withAncestors(tables: Tables, p: ProductRecord): ProductRecord {
  const sub = tables.subcategories.get(p.product_subcategory_id);
  const cat = sub && tables.categories.get(sub.product_category_id);
  return {
    ...p,
    subcategory_disabled_at: sub?.disabled_at ?? null,
    category_disabled_at: cat?.disabled_at ?? null,
  };
}

function fakeProductCategoryRepository(tables: Tables): ProductCategoryRepositoryPort {
  const { categories } = tables;
  let nextId = 2;
  return {
    listAll: async (includeDisabled) =>
      [...categories.values()].filter((c) => includeDisabled || !c.disabled_at),
    findById: async (id) => categories.get(id),
    create: async (input) => {
      const record: ProductCategoryRecord = {
        id: `category-${nextId++}`,
        code: input.code,
        name: input.name,
        created_at: new Date(),
      };
      categories.set(record.id, record);
      return record;
    },
    updateName: async (id, name) => {
      const existing = categories.get(id);
      if (!existing) throw new Error("not used in this test");
      const updated = { ...existing, name };
      categories.set(id, updated);
      return updated;
    },
    codeExists: async (code) => [...categories.values()].some((c) => c.code === code),
    setDisabledAt: async (id, disabledAt) => {
      const updated = { ...categories.get(id)!, disabled_at: disabledAt };
      categories.set(id, updated);
      return updated;
    },
  };
}

function fakeProductSubcategoryRepository(tables: Tables): ProductSubcategoryRepositoryPort {
  const { subcategories } = tables;
  const find = (id: string) => {
    const s = subcategories.get(id);
    return s && withCategory(tables, s);
  };
  let nextId = 2;
  return {
    listByCategory: async (categoryId, includeDisabled) =>
      [...subcategories.values()]
        .filter((s) => s.product_category_id === categoryId)
        .map((s) => withCategory(tables, s))
        .filter((s) => includeDisabled || (!s.disabled_at && !s.category_disabled_at)),
    findById: async (id) => find(id),
    create: async (input) => {
      const record: ProductSubcategoryRecord = {
        id: `subcategory-${nextId++}`,
        product_category_id: input.productCategoryId,
        code: input.code,
        name: input.name,
        created_at: new Date(),
      };
      subcategories.set(record.id, record);
      return record;
    },
    updateName: async (id, name) => {
      const existing = subcategories.get(id);
      if (!existing) throw new Error("not used in this test");
      const updated = { ...existing, name };
      subcategories.set(id, updated);
      return updated;
    },
    codeExistsInCategory: async (categoryId, code) =>
      [...subcategories.values()].some(
        (s) => s.product_category_id === categoryId && s.code === code,
      ),
    setDisabledAt: async (id, disabledAt) => {
      subcategories.set(id, { ...subcategories.get(id)!, disabled_at: disabledAt });
      return find(id)!;
    },
  };
}

function fakeProductRepository(tables: Tables): ProductRepositoryPort {
  const { products } = tables;
  let nextId = 2;
  return {
    listAll: async (subcategoryId, includeDisabled) =>
      [...products.values()]
        .map((p) => withAncestors(tables, p))
        .filter(
          (p) =>
            (subcategoryId === undefined || p.product_subcategory_id === subcategoryId) &&
            (includeDisabled ||
              (!p.disabled_at && !p.subcategory_disabled_at && !p.category_disabled_at)),
        ),
    findById: async (id) => {
      const p = products.get(id);
      return p && withAncestors(tables, p);
    },
    create: async (input) => {
      const duplicate = [...products.values()].some(
        (p) => p.manufacturer === input.manufacturer && p.name === input.name,
      );
      if (duplicate) throw new ConflictError("duplicate");
      const record: ProductRecord = {
        id: `product-${nextId++}`,
        product_subcategory_id: input.productSubcategoryId,
        manufacturer: input.manufacturer,
        name: input.name,
        capacity: input.capacity ?? null,
        capacity_unit: input.capacityUnit ?? null,
        specifications: input.specifications ?? null,
        created_at: new Date(),
      };
      products.set(record.id, record);
      return record;
    },
    update: async (id, updates) => {
      const existing = products.get(id);
      if (!existing) throw new Error("not used in this test");
      const updated: ProductRecord = {
        ...existing,
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.manufacturer !== undefined && { manufacturer: updates.manufacturer }),
        ...(updates.capacity !== undefined && { capacity: updates.capacity }),
        ...(updates.capacityUnit !== undefined && { capacity_unit: updates.capacityUnit }),
        ...(updates.specifications !== undefined && { specifications: updates.specifications }),
        ...(updates.disabledAt !== undefined && { disabled_at: updates.disabledAt }),
      };
      products.set(id, updated);
      return updated;
    },
  };
}

function buildService(organizationTypeCode: OrganizationTypeCode = "rental_company") {
  const tables = fakeTables();
  return new CatalogueService(
    fakeProductCategoryRepository(tables),
    fakeProductSubcategoryRepository(tables),
    fakeProductRepository(tables),
    fakePermissionService(organizationTypeCode),
  );
}

describe("CatalogueService", () => {
  it("creates a new product category", async () => {
    const service = buildService();
    const category = await service.createCategory("user-1", RC_ORG_ID, {
      name: "Crane",
      code: "CRANE",
    });
    expect(category.name).toBe("Crane");
  });

  it("rejects a duplicate product category code", async () => {
    const service = buildService();
    await expect(
      service.createCategory("user-1", RC_ORG_ID, { name: "Excavators again", code: "EXCAVATOR" }),
    ).rejects.toThrow(ConflictError);
  });

  it("updates a product category's name", async () => {
    const service = buildService();
    const updated = await service.updateCategory("user-1", RC_ORG_ID, CATEGORY_ID, {
      name: "Excavators",
    });
    expect(updated.name).toBe("Excavators");
  });

  it("rejects updating an unknown product category", async () => {
    const service = buildService();
    await expect(
      service.updateCategory("user-1", RC_ORG_ID, "unknown-category", { name: "X" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("creates a subcategory under a real category", async () => {
    const service = buildService();
    const subcategory = await service.createSubcategory("user-1", RC_ORG_ID, {
      productCategoryId: CATEGORY_ID,
      name: "Wheeled Excavator",
      code: "WHEELED",
    });
    expect(subcategory.productCategoryId).toBe(CATEGORY_ID);
  });

  it("rejects creating a subcategory under an unknown category", async () => {
    const service = buildService();
    await expect(
      service.createSubcategory("user-1", RC_ORG_ID, {
        productCategoryId: "unknown-category",
        name: "X",
        code: "X",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects a duplicate subcategory code within the same category", async () => {
    const service = buildService();
    await expect(
      service.createSubcategory("user-1", RC_ORG_ID, {
        productCategoryId: CATEGORY_ID,
        name: "Tracked again",
        code: "TRACKED",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("creates a product under a real subcategory", async () => {
    const service = buildService();
    const product = await service.createProduct("user-1", RC_ORG_ID, {
      productSubcategoryId: SUBCATEGORY_ID,
      manufacturer: "Komatsu",
      name: "PC200",
      capacity: 20,
      capacityUnit: "Ton",
    });
    expect(product.manufacturer).toBe("Komatsu");
  });

  it("rejects creating a product under an unknown subcategory", async () => {
    const service = buildService();
    await expect(
      service.createProduct("user-1", RC_ORG_ID, {
        productSubcategoryId: "unknown-subcategory",
        manufacturer: "Komatsu",
        name: "PC200",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("updates a product's editable fields", async () => {
    const service = buildService();
    const updated = await service.updateProduct("user-1", RC_ORG_ID, PRODUCT_ID, {
      capacity: 22,
    });
    expect(updated.capacity).toBe(22);
    expect(updated.manufacturer).toBe("Caterpillar");
  });

  it("rejects updating an unknown product", async () => {
    const service = buildService();
    await expect(
      service.updateProduct("user-1", RC_ORG_ID, "unknown-product", { capacity: 1 }),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects catalogue management for a Renter organization", async () => {
    const service = buildService("renter");
    await expect(
      service.createCategory("user-1", RC_ORG_ID, { name: "Crane", code: "CRANE" }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("still allows reading the catalogue without any permission", async () => {
    const service = buildService("renter");
    await expect(service.listCategories()).resolves.toHaveLength(1);
  });

  it("gets a category, subcategory and product by id", async () => {
    const service = buildService();
    await expect(service.getCategory(CATEGORY_ID)).resolves.toMatchObject({ id: CATEGORY_ID });
    await expect(service.getSubcategory(SUBCATEGORY_ID)).resolves.toMatchObject({
      id: SUBCATEGORY_ID,
    });
    await expect(service.getProduct(PRODUCT_ID)).resolves.toMatchObject({
      id: PRODUCT_ID,
      disabledAt: null,
    });
  });

  it("returns 404 for unknown ids on get-by-id", async () => {
    const service = buildService();
    await expect(service.getCategory("nope")).rejects.toThrow(NotFoundError);
    await expect(service.getSubcategory("nope")).rejects.toThrow(NotFoundError);
    await expect(service.getProduct("nope")).rejects.toThrow(NotFoundError);
    await expect(service.getProduct("00000000-0000-4000-8000-00000000dead")).rejects.toThrow(
      NotFoundError,
    );
  });

  it("hides a disabled product from the picker list but still resolves it by id", async () => {
    const service = buildService();
    const disabled = await service.setProductDisabledAsPlatformAdmin(PRODUCT_ID, true);
    expect(disabled.disabledAt).not.toBeNull();

    await expect(service.listProducts()).resolves.toHaveLength(0);
    await expect(service.listProducts(undefined, true)).resolves.toHaveLength(1);
    await expect(service.getProduct(PRODUCT_ID)).resolves.toMatchObject({
      disabledAt: disabled.disabledAt,
    });

    const enabled = await service.setProductDisabled("user-1", RC_ORG_ID, PRODUCT_ID, false);
    expect(enabled.disabledAt).toBeNull();
    await expect(service.listProducts()).resolves.toHaveLength(1);
  });

  it("rejects tenant disable without catalogue.manage", async () => {
    const service = buildService("renter");
    await expect(
      service.setProductDisabled("user-1", RC_ORG_ID, PRODUCT_ID, true),
    ).rejects.toThrow(ForbiddenError);
  });

  it("cascades a category disable to its subcategories and products in picker lists", async () => {
    const service = buildService();
    const category = await service.setCategoryDisabledAsPlatformAdmin(CATEGORY_ID, true);
    expect(category).toMatchObject({ disabledBy: "self" });
    expect(category.disabledAt).not.toBeNull();

    await expect(service.listCategories()).resolves.toHaveLength(0);
    await expect(service.listSubcategories(CATEGORY_ID)).resolves.toHaveLength(0);
    await expect(service.listProducts()).resolves.toHaveLength(0);
    await expect(service.listProducts(SUBCATEGORY_ID)).resolves.toHaveLength(0);

    await expect(service.listSubcategories(CATEGORY_ID, true)).resolves.toMatchObject([
      { disabledAt: null, disabledBy: "category" },
    ]);
    await expect(service.listProducts(undefined, true)).resolves.toMatchObject([
      { disabledAt: null, disabledBy: "category" },
    ]);
  });

  it("still resolves everything under a disabled branch by id", async () => {
    const service = buildService();
    await service.setSubcategoryDisabledAsPlatformAdmin(SUBCATEGORY_ID, true);
    await expect(service.getCategory(CATEGORY_ID)).resolves.toMatchObject({ disabledBy: null });
    await expect(service.getSubcategory(SUBCATEGORY_ID)).resolves.toMatchObject({
      disabledBy: "self",
    });
    await expect(service.getProduct(PRODUCT_ID)).resolves.toMatchObject({
      name: "320",
      disabledBy: "subcategory",
    });
    await expect(service.listCategories()).resolves.toHaveLength(1);
    await expect(service.listSubcategories(CATEGORY_ID)).resolves.toHaveLength(0);
  });

  it("re-enabling a parent restores children not disabled by themselves", async () => {
    const service = buildService();
    await service.setProductDisabledAsPlatformAdmin(PRODUCT_ID, true);
    await service.setCategoryDisabled("user-1", RC_ORG_ID, CATEGORY_ID, true);
    await expect(service.getProduct(PRODUCT_ID)).resolves.toMatchObject({ disabledBy: "category" });

    await service.setCategoryDisabled("user-1", RC_ORG_ID, CATEGORY_ID, false);
    await expect(service.listSubcategories(CATEGORY_ID)).resolves.toHaveLength(1);
    // The product was disabled on its own, so it stays hidden.
    await expect(service.listProducts()).resolves.toHaveLength(0);
    await expect(service.getProduct(PRODUCT_ID)).resolves.toMatchObject({ disabledBy: "self" });

    await service.setProductDisabledAsPlatformAdmin(PRODUCT_ID, false);
    await expect(service.listProducts()).resolves.toHaveLength(1);
  });

  it("keeps the original timestamp when re-disabling", async () => {
    const service = buildService();
    const first = await service.setSubcategoryDisabledAsPlatformAdmin(SUBCATEGORY_ID, true);
    const again = await service.setSubcategoryDisabledAsPlatformAdmin(SUBCATEGORY_ID, true);
    expect(again.disabledAt).toBe(first.disabledAt);
  });

  it("rejects tenant category/subcategory disable without catalogue.manage", async () => {
    const service = buildService("renter");
    await expect(
      service.setCategoryDisabled("user-1", RC_ORG_ID, CATEGORY_ID, true),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      service.setSubcategoryDisabled("user-1", RC_ORG_ID, SUBCATEGORY_ID, false),
    ).rejects.toThrow(ForbiddenError);
  });

  it("returns 404 when disabling an unknown category or subcategory", async () => {
    const service = buildService();
    await expect(service.setCategoryDisabledAsPlatformAdmin("nope", true)).rejects.toThrow(
      NotFoundError,
    );
    await expect(
      service.setSubcategoryDisabledAsPlatformAdmin("00000000-0000-4000-8000-00000000dead", true),
    ).rejects.toThrow(NotFoundError);
  });
});
