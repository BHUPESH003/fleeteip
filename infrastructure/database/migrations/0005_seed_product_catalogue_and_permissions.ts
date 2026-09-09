import type { Kysely } from "kysely";

function idFor(idsByCode: Map<string, string>, code: string, kind: string): string {
  const id = idsByCode.get(code);
  if (!id) throw new Error(`seed migration: ${kind} '${code}' not found after insert`);
  return id;
}

/**
 * Seeds a small starter Product Catalogue (platform-level, not per-organization
 * — see docs/equipment-domain-design.md) and grants the new equipment.manage
 * permission to the existing `owner` role (created in 0002).
 *
 * ponytail: five categories, two subcategories each, two products each —
 * enough to register real machines against in manual testing. Add more via
 * a later migration when the catalogue actually needs to grow; this is not
 * meant to be exhaustive.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  const categories = await db
    .insertInto("product_categories")
    .values([
      { code: "EXCAVATOR", name: "Excavator" },
      { code: "CRANE", name: "Crane" },
      { code: "LOADER", name: "Loader" },
      { code: "GENERATOR", name: "Generator" },
      { code: "COMPACTOR", name: "Compactor" },
    ])
    .returning(["id", "code"])
    .execute();

  const categoryIdsByCode = new Map(categories.map((category) => [category.code, category.id]));
  const category = (code: string) => idFor(categoryIdsByCode, code, "product category");

  const subcategories = await db
    .insertInto("product_subcategories")
    .values([
      { product_category_id: category("EXCAVATOR"), code: "TRACKED", name: "Tracked Excavator" },
      { product_category_id: category("EXCAVATOR"), code: "WHEELED", name: "Wheeled Excavator" },
      { product_category_id: category("CRANE"), code: "MOBILE", name: "Mobile Crane" },
      { product_category_id: category("CRANE"), code: "CRAWLER", name: "Crawler Crane" },
      { product_category_id: category("LOADER"), code: "WHEEL", name: "Wheel Loader" },
      { product_category_id: category("LOADER"), code: "BACKHOE", name: "Backhoe Loader" },
      { product_category_id: category("GENERATOR"), code: "DIESEL", name: "Diesel Generator" },
      { product_category_id: category("GENERATOR"), code: "GAS", name: "Gas Generator" },
      {
        product_category_id: category("COMPACTOR"),
        code: "SINGLE_DRUM",
        name: "Single Drum Roller",
      },
      { product_category_id: category("COMPACTOR"), code: "TANDEM", name: "Tandem Roller" },
    ])
    .returning(["id", "code"])
    .execute();

  const subcategoryIdsByCode = new Map(subcategories.map((sub) => [sub.code, sub.id]));
  const subcategory = (code: string) => idFor(subcategoryIdsByCode, code, "product subcategory");

  await db
    .insertInto("products")
    .values([
      {
        product_subcategory_id: subcategory("TRACKED"),
        manufacturer: "Caterpillar",
        name: "320",
        capacity: 20,
        capacity_unit: "Ton",
      },
      {
        product_subcategory_id: subcategory("TRACKED"),
        manufacturer: "Komatsu",
        name: "PC200",
        capacity: 20,
        capacity_unit: "Ton",
      },
      {
        product_subcategory_id: subcategory("MOBILE"),
        manufacturer: "Tadano",
        name: "GR-250",
        capacity: 25,
        capacity_unit: "Ton",
        specifications: JSON.stringify({ boomFamily: { boomLengthM: 41 } }),
      },
      {
        product_subcategory_id: subcategory("MOBILE"),
        manufacturer: "Liebherr",
        name: "LTM 1050",
        capacity: 50,
        capacity_unit: "Ton",
        specifications: JSON.stringify({ boomFamily: { boomLengthM: 60 } }),
      },
      {
        product_subcategory_id: subcategory("BACKHOE"),
        manufacturer: "JCB",
        name: "3DX",
        capacity: 8,
        capacity_unit: "Ton",
      },
      {
        product_subcategory_id: subcategory("WHEEL"),
        manufacturer: "Caterpillar",
        name: "924K",
        capacity: 14,
        capacity_unit: "Ton",
      },
      {
        product_subcategory_id: subcategory("DIESEL"),
        manufacturer: "Cummins",
        name: "C150D5",
        capacity: 150,
        capacity_unit: "kVA",
      },
      {
        product_subcategory_id: subcategory("DIESEL"),
        manufacturer: "Kirloskar",
        name: "125kVA",
        capacity: 125,
        capacity_unit: "kVA",
      },
      {
        product_subcategory_id: subcategory("SINGLE_DRUM"),
        manufacturer: "Bomag",
        name: "BW213",
        capacity: 13,
        capacity_unit: "Ton",
      },
      {
        product_subcategory_id: subcategory("SINGLE_DRUM"),
        manufacturer: "Caterpillar",
        name: "CS56",
        capacity: 10,
        capacity_unit: "Ton",
      },
    ])
    .execute();

  const permission = await db
    .insertInto("permissions")
    .values({ code: "equipment.manage" })
    .returning(["id"])
    .executeTakeFirstOrThrow();

  const ownerRole = await db
    .selectFrom("roles")
    .select("id")
    .where("name", "=", "owner")
    .executeTakeFirstOrThrow();

  await db
    .insertInto("role_permissions")
    .values({ role_id: ownerRole.id, permission_id: permission.id })
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  const permission = await db
    .selectFrom("permissions")
    .select("id")
    .where("code", "=", "equipment.manage")
    .executeTakeFirst();

  if (permission) {
    await db.deleteFrom("role_permissions").where("permission_id", "=", permission.id).execute();
  }

  await db.deleteFrom("permissions").where("code", "=", "equipment.manage").execute();
  await db.deleteFrom("products").execute();
  await db.deleteFrom("product_subcategories").execute();
  await db.deleteFrom("product_categories").execute();
}
