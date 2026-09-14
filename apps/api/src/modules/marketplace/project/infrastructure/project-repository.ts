import type { ProjectStatus } from "@fleetip/contracts/project";
import { sql, type Kysely } from "kysely";
import type { Database } from "../../../../infrastructure/database/types.js";
import type {
  CreateProjectInput,
  ProjectRecord,
  ProjectRepositoryPort,
  UpdateProjectFieldsInput,
} from "../domain/ports.js";

const PROJECT_COLUMNS = [
  "id",
  "renter_organization_id",
  "project_code",
  "project_type",
  "project_name",
  "site_location",
  "state",
  "district",
  "start_date",
  "end_date",
  "status",
  "created_at",
  "updated_at",
] as const;

// status is a plain `text` column — this app is the only writer, always
// through the closed contract enum, so narrowing back here is safe (same
// reasoning as RequirementRepository's toRequirementRecord).
function toProjectRecord(row: Omit<ProjectRecord, "status"> & { status: string }): ProjectRecord {
  return row as ProjectRecord;
}

export class ProjectRepository implements ProjectRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async nextReferenceNumber(renterOrganizationId: string): Promise<string> {
    const result = await sql<{ value: string }>`
      INSERT INTO project_reference_sequences (organization_id, next_value)
      VALUES (${renterOrganizationId}, 2)
      ON CONFLICT (organization_id)
      DO UPDATE SET next_value = project_reference_sequences.next_value + 1
      RETURNING next_value - 1 AS value
    `.execute(this.db);
    const value = result.rows[0]?.value;
    const year = new Date().getFullYear();
    return `PRJ-${year}-${value}`;
  }

  async create(input: CreateProjectInput): Promise<ProjectRecord> {
    const row = await this.db
      .insertInto("projects")
      .values({
        renter_organization_id: input.renterOrganizationId,
        project_code: input.projectCode,
        project_type: input.projectType,
        project_name: input.projectName,
        site_location: input.siteLocation,
        state: input.state ?? null,
        district: input.district ?? null,
        start_date: input.startDate,
        end_date: input.endDate ?? null,
        status: "active",
      })
      .returning(PROJECT_COLUMNS)
      .executeTakeFirstOrThrow();
    return toProjectRecord(row);
  }

  async findById(id: string) {
    const row = await this.db
      .selectFrom("projects")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toProjectRecord(row) : undefined;
  }

  async listByRenter(renterOrganizationId: string) {
    const rows = await this.db
      .selectFrom("projects")
      .selectAll()
      .where("renter_organization_id", "=", renterOrganizationId)
      .orderBy("created_at", "desc")
      .execute();
    return rows.map(toProjectRecord);
  }

  async updateStatus(id: string, status: ProjectStatus) {
    const row = await this.db
      .updateTable("projects")
      .set({ status, updated_at: new Date() })
      .where("id", "=", id)
      .returning(PROJECT_COLUMNS)
      .executeTakeFirstOrThrow();
    return toProjectRecord(row);
  }

  async updateFields(id: string, updates: UpdateProjectFieldsInput) {
    const row = await this.db
      .updateTable("projects")
      .set({
        ...(updates.projectType !== undefined && { project_type: updates.projectType }),
        ...(updates.projectName !== undefined && { project_name: updates.projectName }),
        ...(updates.siteLocation !== undefined && { site_location: updates.siteLocation }),
        ...(updates.state !== undefined && { state: updates.state }),
        ...(updates.district !== undefined && { district: updates.district }),
        ...(updates.startDate !== undefined && { start_date: updates.startDate }),
        ...(updates.endDate !== undefined && { end_date: updates.endDate }),
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .returning(PROJECT_COLUMNS)
      .executeTakeFirstOrThrow();
    return toProjectRecord(row);
  }

  async search(renterOrganizationId: string, query: string) {
    const pattern = `%${query}%`;
    const rows = await this.db
      .selectFrom("projects")
      .selectAll()
      .where("renter_organization_id", "=", renterOrganizationId)
      .where("project_name", "ilike", pattern)
      .orderBy("created_at", "desc")
      .limit(10)
      .execute();
    return rows.map(toProjectRecord);
  }
}
