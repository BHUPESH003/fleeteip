import type { Kysely } from "kysely";
import type { Database } from "../../../../infrastructure/database/types.js";
import type {
  CreateWorkOrderScopeItemInput,
  WorkOrderScopeItemRecord,
  WorkOrderScopeItemRepositoryPort,
} from "../domain/ports.js";

const SCOPE_ITEM_COLUMNS = ["id", "work_order_id", "item", "responsible_party", "notes", "created_at"] as const;

// responsible_party is a plain `text` column — this app is the only writer,
// always through the closed contract enum (same reasoning as
// QuotationScopeItemRepository's toScopeItemRecord).
function toScopeItemRecord(
  row: Omit<WorkOrderScopeItemRecord, "responsible_party"> & { responsible_party: string },
): WorkOrderScopeItemRecord {
  return row as WorkOrderScopeItemRecord;
}

export class WorkOrderScopeItemRepository implements WorkOrderScopeItemRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async create(input: CreateWorkOrderScopeItemInput): Promise<WorkOrderScopeItemRecord> {
    const row = await this.db
      .insertInto("work_order_scope_items")
      .values({
        work_order_id: input.workOrderId,
        item: input.item,
        responsible_party: input.responsibleParty,
        notes: input.notes ?? null,
      })
      .returning(SCOPE_ITEM_COLUMNS)
      .executeTakeFirstOrThrow();
    return toScopeItemRecord(row);
  }

  async listByWorkOrder(workOrderId: string) {
    const rows = await this.db
      .selectFrom("work_order_scope_items")
      .selectAll()
      .where("work_order_id", "=", workOrderId)
      .orderBy("created_at", "asc")
      .execute();
    return rows.map(toScopeItemRecord);
  }
}
