// For a date <input>'s min/max — "today" in the same YYYY-MM-DD shape the
// API's z.string().date() fields use.
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// Mirrors packages/contracts/src/shared/dates.ts's addDuration — duplicated
// rather than imported, same as todayIsoDate above, since this file already
// has its own copy of that helper instead of pulling from contracts/shared.
export function addDuration(
  startDate: string,
  value: number,
  unit: "shift" | "day" | "week" | "month",
): string {
  const date = new Date(`${startDate}T00:00:00Z`);
  if (unit === "week") date.setUTCDate(date.getUTCDate() + value * 7);
  else if (unit === "month") date.setUTCMonth(date.getUTCMonth() + value);
  else date.setUTCDate(date.getUTCDate() + value);
  return date.toISOString().slice(0, 10);
}

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function formatCurrencyINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function daysUntil(dateStr: string): number {
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(dateStr));
}

/**
 * "05 Oct" — no year. Used in dense contexts (lane scales, filter pills,
 * gap labels) per the design system's date-beats-percentages convention.
 * `formatDate` (above, with year) stays as-is for the ~10 existing call
 * sites that need the year unconditionally.
 */
export function formatShortDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(new Date(dateStr));
}

/**
 * "15 May → 30 Sep 2026" — a range with an arrow, never a hyphen, year
 * only once (on the later/only date that needs it, per the design
 * system's unit table). `end` may be null for an open-ended rental —
 * rendered as the literal "no end date", never a blank or em dash.
 */
export function formatDateRange(start: string, end: string | null): string {
  if (!end) return `${formatShortDate(start)} \u2192 no end date`;
  const startDate = new Date(start);
  const endDate = new Date(end);
  const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();
  const startLabel = sameYear ? formatShortDate(start) : formatDate(start);
  return `${startLabel} \u2192 ${formatDate(end)}`;
}

/** Whole days between two ISO dates (end exclusive-of-time, date-only math). */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

/** Title-cases a camelCase key for display, e.g. "boomLengthM" -> "Boom length m". */
export function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}
