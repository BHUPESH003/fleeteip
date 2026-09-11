import type { CommercialQuotationStatus } from "@fleetip/contracts/quotation";
import { sql, type Kysely } from "kysely";
import type { Database } from "../../../../infrastructure/database/types.js";
import type {
  ApplyAcceptedOfferInput,
  CommercialQuotationRecord,
  CommercialQuotationRepositoryPort,
  CreateCommercialQuotationInput,
  UpdateCommercialQuotationTermsInput,
} from "../domain/ports.js";

const QUOTATION_COLUMNS = [
  "id",
  "rental_company_organization_id",
  "renter_organization_id",
  "client_snapshot",
  "requirement_id",
  "quotation_response_id",
  "source_auction_id",
  "reference_number",
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
  "dehire_terms",
  "operator_scope",
  "notice_period_days",
  "validity_date",
  "commercial_notes",
  "status",
  "renter_accepted_at",
  "created_at",
  "updated_at",
] as const;

// status/rate_unit/operator_scope/client_snapshot are plain DB-level types
// (text/jsonb) — this app is the only writer, always through the closed
// contract enums (same reasoning as RentalRepository's toRentalRecord).
function toQuotationRecord(
  row: Omit<
    CommercialQuotationRecord,
    "status" | "rate_unit" | "operator_scope" | "client_snapshot"
  > & {
    status: string;
    rate_unit: string;
    operator_scope: string | null;
    client_snapshot: unknown | null;
  },
): CommercialQuotationRecord {
  return row as CommercialQuotationRecord;
}

export class CommercialQuotationRepository implements CommercialQuotationRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async nextReferenceNumber(rentalCompanyOrganizationId: string): Promise<string> {
    const result = await sql<{ value: string }>`
      INSERT INTO quotation_reference_sequences (organization_id, next_value)
      VALUES (${rentalCompanyOrganizationId}, 2)
      ON CONFLICT (organization_id)
      DO UPDATE SET next_value = quotation_reference_sequences.next_value + 1
      RETURNING next_value - 1 AS value
    `.execute(this.db);
    const value = result.rows[0]?.value;
    const year = new Date().getFullYear();
    return `Q-${year}-${value}`;
  }

  async create(input: CreateCommercialQuotationInput): Promise<CommercialQuotationRecord> {
    const row = await this.db
      .insertInto("commercial_quotations")
      .values({
        rental_company_organization_id: input.rentalCompanyOrganizationId,
        renter_organization_id: input.renterOrganizationId ?? null,
        client_snapshot: input.clientSnapshot ? JSON.stringify(input.clientSnapshot) : null,
        requirement_id: input.requirementId ?? null,
        quotation_response_id: input.quotationResponseId ?? null,
        source_auction_id: input.sourceAuctionId ?? null,
        reference_number: input.referenceNumber,
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
        dehire_terms: input.dehireTerms ?? null,
        operator_scope: input.operatorScope ?? null,
        notice_period_days: input.noticePeriodDays ?? null,
        validity_date: input.validityDate,
        commercial_notes: input.commercialNotes ?? null,
        status: "draft",
      })
      .returning(QUOTATION_COLUMNS)
      .executeTakeFirstOrThrow();
    return toQuotationRecord(row);
  }

  async findById(id: string) {
    const row = await this.db
      .selectFrom("commercial_quotations")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toQuotationRecord(row) : undefined;
  }

  async listByRentalCompany(rentalCompanyOrganizationId: string) {
    const rows = await this.db
      .selectFrom("commercial_quotations")
      .selectAll()
      .where("rental_company_organization_id", "=", rentalCompanyOrganizationId)
      .orderBy("created_at", "desc")
      .execute();
    return rows.map(toQuotationRecord);
  }

  async listByRenter(renterOrganizationId: string) {
    const rows = await this.db
      .selectFrom("commercial_quotations")
      .selectAll()
      .where("renter_organization_id", "=", renterOrganizationId)
      .orderBy("created_at", "desc")
      .execute();
    return rows.map(toQuotationRecord);
  }

  async updateTerms(id: string, updates: UpdateCommercialQuotationTermsInput) {
    const row = await this.db
      .updateTable("commercial_quotations")
      .set({
        ...(updates.mobilizationCharge !== undefined && {
          mobilization_charge: updates.mobilizationCharge,
        }),
        ...(updates.demobilizationCharge !== undefined && {
          demobilization_charge: updates.demobilizationCharge,
        }),
        ...(updates.overtimeRate !== undefined && { overtime_rate: updates.overtimeRate }),
        ...(updates.paymentTerms !== undefined && { payment_terms: updates.paymentTerms }),
        ...(updates.shiftStructure !== undefined && { shift_structure: updates.shiftStructure }),
        ...(updates.sundayCondition !== undefined && { sunday_condition: updates.sundayCondition }),
        ...(updates.fuelNorms !== undefined && { fuel_norms: updates.fuelNorms }),
        ...(updates.dehireTerms !== undefined && { dehire_terms: updates.dehireTerms }),
        ...(updates.operatorScope !== undefined && { operator_scope: updates.operatorScope }),
        ...(updates.noticePeriodDays !== undefined && {
          notice_period_days: updates.noticePeriodDays,
        }),
        ...(updates.commercialNotes !== undefined && { commercial_notes: updates.commercialNotes }),
        // A direct term edit invalidates any prior Renter acceptance — see
        // setRenterAccepted below.
        renter_accepted_at: null,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .returning(QUOTATION_COLUMNS)
      .executeTakeFirstOrThrow();
    return toQuotationRecord(row);
  }

  async applyAcceptedOffer(id: string, input: ApplyAcceptedOfferInput) {
    const row = await this.db
      .updateTable("commercial_quotations")
      .set({
        rate: input.rate,
        rate_unit: input.rateUnit,
        start_date: input.startDate,
        end_date: input.endDate,
        // New negotiated terms — same reasoning as updateTerms above.
        renter_accepted_at: null,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .returning(QUOTATION_COLUMNS)
      .executeTakeFirstOrThrow();
    return toQuotationRecord(row);
  }

  async updateStatus(id: string, status: CommercialQuotationStatus) {
    const row = await this.db
      .updateTable("commercial_quotations")
      .set({ status, updated_at: new Date() })
      .where("id", "=", id)
      .returning(QUOTATION_COLUMNS)
      .executeTakeFirstOrThrow();
    return toQuotationRecord(row);
  }

  async setRenterAccepted(id: string, accepted: boolean) {
    const row = await this.db
      .updateTable("commercial_quotations")
      .set({ renter_accepted_at: accepted ? new Date() : null, updated_at: new Date() })
      .where("id", "=", id)
      .returning(QUOTATION_COLUMNS)
      .executeTakeFirstOrThrow();
    return toQuotationRecord(row);
  }

  async expireIfDue(id: string) {
    const row = await this.db
      .updateTable("commercial_quotations")
      .set({ status: "expired", updated_at: new Date() })
      .where("id", "=", id)
      .where("status", "in", ["sent", "negotiating"])
      .where(sql<boolean>`validity_date < current_date`)
      .returning(QUOTATION_COLUMNS)
      .executeTakeFirst();
    if (row) return toQuotationRecord(row);
    return this.findById(id);
  }
}
