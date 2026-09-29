import { describe, expect, it } from "vitest";
import {
  addDuration,
  daysBetween,
  formatCompactRange,
  formatDate,
  formatDateRange,
  formatMoney,
  formatRate,
  formatRateUnit,
  formatShortDate,
  humanize,
  plural,
  rentalRef,
  requirementRef,
} from "../lib/format";

// todayIsoDate is left out on purpose: its timezone basis is changing.
describe("dates", () => {
  it("formats calendar dates without a timezone shift", () => {
    expect(formatDate("2026-09-29")).toBe("29 Sep 2026");
    expect(formatDate("2026-01-01")).toBe("01 Jan 2026");
    expect(formatShortDate("2026-12-31")).toBe("31 Dec");
  });

  it("reads missing values as Not specified (short dates as a dash)", () => {
    expect(formatDate(null)).toBe("Not specified");
    expect(formatDate(undefined)).toBe("Not specified");
    expect(formatShortDate(null)).toBe("—");
  });

  it("writes ranges with an arrow and the year once", () => {
    expect(formatDateRange("2026-05-15", "2026-09-30")).toBe("15 May → 30 Sep 2026");
    expect(formatDateRange("2025-12-20", "2026-01-10")).toBe("20 Dec 2025 → 10 Jan 2026");
    expect(formatDateRange("2026-05-15", null)).toBe("15 May 2026 → open-ended");
    expect(formatCompactRange("2026-04-18", null)).toBe("18 Apr 26 → open");
  });

  it("does date-only arithmetic", () => {
    expect(daysBetween("2026-02-27", "2026-03-01")).toBe(2);
    expect(addDuration("2026-01-31", 1, "month")).toBe("2026-03-03");
    expect(addDuration("2026-01-01", 2, "week")).toBe("2026-01-15");
    expect(addDuration("2026-01-01", 3, "shift")).toBe("2026-01-04");
  });
});

describe("money", () => {
  it("uses ₹ with en-IN grouping, paise only when present", () => {
    expect(formatMoney(2408316)).toBe("₹24,08,316");
    expect(formatMoney(1500.5)).toBe("₹1,500.50");
    expect(formatMoney(-250)).toBe("−₹250");
    expect(formatMoney(0)).toBe("₹0");
  });

  it("reads missing or NaN amounts as Not specified", () => {
    expect(formatMoney(null)).toBe("Not specified");
    expect(formatMoney(Number.NaN)).toBe("Not specified");
  });

  it("formats rates in their stored unit", () => {
    expect(formatRate(48000, "day")).toBe("₹48,000 per day");
    expect(formatRateUnit("fortnight")).toBe("per fortnight");
    expect(formatRateUnit(null)).toBe("");
  });
});

describe("refs and words", () => {
  it("derives short references from ids", () => {
    expect(rentalRef("3fa85f64-5717-4562")).toBe("RN-3FA85F64");
    expect(requirementRef("abcdef12-0000")).toBe("REQ-ABCDEF12");
  });

  it("pluralises and humanises", () => {
    expect(plural(1, "day")).toBe("1 day");
    expect(plural(3, "day")).toBe("3 days");
    expect(plural(2, "company", "companies")).toBe("2 companies");
    expect(humanize("with_operator")).toBe("With operator");
  });
});
