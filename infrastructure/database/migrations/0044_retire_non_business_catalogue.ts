import { type Kysely, sql } from "kysely";

// Category code -> subcategory codes, exactly as imported by 0039 (copied, not
// imported: the migrator loads each file standalone).
const BUSINESS_TAXONOMY: Record<string, string[]> = {
  CRANES: ["CRN01", "CRN02", "CRN03", "CRN04", "CRN05", "CRN06"],
  EARTHMOVING: ["ERT01", "ERT02", "ERT03", "ERT04", "ERT05", "ERT06", "ERT07"],
  MEWP: ["AWP01", "AWP02", "AWP03", "AWP04", "AWP05", "AWP06"],
  FOUNDATION: ["FND01", "FND02", "FND03", "FND04", "FND05"],
  ROAD: ["RDC01", "RDC02", "RDC03", "RDC04", "RDC05"],
  CONCRETE: ["CNC01", "CNC02", "CNC03", "CNC04", "CNC05", "CNC06"],
  CRUSHING: ["CRS01", "CRS02", "CRS03"],
  HAULING: ["HLT01", "HLT02", "HLT03", "HLT04"],
  UTILITIES: ["UTL01", "UTL02", "UTL03", "UTL04", "UTL05"],
  ATTACHMENTS: ["ATT01", "ATT02", "ATT03", "ATT04"],
};

/**
 * Retires every catalogue row that is not part of the business-supplied
 * taxonomy imported in 0039. The 0005 starter sample and anything entered by
 * hand before the business list arrived duplicated it with made-up values.
 *
 * Soft disable (disabled_at), not delete: machines.product_id,
 * commercial_quotations.product_id and requirements.product_subcategory_id
 * all reference these rows with ON DELETE RESTRICT, and existing records must
 * keep resolving their names. Disabled rows drop out of every picker and are
 * rejected for new Machines/Requirements (see 0030, 0037).
 *
 * Products: 0039 seeds none, so every Product that exists at this point
 * predates the business list and is retired too. Products catalogue admins
 * add afterwards are unaffected.
 *
 * Idempotent: only rows with disabled_at IS NULL are touched.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  const categoryCodes = Object.keys(BUSINESS_TAXONOMY);

  await db
    .updateTable("product_categories")
    .set({ disabled_at: sql`now()` })
    .where("disabled_at", "is", null)
    .where("code", "not in", categoryCodes)
    .execute();

  // Keep only (category, subcategory) pairs from the business list; a
  // subcategory reusing a business code under a different category is not one.
  const keepers = Object.entries(BUSINESS_TAXONOMY).flatMap(([c, subs]) =>
    subs.map((s) => ({ c, s })),
  );
  await db
    .updateTable("product_subcategories")
    .set({ disabled_at: sql`now()` })
    .where("disabled_at", "is", null)
    .where(
      sql<boolean>`(
        select pc.code from product_categories pc
        where pc.id = product_subcategories.product_category_id
      ) || '/' || product_subcategories.code not in (${sql.join(
        keepers.map((k) => `${k.c}/${k.s}`),
      )})`,
    )
    .execute();

  await db
    .updateTable("products")
    .set({ disabled_at: sql`now()` })
    .where("disabled_at", "is", null)
    .execute();
}

// Intentionally a no-op: after the fact there is no way to tell rows retired
// here from rows an admin had already disabled, and re-enabling the starter
// sample would resurrect the duplicates. Re-enable individual rows from the
// catalogue admin if needed.
export async function down(): Promise<void> {}
