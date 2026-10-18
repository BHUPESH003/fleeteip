import type { Kysely } from "kysely";

/**
 * Imports the full construction-equipment taxonomy (10 categories, 51
 * subcategory groups) from the client's master list
 * (construction_Equipment fleeteip.xlsx, "Detailed Equipment Catalog"
 * sheet). The starter catalogue seeded in 0005 was a tiny five-category
 * sample; this is the real industry taxonomy the business works with.
 *
 * Platform-level, shared reference data — no organization_id (same as
 * everything in product_categories/product_subcategories). Categories and
 * subcategories only; concrete Products (OEM + model) are added by catalogue
 * admins per their own fleet, so none are seeded here.
 *
 * Idempotent / collision-safe: categories are inserted only when their code
 * is new, and subcategories only when (category, code) is new. The 0005
 * starter codes (EXCAVATOR, CRANE, …) are left untouched; the codes used
 * here are distinct and derived from the source sheet's own Sub-Cat codes
 * (hyphen removed to satisfy the uppercase-alnum code rule).
 */

interface SubcategorySeed {
  code: string;
  name: string;
}

interface CategorySeed {
  code: string;
  name: string;
  subcategories: SubcategorySeed[];
}

const TAXONOMY: CategorySeed[] = [
  {
    code: "CRANES",
    name: "Cranes & Lifting",
    subcategories: [
      { code: "CRN01", name: "Crawler Cranes" },
      { code: "CRN02", name: "All-Terrain & Truck Cranes" },
      { code: "CRN03", name: "Rough-Terrain Cranes" },
      { code: "CRN04", name: "Pick & Carry Cranes" },
      { code: "CRN05", name: "Tower Cranes" },
      { code: "CRN06", name: "Gantry & Industrial Cranes" },
    ],
  },
  {
    code: "EARTHMOVING",
    name: "Earthmoving",
    subcategories: [
      { code: "ERT01", name: "Excavators" },
      { code: "ERT02", name: "Backhoe Loaders" },
      { code: "ERT03", name: "Wheel Loaders" },
      { code: "ERT04", name: "Skid Steer & Compact Track Loaders" },
      { code: "ERT05", name: "Bulldozers (Crawler Dozers)" },
      { code: "ERT06", name: "Motor Graders" },
      { code: "ERT07", name: "Trenchers & Scrapers" },
    ],
  },
  {
    code: "MEWP",
    name: "Material Handling & Access Platforms",
    subcategories: [
      { code: "AWP01", name: "Boom Lifts (MEWPs)" },
      { code: "AWP02", name: "Scissor Lifts" },
      { code: "AWP03", name: "Vertical Mast & Personnel Lifts" },
      { code: "AWP04", name: "Telehandlers" },
      { code: "AWP05", name: "Forklifts & Reach Stackers" },
      { code: "AWP06", name: "Hoists & Winches" },
    ],
  },
  {
    code: "FOUNDATION",
    name: "Foundation & Drilling",
    subcategories: [
      { code: "FND01", name: "Piling Rigs" },
      { code: "FND02", name: "Diaphragm Wall (D-Wall) Equipment" },
      { code: "FND03", name: "Hammer & Vibro Systems" },
      { code: "FND04", name: "Drilling Rigs" },
      { code: "FND05", name: "Tunneling & Underground" },
    ],
  },
  {
    code: "ROAD",
    name: "Road & Compaction",
    subcategories: [
      { code: "RDC01", name: "Soil & Asphalt Compactors" },
      { code: "RDC02", name: "Light Compaction" },
      { code: "RDC03", name: "Pavers" },
      { code: "RDC04", name: "Milling & Reclamation" },
      { code: "RDC05", name: "Bitumen & Surface Treatment" },
    ],
  },
  {
    code: "CONCRETE",
    name: "Concrete Equipment",
    subcategories: [
      { code: "CNC01", name: "Batching & Mixing Plants" },
      { code: "CNC02", name: "Concrete Pumps" },
      { code: "CNC03", name: "Concrete Placing Systems" },
      { code: "CNC04", name: "Concrete Mixers" },
      { code: "CNC05", name: "Shotcrete & Plastering" },
      { code: "CNC06", name: "Finishing & Precast" },
    ],
  },
  {
    code: "CRUSHING",
    name: "Crushing & Screening",
    subcategories: [
      { code: "CRS01", name: "Crushers (Tracked & Stationary)" },
      { code: "CRS02", name: "Screeners" },
      { code: "CRS03", name: "Washing & Conveying" },
    ],
  },
  {
    code: "HAULING",
    name: "Hauling & Transport",
    subcategories: [
      { code: "HLT01", name: "Dump Trucks & Tippers" },
      { code: "HLT02", name: "Heavy Haulage Trailers" },
      { code: "HLT03", name: "Prime Movers" },
      { code: "HLT04", name: "Utility & Support Trucks" },
    ],
  },
  {
    code: "UTILITIES",
    name: "Site Utilities",
    subcategories: [
      { code: "UTL01", name: "Power Generation" },
      { code: "UTL02", name: "Air Compressors" },
      { code: "UTL03", name: "Lighting Systems" },
      { code: "UTL04", name: "Dewatering & Pumping" },
      { code: "UTL05", name: "Welding Equipment" },
    ],
  },
  {
    code: "ATTACHMENTS",
    name: "Attachments",
    subcategories: [
      { code: "ATT01", name: "Demolition & Breaking" },
      { code: "ATT02", name: "Excavation & Grading Attachments" },
      { code: "ATT03", name: "Forestry & Clearing" },
      { code: "ATT04", name: "Compaction & Lifting Attachments" },
    ],
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  for (const category of TAXONOMY) {
    const existing = await db
      .selectFrom("product_categories")
      .select("id")
      .where("code", "=", category.code)
      .executeTakeFirst();

    const categoryId =
      existing?.id ??
      (
        await db
          .insertInto("product_categories")
          .values({ code: category.code, name: category.name })
          .returning("id")
          .executeTakeFirstOrThrow()
      ).id;

    for (const sub of category.subcategories) {
      const subExists = await db
        .selectFrom("product_subcategories")
        .select("id")
        .where("product_category_id", "=", categoryId)
        .where("code", "=", sub.code)
        .executeTakeFirst();
      if (subExists) continue;
      await db
        .insertInto("product_subcategories")
        .values({ product_category_id: categoryId, code: sub.code, name: sub.name })
        .execute();
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  // Remove only the taxonomy this migration added, and only when nothing
  // references it (a Product under a subcategory, which would be created by a
  // catalogue admin after this ran — ON DELETE RESTRICT would block it
  // anyway, so we leave such rows in place rather than fail the down).
  for (const category of TAXONOMY) {
    const row = await db
      .selectFrom("product_categories")
      .select("id")
      .where("code", "=", category.code)
      .executeTakeFirst();
    if (!row) continue;

    for (const sub of category.subcategories) {
      const subRow = await db
        .selectFrom("product_subcategories")
        .select("id")
        .where("product_category_id", "=", row.id)
        .where("code", "=", sub.code)
        .executeTakeFirst();
      if (!subRow) continue;
      const hasProducts = await db
        .selectFrom("products")
        .select("id")
        .where("product_subcategory_id", "=", subRow.id)
        .executeTakeFirst();
      if (hasProducts) continue;
      await db.deleteFrom("product_subcategories").where("id", "=", subRow.id).execute();
    }

    const remainingSubs = await db
      .selectFrom("product_subcategories")
      .select("id")
      .where("product_category_id", "=", row.id)
      .executeTakeFirst();
    if (!remainingSubs) {
      await db.deleteFrom("product_categories").where("id", "=", row.id).execute();
    }
  }
}
