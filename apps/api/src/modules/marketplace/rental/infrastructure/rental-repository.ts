import { RentalStatus, ActualDatesVerificationStatus } from "@fleetip/contracts/rental";
import { sql, type Kysely, type Updateable } from "kysely";
import type { Database } from "../../../../infrastructure/database/types.js";
import type { RentalListParams } from "@fleetip/contracts/list";
import { executePage } from "../../../../infrastructure/database/list-page.js";
import { containsPattern, refIdPrefix, type ParsedListQuery } from "../../../../shared/list-query.js";
import { ConflictError } from "../../../../shared/errors.js";
import type {
  CreateRentalInput,
  RecordRentalEventInput,
  RentalChangeRepositoryPort,
  RentalEventRecord,
  RentalRecord,
  RentalRepositoryPort,
  UpdateRentalTermsInput,
} from "../domain/ports.js";

const RENTAL_COLUMNS = [
  "id",
  "rental_company_organization_id",
  "renter_organization_id",
  "client_snapshot",
  "machine_id",
  "status",
  "project_name",
  "project_location",
  "start_date",
  "end_date",
  "rate",
  "rate_unit",
  "mobilization_charge",
  "demobilization_charge",
  "payment_terms",
  "shift_structure",
  "overtime_rate",
  "sunday_condition",
  "fuel_norms",
  "operator_scope",
  "notice_period_days",
  "dehire_terms",
  "actual_start_date",
  "actual_end_date",
  "actual_dates_verification_status",
  "actual_dates_dispute_reason",
  "proposed_start_date",
  "proposed_end_date",
  "date_change_reason",
  "date_change_proposed_at",
  "created_at",
  "updated_at",
] as const;

// rentals.status/rate_unit/operator_scope are plain `text` columns with no
// DB-level CHECK constraints (see docs/rental-domain-design.md) — this app
// is the only writer, always through the closed contract enums, so
// narrowing them back here is safe. client_snapshot (jsonb) is validated by
// clientSnapshotSchema on every write — same reasoning.
function toRentalRecord(
  row: Omit<
    RentalRecord,
    | "status"
    | "rate_unit"
    | "operator_scope"
    | "client_snapshot"
    | "actual_dates_verification_status"
  > & {
    status: string;
    rate_unit: string;
    operator_scope: string | null;
    client_snapshot: unknown | null;
    actual_dates_verification_status: string | null;
  },
): RentalRecord {
  return row as RentalRecord;
}

// SQLSTATE 23P01 = exclusion_violation — the rentals_no_overlapping_commitment
// constraint from 0006_create_rentals.ts rejecting a concurrent double-booking
// that slipped past the application-level pre-check (docs/rental-domain-design.md §10).
function isExclusionViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23P01"
  );
}

const CLEARED_DATE_CHANGE = {
  proposed_start_date: null,
  proposed_end_date: null,
  date_change_reason: null,
  date_change_proposed_at: null,
};

