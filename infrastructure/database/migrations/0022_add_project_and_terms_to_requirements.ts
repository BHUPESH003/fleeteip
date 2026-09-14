import { sql, type Kysely } from "kysely";

/**
 * Associates every Requirement with a Project (client-validated: "Requirements
 * should be associated with a Project", see this phase's brief) and adds the
 * remaining validated business inputs: `shift_pattern` (single/double/flexi),
 * `crew_requirement` (one/two crew sets), and `boom_length` (nullable —
 * only applicable to boom equipment, never made mandatory across the board).
 *
 * `project_id` is backfilled before being made NOT NULL: any Requirement
 * created before this migration (this app's own dev/demo data — there is no
 * production tenant yet) gets a synthetic "Pre-Project Records" Project per
 * Renter organization, so the column can be a real DB-enforced invariant
 * going forward rather than an app-only convention.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations stay decoupled from the app's current Database type, which evolves after this file is written.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("requirements").addColumn("project_id", "uuid").execute();
  await db.schema.alterTable("requirements").addColumn("shift_pattern", "text").execute();
  await db.schema.alterTable("requirements").addColumn("crew_requirement", "text").execute();
  await db.schema.alterTable("requirements").addColumn("boom_length", "numeric").execute();

  // Backfill: one legacy Project per distinct renter_organization_id that
  // has at least one orphan Requirement.
  const orphanRenters = await db
    .selectFrom("requirements")
    .select("renter_organization_id")
    .distinct()
    .where("project_id", "is", null)
    .execute();

  for (const { renter_organization_id } of orphanRenters as { renter_organization_id: string }[]) {
    const sequence = await sql<{ value: string }>`
      INSERT INTO project_reference_sequences (organization_id, next_value)
      VALUES (${renter_organization_id}, 2)
      ON CONFLICT (organization_id)
      DO UPDATE SET next_value = project_reference_sequences.next_value + 1
      RETURNING next_value - 1 AS value
    `.execute(db);
    const projectCode = `PRJ-${new Date().getFullYear()}-${sequence.rows[0]?.value}`;

    const project = await db
      .insertInto("projects")
      .values({
        renter_organization_id,
        project_code: projectCode,
        project_type: "Legacy",
        project_name: "Pre-Project Records",
        site_location: "Unspecified",
        start_date: sql`current_date`,
        status: "active",
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    await db
      .updateTable("requirements")
      .set({ project_id: project.id })
      .where("renter_organization_id", "=", renter_organization_id)
      .where("project_id", "is", null)
      .execute();
  }

  await db.schema
    .alterTable("requirements")
    .alterColumn("project_id", (col) => col.setNotNull())
    .execute();
  await db.schema
    .alterTable("requirements")
    .addForeignKeyConstraint("requirements_project_id_fkey", ["project_id"], "projects", ["id"])
    .onDelete("restrict")
    .execute();

  await db.schema
    .createIndex("requirements_project_id_idx")
    .on("requirements")
    .column("project_id")
    .execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("requirements").dropColumn("boom_length").execute();
  await db.schema.alterTable("requirements").dropColumn("crew_requirement").execute();
  await db.schema.alterTable("requirements").dropColumn("shift_pattern").execute();
  await db.schema
    .alterTable("requirements")
    .dropConstraint("requirements_project_id_fkey")
    .execute();
  await db.schema.alterTable("requirements").dropColumn("project_id").execute();
  // Deliberately does not delete the backfilled "Pre-Project Records"
  // Projects created by `up` — down migrations here undo schema, not data,
  // same convention as every other migration in this codebase.
}
