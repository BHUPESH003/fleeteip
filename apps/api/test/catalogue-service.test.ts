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
const CATEGORY_ID = "category-1";
const SUBCATEGORY_ID = "subcategory-1";
const PRODUCT_ID = "product-1";

function fakePermissionService(organizationTypeCode: OrganizationTypeCode = "rental_company") {
  const membershipRepository: MembershipRepositoryPort = {
    findActiveMembership: async (): Promise<ActiveMembershipRecord | undefined> => ({
      id: "membership-1",
      status: "active",
      role_id: OWNER_ROLE_ID,
    }),
    create: async () => {
      throw new Error("not used in this test");
    },
    listWithOrganizationByUserId: async () => [],
  };
  const roleRepository: RoleRepositoryPort = {
    findByName: async (name) => ({ id: OWNER_ROLE_ID, name }),
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
      created_at: new Date(),
    }),
    codeExists: async () => {
      throw new Error("not used in this test");
    },
    listByType: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeProductCategoryRepository(): ProductCategoryRepositoryPort {
  const categories = new Map<string, ProductCategoryRecord>([
    [CATEGORY_ID, { id: CATEGORY_ID, code: "EXCAVATOR", name: "Excavator", created_at: new Date() }],
  ]);
  let nextId = 2;
  return {
    listAll: async () => [...categories.values()],
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
  };
}

function fakeProductSubcategoryRepository(): ProductSubcategoryRepositoryPort {
  const subcategories = new Map<string, ProductSubcategoryRecord>([
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
  ]);
  let nextId = 2;
  return {
    listByCategory: async (categoryId) =>
      [...subcategories.values()].filter((s) => s.product_category_id === categoryId),
    findById: async (id) => subcategories.get(id),
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
  };
}

function fakeProductRepository(): ProductRepositoryPort {
  const products = new Map<string, ProductRecord>([
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
  ]);
  let nextId = 2;
  return {
    listAll: async (subcategoryId) =>
      [...products.values()].filter(
        (p) => subcategoryId === undefined || p.product_subcategory_id === subcategoryId,
      ),
    findById: async (id) => products.get(id),
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
      };
      products.set(id, updated);
      return updated;
    },
  };
}

function buildService(organizationTypeCode: OrganizationTypeCode = "rental_company") {
  return new CatalogueService(
    fakeProductCategoryRepository(),
    fakeProductSubcategoryRepository(),
    fakeProductRepository(),
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
});
