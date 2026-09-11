import type { Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type {
  CreateNotificationInput,
  NotificationRecord,
  NotificationRepositoryPort,
} from "../domain/ports.js";

const NOTIFICATION_COLUMNS = [
  "id",
  "recipient_organization_id",
  "type",
  "title",
  "message",
  "related_resource_type",
  "related_resource_id",
  "read_at",
  "created_at",
] as const;

// `type` is a plain `text` column — this app is the only writer, always
// through the closed NotificationType enum (same reasoning as every other
// repository's toXRecord narrowing helper).
function toNotificationRecord(row: Omit<NotificationRecord, "type"> & { type: string }) {
  return row as NotificationRecord;
}

export class NotificationRepository implements NotificationRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async create(input: CreateNotificationInput) {
    const row = await this.db
      .insertInto("notifications")
      .values({
        recipient_organization_id: input.recipientOrganizationId,
        type: input.type,
        title: input.title,
        message: input.message,
        related_resource_type: input.relatedResourceType ?? null,
        related_resource_id: input.relatedResourceId ?? null,
      })
      .returning(NOTIFICATION_COLUMNS)
      .executeTakeFirstOrThrow();
    return toNotificationRecord(row);
  }

  async listByOrganization(organizationId: string, limit = 50) {
    const rows = await this.db
      .selectFrom("notifications")
      .selectAll()
      .where("recipient_organization_id", "=", organizationId)
      .orderBy("created_at", "desc")
      .limit(limit)
      .execute();
    return rows.map(toNotificationRecord);
  }

  async countUnread(organizationId: string) {
    const result = await this.db
      .selectFrom("notifications")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("recipient_organization_id", "=", organizationId)
      .where("read_at", "is", null)
      .executeTakeFirstOrThrow();
    return Number(result.count);
  }

  async markRead(id: string, organizationId: string) {
    const row = await this.db
      .updateTable("notifications")
      .set({ read_at: new Date() })
      .where("id", "=", id)
      .where("recipient_organization_id", "=", organizationId)
      .returning(NOTIFICATION_COLUMNS)
      .executeTakeFirst();
    return row ? toNotificationRecord(row) : undefined;
  }

  async markAllRead(organizationId: string) {
    await this.db
      .updateTable("notifications")
      .set({ read_at: new Date() })
      .where("recipient_organization_id", "=", organizationId)
      .where("read_at", "is", null)
      .execute();
  }
}
