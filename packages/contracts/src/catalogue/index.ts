import { z } from "zod";

export const productCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  code: z
    .string()
    .min(2)
    .max(10)
    .regex(/^[A-Z0-9]+$/, "code must be uppercase letters/numbers only"),
  createdAt: z.string().datetime(),
});

export type ProductCategory = z.infer<typeof productCategorySchema>;

export const productSubcategorySchema = z.object({
  id: z.string().uuid(),
  productCategoryId: z.string().uuid(),
  name: z.string().min(1).max(200),
  code: z
    .string()
    .min(2)
    .max(20)
    .regex(/^[A-Z0-9]+$/, "code must be uppercase letters/numbers only"),
  createdAt: z.string().datetime(),
});

export type ProductSubcategory = z.infer<typeof productSubcategorySchema>;

// Ton/M³/Meter/Kgs/KnM observed directly in legacy production data. A closed
// set on purpose — the same sample also showed "m^3" as a stray duplicate
// notation for M³, which is exactly the free-text bug this enum prevents.
// kVA added for the Generator category: the sampled legacy data came from a
// crane/concrete-equipment-heavy company and had no generator rows, but the
// starter catalogue seeds generators and needs a unit that isn't Ton.
export const capacityUnitSchema = z.enum(["Ton", "M³", "Meter", "Kgs", "KnM", "kVA"]);
export type CapacityUnit = z.infer<typeof capacityUnitSchema>;

// Category-specific specs, grouped by real co-occurrence in legacy data
// rather than as ~19 flat columns (see docs/equipment-domain-design.md §4).
// Every group is optional; a given Product only fills in the groups that
// apply to its category.
export const productSpecificationsSchema = z
  .object({
    boomFamily: z
      .object({
        boomLengthM: z.number().positive().optional(),
        jibLengthM: z.number().positive().optional(),
        luffingLengthM: z.number().positive().optional(),
      })
      .partial()
      .optional(),
    craneRigging: z
      .object({
        wireRope: z.string().optional(),
        wireRopeDia: z.string().optional(),
        auxiliaryWireRope: z.string().optional(),
        auxiliaryWireRopeDia: z.string().optional(),
        counterWeight: z.string().optional(),
        superliftCounterWeight: z.string().optional(),
        boomSection: z.number().int().positive().optional(),
      })
      .partial()
      .optional(),
    fluids: z
      .object({
        dieselTankCapacity: z.number().positive().optional(),
        hydraulicOilTank: z.number().positive().optional(),
        hydraulicOilGrade: z.string().optional(),
        engineOilCapacity: z.number().positive().optional(),
        engineOilGrade: z.string().optional(),
      })
      .partial()
      .optional(),
    transport: z
      .object({
        lengthMm: z.number().positive().optional(),
        widthMm: z.number().positive().optional(),
        heightMm: z.number().positive().optional(),
        weightKg: z.number().positive().optional(),
      })
      .partial()
      .optional(),
  })
  .partial();

export type ProductSpecifications = z.infer<typeof productSpecificationsSchema>;

export const productSchema = z.object({
  id: z.string().uuid(),
  productSubcategoryId: z.string().uuid(),
  name: z.string().min(1).max(200),
  manufacturer: z.string().min(1).max(200),
  capacity: z.number().positive().nullable(),
  capacityUnit: capacityUnitSchema.nullable(),
  specifications: productSpecificationsSchema.nullable(),
  createdAt: z.string().datetime(),
});

export type Product = z.infer<typeof productSchema>;

export const listProductSubcategoriesQuerySchema = z.object({
  categoryId: z.string().uuid(),
});

export type ListProductSubcategoriesQuery = z.infer<typeof listProductSubcategoriesQuerySchema>;

export const listProductsQuerySchema = z.object({
  subcategoryId: z.string().uuid().optional(),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

// --- Platform administration: create/update the shared Product Catalogue ---
// Gated by catalogue.manage — see PERMISSION_ORGANIZATION_TYPES in
// packages/contracts/src/organization/index.ts and
// docs/platform-admin-architecture-requirements.md for the known limitation
// (no real platform-admin tier exists yet). Deletion is deliberately not
// exposed here — see the repository ports for why.

export const createProductCategoryRequestSchema = z.object({
  name: z.string().min(1).max(200),
  code: z
    .string()
    .min(2)
    .max(10)
    .regex(/^[A-Z0-9]+$/, "code must be uppercase letters/numbers only"),
});
export type CreateProductCategoryRequest = z.infer<typeof createProductCategoryRequestSchema>;

// code is deliberately immutable once created — it's a stable natural key
// other records reference by convention (e.g. seed scripts, integrations);
// renaming it isn't a UI requirement today. Only `name` may be corrected.
export const updateProductCategoryRequestSchema = z.object({
  name: z.string().min(1).max(200),
});
export type UpdateProductCategoryRequest = z.infer<typeof updateProductCategoryRequestSchema>;

export const createProductSubcategoryRequestSchema = z.object({
  productCategoryId: z.string().uuid(),
  name: z.string().min(1).max(200),
  code: z
    .string()
    .min(2)
    .max(20)
    .regex(/^[A-Z0-9]+$/, "code must be uppercase letters/numbers only"),
});
export type CreateProductSubcategoryRequest = z.infer<typeof createProductSubcategoryRequestSchema>;

// productCategoryId is deliberately immutable — re-parenting a subcategory
// after Products/Machines already reference it is a structural change well
// beyond "correct a typo", not requested by any known UI gap.
export const updateProductSubcategoryRequestSchema = z.object({
  name: z.string().min(1).max(200),
});
export type UpdateProductSubcategoryRequest = z.infer<typeof updateProductSubcategoryRequestSchema>;

export const createProductRequestSchema = z.object({
  productSubcategoryId: z.string().uuid(),
  name: z.string().min(1).max(200),
  manufacturer: z.string().min(1).max(200),
  capacity: z.number().positive().optional(),
  capacityUnit: capacityUnitSchema.optional(),
  specifications: productSpecificationsSchema.optional(),
});
export type CreateProductRequest = z.infer<typeof createProductRequestSchema>;

// productSubcategoryId is deliberately immutable — same reasoning as
// Machine's productId staying fixed after registration (moving a Product
// that Machines already reference to a different subcategory is a
// structural change, not a field correction).
export const updateProductRequestSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    manufacturer: z.string().min(1).max(200).optional(),
    capacity: z.number().positive().optional(),
    capacityUnit: capacityUnitSchema.optional(),
    specifications: productSpecificationsSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });
export type UpdateProductRequest = z.infer<typeof updateProductRequestSchema>;
