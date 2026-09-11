import type { RentalStatus } from "@fleetip/contracts/rental";
import { sql, type Kysely } from "kysely";
import type { Database } from "../../../../infrastructure/database/types.js";
import { ConflictError } from "../../../../shared/errors.js";
import type {
  CreateRentalInput,
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
  "created_at",
  "updated_at",
] as const;

// rentals.status/rate_unit/operator_scope are plain `text` columns with no
// DB-level CHECK constraints (see docs/rental-domain-design.md) — this app
// is the only writer, always through the closed contract enums, so
// narrowing them back here is safe. client_snapshot (jsonb) is validated by
// clientSnapshotSchema on every write — same reasoning.
function toRentalRecord(
  row: Omit<RentalRecord, "status" | "rate_unit" | "operator_scope" | "client_snapshot"> & {
    status: string;
    rate_unit: string;
    operator_scope: string | null;
    client_snapshot: unknown | null;
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

export class RentalRepository implements RentalRepositoryPort {
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

  async updateStatus(id: string, status: RentalStatus) {
    const row = await this.db
      .updateTable("rentals")
      .set({ status, updated_at: new Date() })
      .where("id", "=", id)
      .returning(RENTAL_COLUMNS)
      .executeTakeFirstOrThrow();
    return toRentalRecord(row);
  }

  async isAvailable(machineId: string, startDate: string, endDate: string | null) {
    const result = await sql<{ available: boolean }>`
      SELECT NOT EXISTS (
        SELECT 1 FROM rentals
        WHERE machine_id = ${machineId}
          AND status IN ('confirmed', 'active', 'off_rent')
          AND commitment_range && daterange(${startDate}, ${endDate}, '[]')
      ) AS available
    `.execute(this.db);
    return result.rows[0]?.available ?? false;
  }
}
