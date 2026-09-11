import type { NotificationType } from "@fleetip/contracts/notification";

export interface NotificationRecord {
  id: string;
  recipient_organization_id: string;
  type: NotificationType;
  title: string;
  message: string;
  related_resource_type: string | null;
  related_resource_id: string | null;
  read_at: Date | string | null;
  created_at: Date | string;
}

export interface CreateNotificationInput {
  recipientOrganizationId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedResourceType?: string;
  relatedResourceId?: string;
}

export interface NotificationRepositoryPort {
  create(input: CreateNotificationInput): Promise<NotificationRecord>;
  // Most-recent-first, capped — a notification list is a glanceable feed,
  // not a full audit log (that's what auction_events/quotation_offers are
  // for on their own resources).
  listByOrganization(organizationId: string, limit?: number): Promise<NotificationRecord[]>;
  countUnread(organizationId: string): Promise<number>;
  markRead(id: string, organizationId: string): Promise<NotificationRecord | undefined>;
  markAllRead(organizationId: string): Promise<void>;
}
