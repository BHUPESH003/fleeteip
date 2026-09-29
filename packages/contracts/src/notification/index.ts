import { z } from "zod";

// One entry per business event this correction pass actually notifies on —
// see docs/autonomus-building-instructions.md's correction-pass brief §9.
// The client has now confirmed notifications are required for all major
// workflow events (this phase's brief §15), extending the original set with
// Work Order issuance, Rental status transitions, Transport/mobilization
// updates, and Billing events. Still deliberately not covered: bare
// Requirement creation (no single well-defined recipient in a
// broadcast-discovery marketplace with no subscription feature).
export const notificationTypeSchema = z.enum([
  "requirement.response_received",
  "requirement.quotation_requested",
  "quotation.sent",
  "quotation.negotiation_offer",
  "quotation.offer_accepted",
  "quotation.accepted",
  "quotation.rejected",
  "quotation.awarded",
  "quotation.alternate_dates_proposed",
  "quotation.alternate_dates_responded",
  "auction.participant_approved",
  "auction.started",
  "auction.ended",
  "auction.participant_selected",
  "workorder.issued",
  "rental.active",
  "rental.off_rent",
  "rental.completed",
  "rental.actual_dates_verified",
  "rental.actual_dates_disputed",
  "rental.actual_dates_corrected",
  "rental.date_change_proposed",
  "rental.date_change_responded",
  "rental.date_change_withdrawn",
  "transport.dispatched",
  "transport.delivered",
  "billing.invoice_issued",
  "billing.payment_recorded",
  // Daily reminders (apps/api/src/modules/reminders), once per record per business day.
  "reminder.rental_ending_soon",
  "reminder.rental_end_passed",
  "reminder.invoice_overdue",
  "reminder.logsheet_missing",
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;
/** NotificationType.x names each value once; `NotificationType` is also the type. */
export const NotificationType = notificationTypeSchema.enum;

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
