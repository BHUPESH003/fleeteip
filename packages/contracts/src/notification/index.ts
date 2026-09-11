import { z } from "zod";

// One entry per business event this correction pass actually notifies on —
// see docs/autonomus-building-instructions.md's correction-pass brief §9.
// Deliberately not covered (documented, not an oversight): bare Requirement
// creation (no single well-defined recipient in a broadcast-discovery
// marketplace with no subscription feature) and transport/mobilization
// state changes (the brief's own lowest-priority "where useful" item).
export const notificationTypeSchema = z.enum([
  "requirement.response_received",
  "quotation.sent",
  "quotation.negotiation_offer",
  "quotation.offer_accepted",
  "quotation.accepted",
  "quotation.rejected",
  "quotation.awarded",
  "auction.participant_approved",
  "auction.started",
  "auction.ended",
  "auction.participant_selected",
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const notificationSchema = z.object({
  id: z.string().uuid(),
  recipientOrganizationId: z.string().uuid(),
  type: notificationTypeSchema,
  title: z.string(),
  message: z.string(),
  relatedResourceType: z.string().nullable(),
  relatedResourceId: z.string().uuid().nullable(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const notificationListResponseSchema = z.object({
  notifications: z.array(notificationSchema),
  unreadCount: z.number().int().nonnegative(),
});
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;
