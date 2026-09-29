import { describe, expect, it } from "vitest";
import { fromPaise, roundRupees, sumPaise, toPaise } from "../src/shared/money.js";
import { isFullyPaid } from "../src/modules/billing/domain/invoice-status.js";
import { todayInBusinessZone } from "../src/shared/business-date.js";
import { isoDateInTimeZone, todayIsoDate } from "@fleetip/contracts/shared";

describe("money in paise", () => {
  it("adds 0.1 + 0.2 to exactly 0.3", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(fromPaise(sumPaise([0.1, 0.2]))).toBe(0.3);
    expect(isFullyPaid(0.3, 0.1 + 0.2)).toBe(true);
  });

  it("rounds half up at 2 decimals despite binary noise", () => {
    expect(toPaise(1.005)).toBe(101);
    expect(toPaise(0.285)).toBe(29);
    expect(toPaise(-1.005)).toBe(-101);
    expect(roundRupees(0.3 * 123.45)).toBe(37.04); // 37.035
    expect(roundRupees(2.5 * 1999.99)).toBe(4999.98); // 4999.975
  });

  it("treats partial payments summing to the total as fully paid", () => {
    const total = 1000.1;
    const payments = [333.37, 333.37, 333.36];
    expect(isFullyPaid(total, fromPaise(sumPaise(payments.slice(0, 2))))).toBe(false);
    expect(isFullyPaid(total, fromPaise(sumPaise(payments)))).toBe(true);
    expect(isFullyPaid(total, 1000.09)).toBe(false);
  });

  it("treats an overpayment as paid", () => {
    expect(isFullyPaid(100, 100.01)).toBe(true);
    expect(fromPaise(toPaise(100) - sumPaise([60.1, 40.2]))).toBe(-0.3);
  });
});

describe("business date (Asia/Kolkata)", () => {
  it("is already tomorrow in IST from 18:30 UTC", () => {
    expect(todayInBusinessZone(new Date("2026-03-31T18:29:59Z"))).toBe("2026-03-31");
    expect(todayInBusinessZone(new Date("2026-03-31T18:30:00Z"))).toBe("2026-04-01");
  });

  it("stays on the IST day just after UTC midnight", () => {
    expect(todayInBusinessZone(new Date("2026-12-31T23:59:59Z"))).toBe("2027-01-01");
    expect(todayInBusinessZone(new Date("2027-01-01T00:00:01Z"))).toBe("2027-01-01");
    expect(isoDateInTimeZone("UTC", new Date("2026-12-31T23:59:59Z"))).toBe("2026-12-31");
  });

  it("contracts' todayIsoDate uses the same zone", () => {
    expect(todayIsoDate()).toBe(todayInBusinessZone());
  });
});