export class RentalRepository implements RentalRepositoryPort, RentalChangeRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async create(input: CreateRentalInput): Promise<RentalRecord> {
    try {
      const row = await this.db
        .insertInto("rentals")
        .values({
          rental_company_organization_id: input.rentalCompanyOrganizationId,
          renter_organization_id: input.renterOrganizationId ?? null,
          client_snapshot: input.clientSnapshot ? JSON.stringify(input.clientSnapshot) : null,
          machine_id: input.machineId,
          status: input.status,
          project_name: input.projectName ?? null,
          project_location: input.projectLocation ?? null,
          start_date: input.startDate,
          end_date: input.endDate ?? null,
          rate: input.rate,
          rate_unit: input.rateUnit,
          mobilization_charge: input.mobilizationCharge ?? null,
          demobilization_charge: input.demobilizationCharge ?? null,
          payment_terms: input.paymentTerms ?? null,
          shift_structure: input.shiftStructure ?? null,
          overtime_rate: input.overtimeRate ?? null,
          sunday_condition: input.sundayCondition ?? null,
          fuel_norms: input.fuelNorms ?? null,
          operator_scope: input.operatorScope ?? null,
          notice_period_days: input.noticePeriodDays ?? null,
          dehire_terms: input.dehireTerms ?? null,
        })
        .returning(RENTAL_COLUMNS)
        .executeTakeFirstOrThrow();
      return toRentalRecord(row);
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new ConflictError("Machine is already committed for an overlapping period");
      }
      throw error;
    }
  }

  async findById(id: string) {
    const row = await this.db
      .selectFrom("rentals")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toRentalRecord(row) : undefined;
  }

  async listByOrganization(rentalCompanyOrganizationId: string) {
    const rows = await this.db
      .selectFrom("rentals")
      .selectAll()
      .where("rental_company_organization_id", "=", rentalCompanyOrganizationId)
      .execute();
    return rows.map(toRentalRecord);
  }

  async listByRenterOrganization(renterOrganizationId: string) {
    const rows = await this.db
      .selectFrom("rentals")
      .selectAll()
      .where("renter_organization_id", "=", renterOrganizationId)
      .execute();
    return rows.map(toRentalRecord);
  }

  async listRentalsPage(
    party: "rentalCompany" | "renter",
    organizationId: string,
    query: ParsedListQuery<RentalListParams>,
  ) {
    let q = this.db
      .selectFrom("rentals")
      .selectAll()
      .where(party === "rentalCompany" ? "rental_company_organization_id" : "renter_organization_id", "=", organizationId);
    if (query.status) q = q.where("status", "=", query.status);
    if (query.machineId) q = q.where("machine_id", "=", query.machineId);
    // Overlap with [from, to]; an open-ended rental never ends.
    if (query.to) q = q.where("start_date", "<=", query.to);
    if (query.from) {
      const from = query.from;
      q = q.where((eb) => eb.or([eb("end_date", "is", null), eb("end_date", ">=", from)]));
    }
    if (query.q) {
      const pattern = containsPattern(query.q);
      const idPrefix = refIdPrefix(query.q, "RN");
      q = q.where((eb) =>
        eb.or([
          eb("project_name", "ilike", pattern),
          eb("machine_id", "in", eb.selectFrom("machines").select("machines.id").where("machines.asset_code", "ilike", pattern)),
          ...(idPrefix ? [eb(sql<string>`rentals.id::text`, "like", idPrefix)] : []),
        ]),
      );
    }
    const sortColumn = { createdAt: "rentals.created_at", startDate: "rentals.start_date" }[query.sort];
    return executePage(q, sortColumn, "rentals.id", query, toRentalRecord);
  }

  async updateTerms(id: string, updates: UpdateRentalTermsInput) {
    const row = await this.db
      .updateTable("rentals")
      .set({
        ...(updates.projectName !== undefined && { project_name: updates.projectName }),
        ...(updates.projectLocation !== undefined && { project_location: updates.projectLocation }),
        ...(updates.rate !== undefined && { rate: updates.rate }),
        ...(updates.rateUnit !== undefined && { rate_unit: updates.rateUnit }),
        ...(updates.mobilizationCharge !== undefined && {
          mobilization_charge: updates.mobilizationCharge,
        }),
        ...(updates.demobilizationCharge !== undefined && {
          demobilization_charge: updates.demobilizationCharge,
        }),
        ...(updates.paymentTerms !== undefined && { payment_terms: updates.paymentTerms }),
        ...(updates.shiftStructure !== undefined && { shift_structure: updates.shiftStructure }),
        ...(updates.overtimeRate !== undefined && { overtime_rate: updates.overtimeRate }),
        ...(updates.sundayCondition !== undefined && { sunday_condition: updates.sundayCondition }),
        ...(updates.fuelNorms !== undefined && { fuel_norms: updates.fuelNorms }),
        ...(updates.operatorScope !== undefined && { operator_scope: updates.operatorScope }),
        ...(updates.noticePeriodDays !== undefined && {
          notice_period_days: updates.noticePeriodDays,
        }),
        ...(updates.dehireTerms !== undefined && { dehire_terms: updates.dehireTerms }),
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .returning(RENTAL_COLUMNS)
      .executeTakeFirstOrThrow();
    return toRentalRecord(row);
  }

  async updateStatus(id: string, status: RentalStatus, actualDate?: string) {
    const row = await this.db
      .updateTable("rentals")
      .set({
        status,
        ...(status === RentalStatus.active && actualDate !== undefined
          ? { actual_start_date: actualDate, actual_dates_verification_status: ActualDatesVerificationStatus.pending }
          : {}),
        ...(status === RentalStatus.off_rent && actualDate !== undefined
          ? { actual_end_date: actualDate, actual_dates_verification_status: ActualDatesVerificationStatus.pending }
          : {}),
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .returning(RENTAL_COLUMNS)
      .executeTakeFirstOrThrow();
    return toRentalRecord(row);
  }

  async setActualDatesVerification(
    id: string,
    status: "verified" | "disputed",
    disputeReason?: string,
  ) {
    const row = await this.db
      .updateTable("rentals")
      .set({
        actual_dates_verification_status: status,
        actual_dates_dispute_reason: status === ActualDatesVerificationStatus.disputed ? (disputeReason ?? null) : null,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .returning(RENTAL_COLUMNS)
      .executeTakeFirstOrThrow();
    return toRentalRecord(row);
  }

  async findCommittedOverlapping(machineIds: string[], startDate: string, endDate: string | null) {
    if (machineIds.length === 0) return [];
    const rows = await this.db
      .selectFrom("rentals")
      .selectAll()
      .where("machine_id", "in", machineIds)
      .where("status", "in", [RentalStatus.confirmed, RentalStatus.active, RentalStatus.off_rent])
      .where(sql<boolean>`commitment_range && daterange(${startDate}, ${endDate}, '[]')`)
      .orderBy("start_date")
      .execute();
    return rows.map(toRentalRecord);
  }

  async searchByOrganization(rentalCompanyOrganizationId: string, query: string) {
    return this.search("rental_company_organization_id", rentalCompanyOrganizationId, query);
  }

  async searchByRenterOrganization(renterOrganizationId: string, query: string) {
    return this.search("renter_organization_id", renterOrganizationId, query);
  }

  private async search(
    ownerColumn: "rental_company_organization_id" | "renter_organization_id",
    ownerId: string,
    query: string,
  ) {
    const pattern = `%${query}%`;
    const rows = await this.db
      .selectFrom("rentals")
      .selectAll()
      .where(ownerColumn, "=", ownerId)
      .where(
        sql<boolean>`(project_name ilike ${pattern} or client_snapshot ->> 'name' ilike ${pattern})`,
      )
      .orderBy("created_at", "desc")
      .limit(10)
      .execute();
    return rows.map(toRentalRecord);
  }

  async proposeDateChange(
    id: string,
    proposal: { startDate: string; endDate: string | null; reason: string | null },
  ) {
    return this.patch(id, {
      proposed_start_date: proposal.startDate,
      proposed_end_date: proposal.endDate,
      date_change_reason: proposal.reason,
      date_change_proposed_at: new Date(),
    });
  }

  async clearDateChange(id: string) {
    return this.patch(id, CLEARED_DATE_CHANGE);
  }

  async changeDates(id: string, startDate: string, endDate: string | null) {
    try {
      return await this.patch(id, { start_date: startDate, end_date: endDate, ...CLEARED_DATE_CHANGE });
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new ConflictError("Machine is already committed for an overlapping period");
      }
      throw error;
    }
  }

  async correctActualDates(id: string, actualStartDate: string, actualEndDate: string | null) {
    return this.patch(id, {
      actual_start_date: actualStartDate,
      actual_end_date: actualEndDate,
      actual_dates_verification_status: ActualDatesVerificationStatus.pending,
      actual_dates_dispute_reason: null,
    });
  }

  async recordEvent(input: RecordRentalEventInput) {
    await this.db
      .insertInto("rental_events")
      .values({
        rental_id: input.rentalId,
        organization_id: input.organizationId,
        actor_user_id: input.actorUserId,
        type: input.type,
        detail: input.detail ? JSON.stringify(input.detail) : null,
      })
      .execute();
  }

  async listEvents(rentalId: string) {
    const rows = await this.db
      .selectFrom("rental_events")
      .leftJoin("organizations", "organizations.id", "rental_events.organization_id")
      .select([
        "rental_events.id as id",
        "rental_events.rental_id as rental_id",
        "rental_events.organization_id as organization_id",
        "organizations.name as organization_name",
        "rental_events.type as type",
        "rental_events.detail as detail",
        "rental_events.created_at as created_at",
      ])
      .where("rental_events.rental_id", "=", rentalId)
      .orderBy("rental_events.created_at", "desc")
      .execute();
    // type/detail are only ever written by recordEvent from the closed
    // contract enum and a plain object — same narrowing as toRentalRecord.
    return rows as RentalEventRecord[];
  }

  private async patch(id: string, values: Updateable<Database["rentals"]>) {
    const row = await this.db
      .updateTable("rentals")
      .set({ ...values, updated_at: new Date() })
      .where("id", "=", id)
      .returning(RENTAL_COLUMNS)
      .executeTakeFirstOrThrow();
    return toRentalRecord(row);
  }
}
