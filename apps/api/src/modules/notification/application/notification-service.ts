import type { Notification, NotificationListResponse } from "@fleetip/contracts/notification";
import { PermissionService } from "../../permissions/application/permission-service.js";
import type { CreateNotificationInput, NotificationRecord, NotificationRepositoryPort } from "../domain/ports.js";

function toNotification(record: NotificationRecord): Notification {
  return {
    id: record.id,
    recipientOrganizationId: record.recipient_organization_id,
    type: record.type,
    title: record.title,
    message: record.message,
    relatedResourceType: record.related_resource_type,
    relatedResourceId: record.related_resource_id,
    readAt: record.read_at ? new Date(record.read_at).toISOString() : null,
    createdAt: new Date(record.created_at).toISOString(),
  };
}

export class NotificationService {
  constructor(
    private readonly notificationRepository: NotificationRepositoryPort,
    private readonly permissionService: PermissionService,
  ) {}

  // System-triggered, not a user action — no permission check. Callers are
  // other application services notifying a counterparty about their own
  // action (e.g. a Rental Company sending a quotation notifies the Renter);
  // the recipient never chose to grant the caller permission over its own
  // notifications, so there's nothing to check against.
  async notify(input: CreateNotificationInput): Promise<Notification> {
    const record = await this.notificationRepository.create(input);
    return toNotification(record);
  }

  async list(userId: string, organizationId: string): Promise<NotificationListResponse> {
    await this.permissionService.requirePermission(userId, organizationId, "organization.manage");
    const [records, unreadCount] = await Promise.all([
      this.notificationRepository.listByOrganization(organizationId),
      this.notificationRepository.countUnread(organizationId),
    ]);
    return { notifications: records.map(toNotification), unreadCount };
  }

  async markRead(
    userId: string,
    organizationId: string,
    notificationId: string,
  ): Promise<Notification | undefined> {
    await this.permissionService.requirePermission(userId, organizationId, "organization.manage");
    const record = await this.notificationRepository.markRead(notificationId, organizationId);
    return record ? toNotification(record) : undefined;
  }

  async markAllRead(userId: string, organizationId: string): Promise<void> {
    await this.permissionService.requirePermission(userId, organizationId, "organization.manage");
    await this.notificationRepository.markAllRead(organizationId);
  }
}
