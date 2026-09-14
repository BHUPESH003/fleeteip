import { z } from "zod";

// One entry per business event this correction pass actually notifies on —
// see docs/autonomus-building-instructions.md's correction-pass brief §9.
// The client has now confirmed notifications are required for all major
// workflow events (this phase's brief §15), extending the original set with
// Work Order issuance, Rental status transitions, Transport/mobilization
// updates, and Billing events. Still deliberately not covered: bare
// Requirement creation (no single well-defined recipient in a
// broadcast-discovery marketplace with no subscription feature) and a
// time-based "rental ending soon" reminder (needs a scheduler/cron, no such
// infra exists yet — flagged as Phase 2/infra work, not added here).
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
  "workorder.issued",
  "rental.active",
  "rental.completed",
  "transport.dispatched",
  "transport.delivered",
  "billing.invoice_issued",
  "billing.payment_recorded",
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
