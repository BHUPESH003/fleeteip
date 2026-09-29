import { describe, expect, it, vi } from "vitest";
import { ReminderService, startReminderScheduler } from "../src/modules/reminders/application/reminder-service.js";
import type {
  ReminderInvoiceRecord,
  ReminderRentalRecord,
  ReminderRepositoryPort,
} from "../src/modules/reminders/domain/ports.js";
import type { CreateNotificationInput } from "../src/modules/notification/domain/ports.js";

const TODAY = "2026-09-29";
const RC = "org-rc";
const RENTER = "org-renter";

const rental = (id: string, end: string | null, renter: string | null = RENTER): ReminderRentalRecord => ({
  id,
  rental_company_organization_id: RC,
  renter_organization_id: renter,
  asset_code: "EXC-01",
  end_date: end,
});

function setup(data: {
  endingOn?: Record<string, ReminderRentalRecord[]>;
  endedBefore?: ReminderRentalRecord[];
  invoices?: ReminderInvoiceRecord[];
  missingLogsheet?: Record<string, ReminderRentalRecord[]>;
}) {
  const claimed = new Set<string>();
  const sent: CreateNotificationInput[] = [];
  const repository: ReminderRepositoryPort = {
    listActiveRentalsEndingOn: async (date) => data.endingOn?.[date] ?? [],
    listActiveRentalsEndedBefore: async () => data.endedBefore ?? [],
    listUnpaidInvoicesDueBefore: async () => data.invoices ?? [],
    listActiveRentalsWithoutLogsheetOn: async (date) => data.missingLogsheet?.[date] ?? [],
    // Same semantics as the unique (kind, record_id, business_date) insert.
    claim: async (kind, recordId, date) => {
      const key = `${kind}:${recordId}:${date}`;
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    },
  };
  const service = new ReminderService(repository, { notify: async (input) => void sent.push(input) as never });
  return { service, sent };
}

describe("daily reminders", () => {
  it("rental ending in 3 days notifies both parties", async () => {
    const { service, sent } = setup({ endingOn: { "2026-10-02": [rental("r1", "2026-10-02")] } });
    const counts = await service.runForDate(TODAY);
    expect(counts.rental_ending_soon).toBe(1);
    expect(sent.map((n) => [n.type, n.recipientOrganizationId])).toEqual([
      ["reminder.rental_ending_soon", RC],
      ["reminder.rental_ending_soon", RENTER],
    ]);
    expect(sent[0]).toMatchObject({ relatedResourceType: "rental", relatedResourceId: "r1" });
  });

  it("skips the renter side for an external client", async () => {
    const { service, sent } = setup({ endingOn: { "2026-10-02": [rental("r1", "2026-10-02", null)] } });
    await service.runForDate(TODAY);
    expect(sent.map((n) => n.recipientOrganizationId)).toEqual([RC]);
  });

  it("end date passed while still active notifies only the Rental Company", async () => {
    const { service, sent } = setup({ endedBefore: [rental("r2", "2026-09-20")] });
    await service.runForDate(TODAY);
    expect(sent.map((n) => [n.type, n.recipientOrganizationId])).toEqual([["reminder.rental_end_passed", RC]]);
  });

  it("overdue invoice notifies both parties", async () => {
    const invoice: ReminderInvoiceRecord = {
      id: "inv-1",
      invoice_number: "INV-0001",
      rental_company_organization_id: RC,
      renter_organization_id: RENTER,
      due_date: "2026-09-25",
    };
    const { service, sent } = setup({ invoices: [invoice] });
    await service.runForDate(TODAY);
    expect(sent.map((n) => [n.type, n.recipientOrganizationId, n.relatedResourceType])).toEqual([
      ["reminder.invoice_overdue", RC, "invoice"],
      ["reminder.invoice_overdue", RENTER, "invoice"],
    ]);
  });

  it("missing logsheet checks yesterday and notifies only the Rental Company", async () => {
    const { service, sent } = setup({ missingLogsheet: { "2026-09-28": [rental("r3", null)] } });
    await service.runForDate(TODAY);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: "reminder.logsheet_missing",
      recipientOrganizationId: RC,
      relatedResourceType: "rental_logsheets",
    });
    expect(sent[0]!.message).toContain("2026-09-28");
  });

  it("is idempotent per record per business day", async () => {
    const { service, sent } = setup({ endedBefore: [rental("r2", "2026-09-20")] });
    await service.runForDate(TODAY);
    const second = await service.runForDate(TODAY);
    expect(second.rental_end_passed).toBe(0);
    expect(sent).toHaveLength(1);
    // A new business day is a new reminder.
    await service.runForDate("2026-09-30");
    expect(sent).toHaveLength(2);
  });

  it("scheduler runs once per business day and retries a failed run", async () => {
    vi.useFakeTimers();
    try {
      const runForDate = vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValue({});
      let today = TODAY;
      const log = { info: vi.fn(), error: vi.fn() };
      const stop = startReminderScheduler({ runForDate }, log, { intervalMs: 1000, today: () => today });
      await vi.advanceTimersByTimeAsync(0);
      expect(log.error).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1000); // retry succeeds
      await vi.advanceTimersByTimeAsync(3000); // same day: no more runs
      expect(runForDate).toHaveBeenCalledTimes(2);
      today = "2026-09-30";
      await vi.advanceTimersByTimeAsync(1000);
      expect(runForDate).toHaveBeenLastCalledWith("2026-09-30");
      expect(runForDate).toHaveBeenCalledTimes(3);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
