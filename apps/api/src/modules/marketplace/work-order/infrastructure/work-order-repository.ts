import type { WorkOrderStatus } from "@fleetip/contracts/work-order";
import { sql, type Kysely } from "kysely";
import type { Database } from "../../../../infrastructure/database/types.js";
import type {
  CreateWorkOrderInput,
  WorkOrderRecord,
  WorkOrderRepositoryPort,
} from "../domain/ports.js";

const WORK_ORDER_COLUMNS = [
  "id",
  "reference_number",
  "quotation_id",
  "rental_id",
  "rental_company_organization_id",
  "renter_organization_id",
  "client_snapshot",
  "project_id",
  "machine_id",
  "start_date",
  "end_date",
  "rate",
  "rate_unit",
  "mobilization_charge",
  "demobilization_charge",
  "overtime_rate",
  "payment_terms",
  "shift_structure",
  "sunday_condition",
  "fuel_norms",
  "fuel_scope",
  "dehire_terms",
  "operator_scope",
  "accommodation_scope",
  "working_hours",
  "working_days_per_week",
  "minimum_rental_period_value",
  "minimum_rental_period_unit",
  "gst_terms",
  "notice_period_days",
  "commercial_notes",
  "company_terms",
  "status",
  "created_at",
  "updated_at",
] as const;

// status/rate_unit/operator_scope/fuel_scope/accommodation_scope/
// minimum_rental_period_unit/client_snapshot are plain DB-level types — this
// app is the only writer, always through the closed contract enums (same
// reasoning as CommercialQuotationRepository's toQuotationRecord).
function toWorkOrderRecord(
  row: Omit<
    WorkOrderRecord,
    | "status"
    | "rate_unit"
    | "operator_scope"
    | "fuel_scope"
    | "accommodation_scope"
    | "minimum_rental_period_unit"
    | "client_snapshot"
  > & {
    status: string;
    rate_unit: string;
    operator_scope: string | null;
    fuel_scope: string | null;
    accommodation_scope: string | null;
    minimum_rental_period_unit: string | null;
    client_snapshot: unknown | null;
  },
): WorkOrderRecord {
  return row as WorkOrderRecord;
}

export class WorkOrderRepository implements WorkOrderRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async nextReferenceNumber(rentalCompanyOrganizationId: string): Promise<string> {
    const result = await sql<{ value: string }>`
      INSERT INTO work_order_reference_sequences (organization_id, next_value)
      VALUES (${rentalCompanyOrganizationId}, 2)
      ON CONFLICT (organization_id)
      DO UPDATE SET next_value = work_order_reference_sequences.next_value + 1
      RETURNING next_value - 1 AS value
    `.execute(this.db);
    const value = result.rows[0]?.value;
    const year = new Date().getFullYear();
    return `WO-${year}-${value}`;
  }

  async create(input: CreateWorkOrderInput): Promise<WorkOrderRecord> {
    const row = await this.db
      .insertInto("work_orders")
      .values({
        reference_number: input.referenceNumber,
        quotation_id: input.quotationId,
        rental_id: input.rentalId,
        rental_company_organization_id: input.rentalCompanyOrganizationId,
        renter_organization_id: input.renterOrganizationId ?? null,
        client_snapshot: input.clientSnapshot ? JSON.stringify(input.clientSnapshot) : null,
        project_id: input.projectId ?? null,
        machine_id: input.machineId,
        start_date: input.startDate,
        end_date: input.endDate ?? null,
        rate: input.rate,
        rate_unit: input.rateUnit,
        mobilization_charge: input.mobilizationCharge ?? null,
        demobilization_charge: input.demobilizationCharge ?? null,
        overtime_rate: input.overtimeRate ?? null,
        payment_terms: input.paymentTerms ?? null,
        shift_structure: input.shiftStructure ?? null,
        sunday_condition: input.sundayCondition ?? null,
        fuel_norms: input.fuelNorms ?? null,
        fuel_scope: input.fuelScope ?? null,
        dehire_terms: input.dehireTerms ?? null,
        operator_scope: input.operatorScope ?? null,
        accommodation_scope: input.accommodationScope ?? null,
        working_hours: input.workingHours ?? null,
        working_days_per_week: input.workingDaysPerWeek ?? null,
        minimum_rental_period_value: input.minimumRentalPeriodValue ?? null,
        minimum_rental_period_unit: input.minimumRentalPeriodUnit ?? null,
        gst_terms: input.gstTerms ?? null,
        notice_period_days: input.noticePeriodDays ?? null,
        commercial_notes: input.commercialNotes ?? null,
        company_terms: input.companyTerms ?? null,
        status: "issued",
      })
      .returning(WORK_ORDER_COLUMNS)
      .executeTakeFirstOrThrow();
    return toWorkOrderRecord(row);
  }

  async findById(id: string) {
    const row = await this.db
      .selectFrom("work_orders")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toWorkOrderRecord(row) : undefined;
  }

  async findByRentalId(rentalId: string) {
    const row = await this.db
      .selectFrom("work_orders")
      .selectAll()
      .where("rental_id", "=", rentalId)
      .executeTakeFirst();
    return row ? toWorkOrderRecord(row) : undefined;
  }

  async findByQuotationId(quotationId: string) {
    const row = await this.db
      .selectFrom("work_orders")
      .selectAll()
      .where("quotation_id", "=", quotationId)
      .executeTakeFirst();
    return row ? toWorkOrderRecord(row) : undefined;
  }

  async listByRentalCompany(rentalCompanyOrganizationId: string) {
    const rows = await this.db
      .selectFrom("work_orders")
      .selectAll()
      .where("rental_company_organization_id", "=", rentalCompanyOrganizationId)
      .orderBy("created_at", "desc")
      .execute();
    return rows.map(toWorkOrderRecord);
  }

  async listByRenter(renterOrganizationId: string) {
    const rows = await this.db
      .selectFrom("work_orders")
      .selectAll()
      .where("renter_organization_id", "=", renterOrganizationId)
      .orderBy("created_at", "desc")
      .execute();
    return rows.map(toWorkOrderRecord);
  }

  async updateStatus(id: string, status: WorkOrderStatus) {
    const row = await this.db
      .updateTable("work_orders")
      .set({ status, updated_at: new Date() })
      .where("id", "=", id)
      .returning(WORK_ORDER_COLUMNS)
      .executeTakeFirstOrThrow();
    return toWorkOrderRecord(row);
  }
}
