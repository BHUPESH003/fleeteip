import {
  capacityUnitSchema,
  type CapacityUnit,
  type CreateProductCategoryRequest,
  type CreateProductRequest,
  type CreateProductSubcategoryRequest,
  type Product,
  type ProductCategory,
  type ProductSpecifications,
  type ProductSubcategory,
  type UpdateProductCategoryRequest,
  type UpdateProductRequest,
  type UpdateProductSubcategoryRequest,
} from "@fleetip/contracts/catalogue";
import { z } from "zod";
import { apiClient } from "../../../lib/api-client";
import { formatNumber } from "../../../lib/format";

/** The closed unit list from the contract (capacityUnitSchema), in its own order. */
export const CAPACITY_UNITS: readonly CapacityUnit[] = capacityUnitSchema.options;

/** "36 Ton" — null when the product has no rated capacity. */
export function formatCapacity(product: Pick<Product, "capacity" | "capacityUnit">): string | null {
  if (product.capacity == null) return null;
  return `${formatNumber(product.capacity, 2)} ${product.capacityUnit ?? ""}`.trim();
}

/**
 * The platform catalogue has no machine-count-per-product column and no
 * product→machine reverse lookup endpoint (see docs/frontend-backend-gap-report.md,
 * Phase 11 — Catalogue). Machine counts shown anywhere in this section are
 * scoped to the CALLING organization's own already-fetched fleet (a single
 * listMachines call, filtered client-side) — real data, not a platform-wide
 * count and not an N+1 loop.
 */
export function machinesUsingProduct<M extends { productId: string }>(productId: string, ownFleet: M[]): M[] {
  return ownFleet.filter((m) => m.productId === productId);
}

/** Own-fleet machine count per product id. */
export function machineCountsByProduct(ownFleet: Array<{ productId: string }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const machine of ownFleet) counts.set(machine.productId, (counts.get(machine.productId) ?? 0) + 1);
  return counts;
}

// ------------------------------------------------------------------ loading

export interface CatalogueIndex {
  categories: ProductCategory[];
  subcategories: ProductSubcategory[];
  products: Product[];
  categoriesById: Map<string, ProductCategory>;
  subcategoriesById: Map<string, ProductSubcategory>;
}

/**
 * The whole catalogue (reads need no permission), including disabled
 * products. Detail pages fetch their own record by id and use this for
 * the surrounding lists and dialogs. Bounded fan-out over
 * categories (a handful, platform-wide), same pattern as
 * machines/page.tsx — not a per-machine N+1 loop.
 */
export async function loadCatalogue(): Promise<CatalogueIndex> {
  const [categories, products] = await Promise.all([
    apiClient.listProductCategories().then((list) => list ?? []),
    apiClient.listProducts().then((list) => list ?? []),
  ]);
  const subcategoryLists = await Promise.all(
    categories.map((c) => apiClient.listProductSubcategories(c.id).then((list) => list ?? [])),
  );
  const subcategories = subcategoryLists.flat();
  return {
    categories,
    subcategories,
    products,
    categoriesById: new Map(categories.map((c) => [c.id, c])),
    subcategoriesById: new Map(subcategories.map((s) => [s.id, s])),
  };
}

export function productsInSubcategory(products: Product[], subcategoryId: string): Product[] {
  return products.filter((p) => p.productSubcategoryId === subcategoryId);
}

// ------------------------------------------------------------------ writes

/**
 * The six catalogue writes, so the same forms serve tenant admins
 * (catalogue.manage, via apiClient) and FleetIP staff (Platform Admin, via
 * adminApiClient). Errors must be ApiError-shaped so lib/errors.ts can
 * translate them.
 */
export interface CatalogueWriter {
  createCategory: (input: CreateProductCategoryRequest) => Promise<ProductCategory | undefined>;
  updateCategory: (id: string, input: UpdateProductCategoryRequest) => Promise<ProductCategory | undefined>;
  createSubcategory: (input: CreateProductSubcategoryRequest) => Promise<ProductSubcategory | undefined>;
  updateSubcategory: (id: string, input: UpdateProductSubcategoryRequest) => Promise<ProductSubcategory | undefined>;
  createProduct: (input: CreateProductRequest) => Promise<Product | undefined>;
  updateProduct: (id: string, input: UpdateProductRequest) => Promise<Product | undefined>;
}

/** Tenant writes: gated by catalogue.manage; organizationId is only the caller's membership for the check. */
export function tenantCatalogueWriter(organizationId: string): CatalogueWriter {
  return {
    createCategory: (input) => apiClient.createProductCategory(organizationId, input),
    updateCategory: (id, input) => apiClient.updateProductCategory(organizationId, id, input),
    createSubcategory: (input) => apiClient.createProductSubcategory(organizationId, input),
    updateSubcategory: (id, input) => apiClient.updateProductSubcategory(organizationId, id, input),
    createProduct: (input) => apiClient.createProduct(organizationId, input),
    updateProduct: (id, input) => apiClient.updateProduct(organizationId, id, input),
  };
}

/** Why a category or subcategory menu can't disable or remove it (products can be disabled; nothing is ever removed). */
export const NO_DISABLE_REASON = "Categories and subcategories can't be disabled yet, and nothing is ever removed.";

// ------------------------------------------------------------------ specifications form

export type SpecGroupKey = keyof ProductSpecifications;

export interface SpecFieldDef {
  key: string;
  label: string;
  kind: "number" | "integer" | "text";
  unit?: string;
}

