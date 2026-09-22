import type { CommercialQuotationStatus } from "@fleetip/contracts/quotation";
import { sql, type Kysely } from "kysely";
import type { Database } from "../../../../infrastructure/database/types.js";
import type {
  ApplyAcceptedOfferInput,
  CommercialQuotationRecord,
  CommercialQuotationRepositoryPort,
  CreateCommercialQuotationInput,
  ProposeAlternateDatesInput,
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
  "validity_date",
  "commercial_notes",
  "company_terms",
  "status",
  "renter_accepted_at",
  "proposed_alternate_start_date",
  "proposed_alternate_end_date",
  "alternate_date_status",
  "alternate_date_reason",
  "created_at",
  "updated_at",
] as const;

// status/rate_unit/operator_scope/client_snapshot/fuel_scope/
// accommodation_scope/minimum_rental_period_unit are plain DB-level types
// (text/jsonb) — this app is the only writer, always through the closed
// contract enums (same reasoning as RentalRepository's toRentalRecord).
function toQuotationRecord(
  row: Omit<
    CommercialQuotationRecord,
    | "status"
    | "rate_unit"
    | "operator_scope"
    | "client_snapshot"
    | "fuel_scope"
    | "accommodation_scope"
    | "minimum_rental_period_unit"
    | "alternate_date_status"
  > & {
    status: string;
    rate_unit: string;
    operator_scope: string | null;
    client_snapshot: unknown | null;
    fuel_scope: string | null;
    accommodation_scope: string | null;
    minimum_rental_period_unit: string | null;
    alternate_date_status: string;
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
        validity_date: input.validityDate,
        commercial_notes: input.commercialNotes ?? null,
        company_terms: input.companyTerms ?? null,
        status: "draft",
        alternate_date_status: "none",
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
        ...(updates.fuelScope !== undefined && { fuel_scope: updates.fuelScope }),
        ...(updates.dehireTerms !== undefined && { dehire_terms: updates.dehireTerms }),
        ...(updates.operatorScope !== undefined && { operator_scope: updates.operatorScope }),
        ...(updates.accommodationScope !== undefined && {
          accommodation_scope: updates.accommodationScope,
        }),
        ...(updates.workingHours !== undefined && { working_hours: updates.workingHours }),
        ...(updates.workingDaysPerWeek !== undefined && {
          working_days_per_week: updates.workingDaysPerWeek,
        }),
        ...(updates.minimumRentalPeriodValue !== undefined && {
          minimum_rental_period_value: updates.minimumRentalPeriodValue,
        }),
        ...(updates.minimumRentalPeriodUnit !== undefined && {
          minimum_rental_period_unit: updates.minimumRentalPeriodUnit,
        }),
        ...(updates.gstTerms !== undefined && { gst_terms: updates.gstTerms }),
        ...(updates.noticePeriodDays !== undefined && {
          notice_period_days: updates.noticePeriodDays,
        }),
        ...(updates.commercialNotes !== undefined && { commercial_notes: updates.commercialNotes }),
        ...(updates.companyTerms !== undefined && { company_terms: updates.companyTerms }),
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

  async searchByRentalCompany(rentalCompanyOrganizationId: string, query: string) {
    return this.search("rental_company_organization_id", rentalCompanyOrganizationId, query);
  }

  async searchByRenter(renterOrganizationId: string, query: string) {
    return this.search("renter_organization_id", renterOrganizationId, query);
  }

  async proposeAlternateDates(id: string, input: ProposeAlternateDatesInput) {
    const row = await this.db
      .updateTable("commercial_quotations")
      .set({
        proposed_alternate_start_date: input.startDate,
        proposed_alternate_end_date: input.endDate ?? null,
        alternate_date_status: "pending",
        alternate_date_reason: input.reason ?? null,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .returning(QUOTATION_COLUMNS)
      .executeTakeFirstOrThrow();
    return toQuotationRecord(row);
  }

  async respondToAlternateDates(id: string, decision: "accepted" | "rejected") {
    const dateFields =
      decision === "accepted"
        ? await (async () => {
            const current = await this.db
              .selectFrom("commercial_quotations")
              .select(["start_date", "end_date", "proposed_alternate_start_date", "proposed_alternate_end_date"])
              .where("id", "=", id)
              .executeTakeFirstOrThrow();
            return {
              start_date: current.proposed_alternate_start_date ?? current.start_date,
              end_date: current.proposed_alternate_end_date,
            };
          })()
        : {};
    const row = await this.db
      .updateTable("commercial_quotations")
      .set({
        ...dateFields,
        alternate_date_status: "none",
        proposed_alternate_start_date: null,
        proposed_alternate_end_date: null,
        alternate_date_reason: null,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .returning(QUOTATION_COLUMNS)
      .executeTakeFirstOrThrow();
    return toQuotationRecord(row);
  }

  private async search(
    ownerColumn: "rental_company_organization_id" | "renter_organization_id",
    ownerId: string,
    query: string,
  ) {
    const pattern = `%${query}%`;
    const rows = await this.db
      .selectFrom("commercial_quotations")
      .selectAll()
      .where(ownerColumn, "=", ownerId)
      .where(
        sql<boolean>`(reference_number ilike ${pattern} or client_snapshot ->> 'name' ilike ${pattern})`,
      )
      .orderBy("created_at", "desc")
      .limit(10)
      .execute();
    return rows.map(toQuotationRecord);
  }
}
