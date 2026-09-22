// Calendar-date ("YYYY-MM-DD", z.string().date()'s format) comparisons.
// Plain string comparison sorts these correctly with no Date-object /
// timezone parsing needed — every caller here already works in that format.
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
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