/**
 * Every field productSpecificationsSchema allows, grouped as the contract
 * groups them (only boomFamily, craneRigging, fluids and transport exist —
 * plan §1). Labels match machines/shared.ts specGroups so the form and the
 * product page read the same.
 */
export const SPEC_FORM_GROUPS: Array<{ key: SpecGroupKey; label: string; fields: SpecFieldDef[] }> = [
  {
    key: "boomFamily",
    label: "Boom",
    fields: [
      { key: "boomLengthM", label: "Boom length", kind: "number", unit: "m" },
      { key: "jibLengthM", label: "Jib length", kind: "number", unit: "m" },
      { key: "luffingLengthM", label: "Luffing length", kind: "number", unit: "m" },
    ],
  },
  {
    key: "craneRigging",
    label: "Crane rigging",
    fields: [
      { key: "wireRope", label: "Wire rope", kind: "text" },
      { key: "wireRopeDia", label: "Wire rope diameter", kind: "text" },
      { key: "auxiliaryWireRope", label: "Auxiliary wire rope", kind: "text" },
      { key: "auxiliaryWireRopeDia", label: "Auxiliary rope diameter", kind: "text" },
      { key: "counterWeight", label: "Counterweight", kind: "text" },
      { key: "superliftCounterWeight", label: "Superlift counterweight", kind: "text" },
      { key: "boomSection", label: "Boom sections", kind: "integer" },
    ],
  },
  {
    key: "fluids",
    label: "Fluids",
    fields: [
      { key: "dieselTankCapacity", label: "Diesel tank capacity", kind: "number" },
      { key: "hydraulicOilTank", label: "Hydraulic oil tank", kind: "number" },
      { key: "hydraulicOilGrade", label: "Hydraulic oil grade", kind: "text" },
      { key: "engineOilCapacity", label: "Engine oil capacity", kind: "number" },
      { key: "engineOilGrade", label: "Engine oil grade", kind: "text" },
    ],
  },
  {
    key: "transport",
    label: "Transport dimensions",
    fields: [
      { key: "lengthMm", label: "Length", kind: "number", unit: "mm" },
      { key: "widthMm", label: "Width", kind: "number", unit: "mm" },
      { key: "heightMm", label: "Height", kind: "number", unit: "mm" },
      { key: "weightKg", label: "Weight", kind: "number", unit: "kg" },
    ],
  },
];

/** Form values keyed "group.field" (the same path the API uses in validation messages). */
export type SpecValues = Record<string, string>;

export function specPath(group: string, field: string): string {
  return `specifications.${group}.${field}`;
}

export function specValuesFrom(specs: ProductSpecifications | null | undefined): SpecValues {
  const values: SpecValues = {};
  for (const group of SPEC_FORM_GROUPS) {
    const stored = (specs?.[group.key] ?? {}) as Record<string, unknown>;
    for (const field of group.fields) {
      const raw = stored[field.key];
      values[specPath(group.key, field.key)] = raw === undefined || raw === null ? "" : String(raw);
    }
  }
  return values;
}

/** Why a filled spec field breaks the contract (numbers > 0, boom sections whole), or null. Empty is fine. */
export function specFieldError(field: SpecFieldDef, raw: string): string | null {
  const value = raw.trim();
  if (field.kind === "text" || !value) return null;
  const n = Number(value);
  if (field.kind === "integer") return Number.isInteger(n) && n > 0 ? null : "Enter a whole number above 0, e.g. 5.";
  return Number.isFinite(n) && n > 0
    ? null
    : `Enter a number above 0${field.unit ? `, in ${field.unit}` : ""}. Leave it empty if it doesn't apply.`;
}

/**
 * Builds the specifications object from the form: only filled fields, only
 * groups with a filled field. The API replaces specifications whole, so
 * this is always the complete desired state.
 */
export function buildSpecifications(values: SpecValues): ProductSpecifications {
  const out: Record<string, Record<string, string | number>> = {};
  for (const group of SPEC_FORM_GROUPS) {
    const entries: Record<string, string | number> = {};
    for (const field of group.fields) {
      const raw = (values[specPath(group.key, field.key)] ?? "").trim();
      if (!raw) continue;
      entries[field.key] = field.kind === "text" ? raw : Number(raw);
    }
    if (Object.keys(entries).length > 0) out[group.key] = entries;
  }
  return out as ProductSpecifications;
}

export function filledSpecCount(values: SpecValues, group: SpecGroupKey): number {
  const def = SPEC_FORM_GROUPS.find((g) => g.key === group);
  if (!def) return 0;
  return def.fields.filter((field) => (values[specPath(group, field.key)] ?? "").trim() !== "").length;
}

// ------------------------------------------------------------------ codes

/** A trimmed string checked by a rule function below; the message it returns is what users read. */
export function checkedString(check: (value: string) => string | null | undefined) {
  return z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const message = check(value);
      if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    });
}

/** Mirrors the contract: uppercase letters and digits only, min/max length per level. */
export function codeError(code: string, min: number, max: number): string | null {
  if (!code) return "Enter a short code, e.g. CRN.";
  if (!/^[A-Z0-9]+$/.test(code)) return "Use capital letters A–Z and digits 0–9 only — no spaces, dashes or dots.";
  if (code.length < min || code.length > max) return `Codes are ${min} to ${max} characters. This one has ${code.length}.`;
  return null;
}

export function nameError(name: string, what: string): string | null {
  if (!name) return `Enter the ${what}.`;
  if (name.length > 200) return `Names are up to 200 characters. This one has ${name.length}.`;
  return null;
}
