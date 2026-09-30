import { z } from "zod";

// Calendar-date ("YYYY-MM-DD", z.string().date()'s format) comparisons.
// Plain string comparison sorts these correctly with no Date-object /
// timezone parsing needed — every caller here already works in that format.
//
// "Today" is always the business day in India (risk register §2.5), never the
// browser's or server's own clock zone — otherwise an invoice or rental flips
// overdue at 05:30 IST (UTC midnight) on one side and at midnight on the other.
export const BUSINESS_TIME_ZONE = "Asia/Kolkata";

// "YYYY-MM-DD" of `now` in `timeZone` (en-CA formats dates as YYYY-MM-DD).
export function isoDateInTimeZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function todayIsoDate(): string {
  return isoDateInTimeZone(BUSINESS_TIME_ZONE);
}

export function isPastIsoDate(date: string): boolean {
  return date < todayIsoDate();
}

export function isFutureIsoDate(date: string): boolean {
  return date > todayIsoDate();
}

// Duration math for RateUnit (kept as a plain string union here, not
// imported from the rental module, to avoid a circular dependency — rental's
// own schema already imports isPastIsoDate from this file).
export function addDuration(
  startDate: string,
  value: number,
  unit: "shift" | "day" | "week" | "month",
): string {
  const date = new Date(`${startDate}T00:00:00Z`);
  if (unit === "week") date.setUTCDate(date.getUTCDate() + value * 7);
  else if (unit === "month") date.setUTCMonth(date.getUTCMonth() + value);
  else date.setUTCDate(date.getUTCDate() + value); // day/shift: 1-day granularity
  return date.toISOString().slice(0, 10);
}

// Dates any form accepts: current year ± DATE_YEARS_RANGE. Catches typos
// like 0202, 1926 or 20266 for 2026; covers every real rental, validity and
// due date.
export const DATE_YEARS_RANGE = 50;

export function earliestIsoDate(): string {
  return `${Number(todayIsoDate().slice(0, 4)) - DATE_YEARS_RANGE}-01-01`;
}

export function latestIsoDate(): string {
  return `${Number(todayIsoDate().slice(0, 4)) + DATE_YEARS_RANGE}-12-31`;
}

// A "YYYY-MM-DD" calendar date within DATE_YEARS_RANGE years of this year.
export function isoDate() {
  return z
    .string()
    .date()
    .refine(
      (date) => date >= earliestIsoDate() && date <= latestIsoDate(),
      () => ({ message: `Enter a date between ${earliestIsoDate().slice(0, 4)} and ${latestIsoDate().slice(0, 4)}.` }),
    );
}
