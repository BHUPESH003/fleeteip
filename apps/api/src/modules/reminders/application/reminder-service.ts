import { addDuration } from "@fleetip/contracts/shared";
import type { FastifyBaseLogger } from "fastify";
import { todayInBusinessZone } from "../../../shared/business-date.js";
import type { NotificationService } from "../../notification/application/notification-service.js";
import type { ReminderKind, ReminderRentalRecord, ReminderRepositoryPort } from "../domain/ports.js";

const ENDING_SOON_DAYS = 3;
const HOUR_MS = 60 * 60 * 1000;

const rentalRef = (id: string) => `RN-${id.slice(0, 8).toUpperCase()}`;
const parties = (record: { rental_company_organization_id: string; renter_organization_id: string | null }) =>
  [record.rental_company_organization_id, record.renter_organization_id].filter((id): id is string => Boolean(id));

export type ReminderCounts = Record<ReminderKind, number>;

/**
 * Time-based reminders as in-app notifications, once per record per business
 * day (reminder_log). A reminder is claimed before it is sent: at-most-once,
 * so a failed send is skipped for that day rather than ever sent twice.
 */
export class ReminderService {
  constructor(
    private readonly reminderRepository: ReminderRepositoryPort,
    private readonly notificationService: Pick<NotificationService, "notify">,
  ) {}

  async runForDate(today: string): Promise<ReminderCounts> {
    const counts: ReminderCounts = {
      rental_ending_soon: 0,
      rental_end_passed: 0,
      invoice_overdue: 0,
      logsheet_missing: 0,
    };
    const send = async (
      kind: ReminderKind,
      recordId: string,
      recipients: string[],
      notification: Omit<Parameters<NotificationService["notify"]>[0], "recipientOrganizationId">,
    ) => {
      if (!(await this.reminderRepository.claim(kind, recordId, today))) return;
      // ponytail: SQS hand-off point — enqueue { kind, recordId, today, recipients } here and let
      // a worker call notify (and email) once the queue exists; the claim above stays as the dedupe.
      for (const recipientOrganizationId of recipients) {
        await this.notificationService.notify({ ...notification, recipientOrganizationId });
      }
      counts[kind] += 1;
    };
    const rentalLink = (rental: ReminderRentalRecord) => ({
      relatedResourceType: "rental",
      relatedResourceId: rental.id,
    });

    const endingOn = addDuration(today, ENDING_SOON_DAYS, "day");
    for (const rental of await this.reminderRepository.listActiveRentalsEndingOn(endingOn)) {
      await send("rental_ending_soon", rental.id, parties(rental), {
        type: "reminder.rental_ending_soon",
        title: "Rental ends in 3 days",
        message: `${rentalRef(rental.id)} (${rental.asset_code}) is due to end on ${rental.end_date}.`,
        ...rentalLink(rental),
      });
    }

    for (const rental of await this.reminderRepository.listActiveRentalsEndedBefore(today)) {
      await send("rental_end_passed", rental.id, [rental.rental_company_organization_id], {
        type: "reminder.rental_end_passed",
        title: "Rental past its end date",
        message: `${rentalRef(rental.id)} (${rental.asset_code}) was due to end on ${rental.end_date} and is still active. Mark it off-rent or extend it.`,
        ...rentalLink(rental),
      });
    }

    for (const invoice of await this.reminderRepository.listUnpaidInvoicesDueBefore(today)) {
      await send("invoice_overdue", invoice.id, parties(invoice), {
        type: "reminder.invoice_overdue",
        title: "Invoice overdue",
        message: `Invoice ${invoice.invoice_number} was due on ${invoice.due_date} and isn't fully paid.`,
        relatedResourceType: "invoice",
        relatedResourceId: invoice.id,
      });
    }

    const yesterday = addDuration(today, -1, "day");
    for (const rental of await this.reminderRepository.listActiveRentalsWithoutLogsheetOn(yesterday)) {
      await send("logsheet_missing", rental.id, [rental.rental_company_organization_id], {
        type: "reminder.logsheet_missing",
        title: "Logsheet missing",
        message: `No logsheet for ${rentalRef(rental.id)} (${rental.asset_code}) on ${yesterday}.`,
        relatedResourceType: "rental_logsheets",
        relatedResourceId: rental.id,
      });
    }

    return counts;
  }
}

/**
 * In-process daily scheduler (product decision: in-process now, SQS later).
 * Ticks at startup and hourly, and runs the reminders once per business day;
 * a failed run is retried on the next tick. Several processes may tick at
 * once — reminder_log keeps each reminder single anyway. Returns a stop function.
 */
export function startReminderScheduler(
  service: Pick<ReminderService, "runForDate">,
  log: Pick<FastifyBaseLogger, "info" | "error">,
  options: { intervalMs?: number; today?: () => string } = {},
): () => void {
  const today = options.today ?? (() => todayInBusinessZone());
  let lastRunDate: string | null = null;
  let running = false;
  const tick = async () => {
    const businessDate = today();
    if (running || lastRunDate === businessDate) return;
    running = true;
    try {
      const counts = await service.runForDate(businessDate);
      lastRunDate = businessDate;
      log.info({ businessDate, counts }, "daily reminders sent");
    } catch (error) {
      log.error({ err: error, businessDate }, "daily reminders failed; retrying next tick");
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), options.intervalMs ?? HOUR_MS);
  timer.unref();
  return () => clearInterval(timer);
}
