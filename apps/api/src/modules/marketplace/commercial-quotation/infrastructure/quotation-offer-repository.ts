import type { QuotationOfferStatus } from "@fleetip/contracts/quotation";
import type { Kysely } from "kysely";
import type { Database } from "../../../../infrastructure/database/types.js";
import type {
  CreateQuotationOfferInput,
  QuotationOfferRecord,
  QuotationOfferRepositoryPort,
} from "../domain/ports.js";

const OFFER_COLUMNS = [
  "id",
  "quotation_id",
  "offered_by_organization_id",
  "rate",
  "rate_unit",
  "start_date",
  "end_date",
  "notes",
  "status",
  "created_at",
] as const;

function toOfferRecord(
  row: Omit<QuotationOfferRecord, "status" | "rate_unit"> & {
    status: string;
    rate_unit: string;
  },
): QuotationOfferRecord {
  return row as QuotationOfferRecord;
}

export class QuotationOfferRepository implements QuotationOfferRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async create(input: CreateQuotationOfferInput): Promise<QuotationOfferRecord> {
    const row = await this.db
      .insertInto("quotation_offers")
      .values({
        quotation_id: input.quotationId,
        offered_by_organization_id: input.offeredByOrganizationId,
        rate: input.rate,
        rate_unit: input.rateUnit,
        start_date: input.startDate,
        end_date: input.endDate ?? null,
        notes: input.notes ?? null,
        status: "pending",
      })
      .returning(OFFER_COLUMNS)
      .executeTakeFirstOrThrow();
    return toOfferRecord(row);
  }

  async findById(id: string) {
    const row = await this.db
      .selectFrom("quotation_offers")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toOfferRecord(row) : undefined;
  }

  async listByQuotation(quotationId: string) {
    const rows = await this.db
      .selectFrom("quotation_offers")
      .selectAll()
      .where("quotation_id", "=", quotationId)
      .orderBy("created_at", "asc")
      .execute();
    return rows.map(toOfferRecord);
  }

  async supersedePending(quotationId: string): Promise<void> {
    await this.db
      .updateTable("quotation_offers")
      .set({ status: "superseded" })
      .where("quotation_id", "=", quotationId)
      .where("status", "=", "pending")
      .execute();
  }

  async updateStatus(id: string, status: QuotationOfferStatus) {
    const row = await this.db
      .updateTable("quotation_offers")
      .set({ status })
      .where("id", "=", id)
      .returning(OFFER_COLUMNS)
      .executeTakeFirstOrThrow();
    return toOfferRecord(row);
  }
}
