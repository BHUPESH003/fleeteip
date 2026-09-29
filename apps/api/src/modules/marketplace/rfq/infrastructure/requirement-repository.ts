import { RequirementStatus } from "@fleetip/contracts/rfq";
import type { Kysely } from "kysely";
import type { Database } from "../../../../infrastructure/database/types.js";
import type { RequirementDiscoveryParams } from "@fleetip/contracts/list";
import { executePage } from "../../../../infrastructure/database/list-page.js";
import { todayInBusinessZone } from "../../../../shared/business-date.js";
import { containsPattern, type ParsedListQuery } from "../../../../shared/list-query.js";
import type {
  CreateRequirementInput,
  RequirementRecord,
  RequirementRepositoryPort,
  UpdateRequirementFieldsInput,
} from "../domain/ports.js";

const REQUIREMENT_COLUMNS = [
  "id",
  "renter_organization_id",
  "project_id",
  "product_subcategory_id",
  "capacity",
  "capacity_unit",
  "boom_length",
  "quantity",
  "project_name",
  "project_location",
  "requested_start_date",
  "expected_duration_value",
  "expected_duration_unit",
  "shift_pattern",
  "crew_requirement",
  "shift_requirement",
  "validity_date",
  "status",
  "notes",
  "created_at",
  "updated_at",
] as const;

// status/expected_duration_unit/shift_pattern/crew_requirement are plain
// `text` columns — this app is the only writer, always through the closed
// contract enums, so narrowing back here is safe (same reasoning as
// RentalRepository's toRentalRecord).
function toRequirementRecord(
  row: Omit<RequirementRecord, "status" | "expected_duration_unit" | "shift_pattern" | "crew_requirement"> & {
    status: string;
    expected_duration_unit: string | null;
    shift_pattern: string | null;
    crew_requirement: string | null;
  },
): RequirementRecord {
  return row as RequirementRecord;
}

export class RequirementRepository implements RequirementRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async create(input: CreateRequirementInput): Promise<RequirementRecord> {
    const row = await this.db
      .insertInto("requirements")
      .values({
        renter_organization_id: input.renterOrganizationId,
        project_id: input.projectId,
        product_subcategory_id: input.productSubcategoryId,
        capacity: input.capacity ?? null,
        capacity_unit: input.capacityUnit ?? null,
        boom_length: input.boomLength ?? null,
        quantity: input.quantity,
        project_name: input.projectName ?? null,
        project_location: input.projectLocation ?? null,
        requested_start_date: input.requestedStartDate,
        expected_duration_value: input.expectedDurationValue ?? null,
        expected_duration_unit: input.expectedDurationUnit ?? null,
        shift_pattern: input.shiftPattern ?? null,
        crew_requirement: input.crewRequirement ?? null,
        shift_requirement: input.shiftRequirement ?? null,
        validity_date: input.validityDate,
        status: RequirementStatus.open,
        notes: input.notes ?? null,
      })
      .returning(REQUIREMENT_COLUMNS)
      .executeTakeFirstOrThrow();
    return toRequirementRecord(row);
  }

  async findById(id: string) {
    const row = await this.db
      .selectFrom("requirements")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toRequirementRecord(row) : undefined;
  }

  async listByRenter(renterOrganizationId: string) {
    const rows = await this.db
      .selectFrom("requirements")
      .selectAll()
      .where("renter_organization_id", "=", renterOrganizationId)
      .orderBy("created_at", "desc")
      .execute();
    return rows.map(toRequirementRecord);
  }

  async listOpenForDiscovery() {
    const rows = await this.db
      .selectFrom("requirements")
      .selectAll()
      .where("status", "=", RequirementStatus.open)
      .where("validity_date", ">=", todayInBusinessZone())
      .orderBy("created_at", "desc")
      .execute();
    return rows.map(toRequirementRecord);
  }

  async listOpenForDiscoveryPage(query: ParsedListQuery<RequirementDiscoveryParams>) {
    let q = this.db
      .selectFrom("requirements")
      .selectAll()
      .where("status", "=", RequirementStatus.open)
      .where("validity_date", ">=", todayInBusinessZone());
    if (query.productSubcategoryId) q = q.where("product_subcategory_id", "=", query.productSubcategoryId);
    if (query.from) q = q.where("requested_start_date", ">=", query.from);
    if (query.to) q = q.where("requested_start_date", "<=", query.to);
    if (query.q) {
      const pattern = containsPattern(query.q);
      q = q.where((eb) => eb.or([eb("project_name", "ilike", pattern), eb("project_location", "ilike", pattern)]));
    }
    const sortColumn = {
      createdAt: "requirements.created_at",
      requestedStartDate: "requirements.requested_start_date",
      validityDate: "requirements.validity_date",
    }[query.sort];
    return executePage(q, sortColumn, "requirements.id", query, toRequirementRecord);
  }

  async updateStatus(id: string, status: RequirementStatus) {
    const row = await this.db
      .updateTable("requirements")
      .set({ status, updated_at: new Date() })
      .where("id", "=", id)
      .returning(REQUIREMENT_COLUMNS)
      .executeTakeFirstOrThrow();
    return toRequirementRecord(row);
  }

  async updateFields(id: string, updates: UpdateRequirementFieldsInput) {
    const row = await this.db
      .updateTable("requirements")
      .set({
        ...(updates.capacity !== undefined && { capacity: updates.capacity }),
        ...(updates.capacityUnit !== undefined && { capacity_unit: updates.capacityUnit }),
        ...(updates.boomLength !== undefined && { boom_length: updates.boomLength }),
        ...(updates.quantity !== undefined && { quantity: updates.quantity }),
        ...(updates.projectName !== undefined && { project_name: updates.projectName }),
        ...(updates.projectLocation !== undefined && {
          project_location: updates.projectLocation,
        }),
        ...(updates.requestedStartDate !== undefined && {
          requested_start_date: updates.requestedStartDate,
        }),
        ...(updates.expectedDurationValue !== undefined && {
          expected_duration_value: updates.expectedDurationValue,
        }),
        ...(updates.expectedDurationUnit !== undefined && {
          expected_duration_unit: updates.expectedDurationUnit,
        }),
        ...(updates.shiftPattern !== undefined && { shift_pattern: updates.shiftPattern }),
        ...(updates.crewRequirement !== undefined && {
          crew_requirement: updates.crewRequirement,
        }),
        ...(updates.shiftRequirement !== undefined && {
          shift_requirement: updates.shiftRequirement,
        }),
        ...(updates.validityDate !== undefined && { validity_date: updates.validityDate }),
        ...(updates.notes !== undefined && { notes: updates.notes }),
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .returning(REQUIREMENT_COLUMNS)
      .executeTakeFirstOrThrow();
    return toRequirementRecord(row);
  }

  async search(renterOrganizationId: string, query: string) {
    const pattern = `%${query}%`;
    const rows = await this.db
      .selectFrom("requirements")
      .selectAll()
      .where("renter_organization_id", "=", renterOrganizationId)
      .where("project_name", "ilike", pattern)
      .orderBy("created_at", "desc")
      .limit(10)
      .execute();
    return rows.map(toRequirementRecord);
  }
}
