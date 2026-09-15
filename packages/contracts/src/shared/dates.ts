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
