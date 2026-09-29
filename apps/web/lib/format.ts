/**
 * Display formats (design tokens: "Money: ₹ + en-IN grouping (₹24,08,316).
 * Dates: 29 Sep 2026; short 29 Sep."). Calendar dates (YYYY-MM-DD) are
 * parsed and formatted in UTC so a date never shifts by a day with the
 * browser's timezone; "today" is the UTC date, matching the API's own
 * validation (packages/contracts/src/shared/dates.ts).
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Today" as YYYY-MM-DD — same UTC basis the server validates against. */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Day number (days since epoch) for a YYYY-MM-DD string. */
export function dayNumber(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;
}

export function isoFromDayNumber(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return isoFromDayNumber(dayNumber(iso) + days);
}

// Mirrors packages/contracts/src/shared/dates.ts's addDuration.
export function addDuration(startDate: string, value: number, unit: "shift" | "day" | "week" | "month"): string {
  const date = new Date(`${startDate}T00:00:00Z`);
  if (unit === "week") date.setUTCDate(date.getUTCDate() + value * 7);
  else if (unit === "month") date.setUTCMonth(date.getUTCMonth() + value);
  else date.setUTCDate(date.getUTCDate() + value);
  return date.toISOString().slice(0, 10);
}

/** Whole days from `fromIso` to `toIso` (date-only math). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(dayNumber(toIso.slice(0, 10)) - dayNumber(fromIso.slice(0, 10)));
}

/** Days from today until the date (negative if past). */
export function daysUntil(dateStr: string): number {
  return daysBetween(todayIsoDate(), dateStr.slice(0, 10));
}

/** "29 Sep 2026". Accepts a date (YYYY-MM-DD) or a datetime. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "Not specified";
  if (isDateOnly(value)) {
    return `${value.slice(8, 10)} ${MONTHS[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`;
  }
  const d = new Date(value);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "29 Sep" — dense contexts (lanes, chips, table cells). */
export function formatShortDate(value: string | null | undefined): string {
  if (!value) return "—";
  if (isDateOnly(value)) return `${value.slice(8, 10)} ${MONTHS[Number(value.slice(5, 7)) - 1]}`;
  const d = new Date(value);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]}`;
}

/** "04 Feb 2024, 11:18" — local time, for createdAt-style timestamps. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Not specified";
  const d = new Date(value);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${formatDate(value)}, ${time}`;
}

/** "10:42" local time. */
export function formatTime(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * "15 May → 30 Sep 2026" — an arrow, never a hyphen; the year once. An
 * open-ended end reads "open-ended", never a blank.
 */
export function formatDateRange(start: string, end: string | null | undefined, openLabel = "open-ended"): string {
  if (!end) return `${formatDate(start)} → ${openLabel}`;
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${sameYear ? formatShortDate(start) : formatDate(start)} → ${formatDate(end)}`;
}

/** Compact range for table cells: "18 Apr 26 → 15 Oct 26". */
export function formatCompactRange(start: string, end: string | null | undefined): string {
  const part = (iso: string) => `${formatShortDate(iso)} ${iso.slice(2, 4)}`;
  return `${part(start)} → ${end ? part(end) : "open"}`;
}

/** Lane month label: "1 Sep" in the 90-day view; "Sep", or "Jan 2026" for January, in 12 months. */
export function laneMonthLabel(iso: string, view: "90" | "12m"): string {
  const month = MONTHS[Number(iso.slice(5, 7)) - 1] ?? "";
  if (view === "90") return `1 ${month}`;
  return iso.slice(5, 7) === "01" ? `${month} ${iso.slice(0, 4)}` : month;
}

/** "₹24,08,316" — en-IN grouping; paise only when the amount has them. */
export function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "Not specified";
  const hasFraction = Math.round(amount * 100) % 100 !== 0;
  const sign = amount < 0 ? "−" : "";
  return (
    sign +
    "₹" +
    Math.abs(amount).toLocaleString("en-IN", {
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: hasFraction ? 2 : 0,
    })
  );
}

/** @deprecated use formatMoney */
export const formatCurrencyINR = (amount: number) => formatMoney(amount);

/** "2,486.5" — en-IN grouping, up to one decimal by default. */
export function formatNumber(value: number, maxFractionDigits = 1): string {
  return value.toLocaleString("en-IN", { maximumFractionDigits: maxFractionDigits });
}

/** "8.5 h" */
export function formatHours(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
}

const RATE_UNIT_LABEL = { shift: "per shift", day: "per day", week: "per week", month: "per month" } as const;
export type RateUnitKey = keyof typeof RATE_UNIT_LABEL;

/** Units shown as stored, never converted: "per day". */
export function formatRateUnit(unit: string | null | undefined): string {
  if (!unit) return "";
  return RATE_UNIT_LABEL[unit as RateUnitKey] ?? `per ${unit}`;
}

/** "₹48,000 per day" */
export function formatRate(rate: number, unit: string): string {
  return `${formatMoney(rate)} ${formatRateUnit(unit)}`;
}

/** "3 days", "1 day" */
export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count.toLocaleString("en-IN")} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

/** "with_operator" → "With operator" */
export function humanize(value: string | null | undefined): string {
  if (!value) return "";
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Title-cases a camelCase key for display, e.g. "boomLengthM" → "Boom length m". */
export function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * Rentals have no stored reference number; this short display reference
 * is derived from the id (plan §1: keep RN-${id.slice(0,8)}).
 */
export function rentalRef(id: string): string {
  return `RN-${id.slice(0, 8).toUpperCase()}`;
}

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return formatDate(iso);
}

/** Requirements have no stored reference; derived from the id like rentalRef. Always REQ-, never RFQ-. */
export function requirementRef(id: string): string {
  return `REQ-${id.slice(0, 8).toUpperCase()}`;
}
