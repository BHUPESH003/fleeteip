import type { Kysely } from "kysely";
import type { Database } from "../../../../infrastructure/database/types.js";
import type {
  QuotationResponseRecord,
  QuotationResponseRepositoryPort,
  SubmitQuotationResponseInput,
} from "../domain/ports.js";

const RESPONSE_COLUMNS = [
  "id",
  "requirement_id",
  "rental_company_organization_id",
  "status",
  "indicative_rate",
  "indicative_rate_unit",
  "notes",
  "quotation_requested_at",
  "created_at",
  "updated_at",
] as const;

// status/indicative_rate_unit are plain `text` columns — this app is the
// only writer, always through the closed contract enums (same reasoning as
// RentalRepository's toRentalRecord).
function toResponseRecord(
  row: Omit<QuotationResponseRecord, "status" | "indicative_rate_unit"> & {
    status: string;
    indicative_rate_unit: string | null;
  },
): QuotationResponseRecord {
  return row as QuotationResponseRecord;
}

export class QuotationResponseRepository implements QuotationResponseRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async submit(input: SubmitQuotationResponseInput): Promise<QuotationResponseRecord> {
    const values = {
      requirement_id: input.requirementId,
      rental_company_organization_id: input.rentalCompanyOrganizationId,
      status: input.status,
      indicative_rate: input.indicativeRate ?? null,
      indicative_rate_unit: input.indicativeRateUnit ?? null,
      notes: input.notes ?? null,
    };
    const row = await this.db
      .insertInto("quotation_responses")
      .values(values)
      .onConflict((oc) =>
        oc.columns(["requirement_id", "rental_company_organization_id"]).doUpdateSet({
          status: values.status,
          indicative_rate: values.indicative_rate,
          indicative_rate_unit: values.indicative_rate_unit,
          notes: values.notes,
          updated_at: new Date(),
        }),
      )
      .returning(RESPONSE_COLUMNS)
      .executeTakeFirstOrThrow();
    return toResponseRecord(row);
  }

  async findByRequirementAndOrganization(
    requirementId: string,
    rentalCompanyOrganizationId: string,
  ) {
    const row = await this.db
      .selectFrom("quotation_responses")
      .selectAll()
      .where("requirement_id", "=", requirementId)
      .where("rental_company_organization_id", "=", rentalCompanyOrganizationId)
      .executeTakeFirst();
    return row ? toResponseRecord(row) : undefined;
  }

  async findById(id: string) {
    const row = await this.db
      .selectFrom("quotation_responses")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toResponseRecord(row) : undefined;
  }

  async listByRequirement(requirementId: string) {
    const rows = await this.db
      .selectFrom("quotation_responses")
      .selectAll()
      .where("requirement_id", "=", requirementId)
      .orderBy("created_at", "desc")
      .execute();
    return rows.map(toResponseRecord);
  }

  async markQuotationRequested(id: string) {
    const row = await this.db
      .updateTable("quotation_responses")
      .set({ quotation_requested_at: new Date(), updated_at: new Date() })
      .where("id", "=", id)
      .returning(RESPONSE_COLUMNS)
      .executeTakeFirstOrThrow();
    return toResponseRecord(row);
  }

  async listRequestedByRentalCompanyOrganization(rentalCompanyOrganizationId: string) {
    const rows = await this.db
      .selectFrom("quotation_responses")
      .selectAll()
      .where("rental_company_organization_id", "=", rentalCompanyOrganizationId)
      .where("quotation_requested_at", "is not", null)
      .orderBy("quotation_requested_at", "desc")
      .execute();
    return rows.map(toResponseRecord);
  }
}
