import type { Kysely } from "kysely";
import type { Database } from "../../../../infrastructure/database/types.js";
import type {
  CreateQuotationScopeItemInput,
  QuotationScopeItemRecord,
  QuotationScopeItemRepositoryPort,
} from "../domain/ports.js";

const SCOPE_ITEM_COLUMNS = ["id", "quotation_id", "item", "responsible_party", "notes", "created_at"] as const;

// responsible_party is a plain `text` column — this app is the only writer,
// always through the closed contract enum, so narrowing back here is safe
// (same reasoning as CommercialQuotationRepository's toQuotationRecord).
function toScopeItemRecord(
  row: Omit<QuotationScopeItemRecord, "responsible_party"> & { responsible_party: string },
): QuotationScopeItemRecord {
  return row as QuotationScopeItemRecord;
}

export class QuotationScopeItemRepository implements QuotationScopeItemRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async create(input: CreateQuotationScopeItemInput): Promise<QuotationScopeItemRecord> {
    const row = await this.db
      .insertInto("quotation_scope_items")
      .values({
        quotation_id: input.quotationId,
        item: input.item,
        responsible_party: input.responsibleParty,
        notes: input.notes ?? null,
      })
      .returning(SCOPE_ITEM_COLUMNS)
      .executeTakeFirstOrThrow();
    return toScopeItemRecord(row);
  }

  async findById(id: string) {
    const row = await this.db
      .selectFrom("quotation_scope_items")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toScopeItemRecord(row) : undefined;
  }

  async listByQuotation(quotationId: string) {
    const rows = await this.db
      .selectFrom("quotation_scope_items")
      .selectAll()
      .where("quotation_id", "=", quotationId)
      .orderBy("created_at", "asc")
      .execute();
    return rows.map(toScopeItemRecord);
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom("quotation_scope_items").where("id", "=", id).execute();
  }
}
