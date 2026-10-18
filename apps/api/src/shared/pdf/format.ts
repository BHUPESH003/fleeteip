/** Formatting for the generated documents. Pure; amounts follow Indian conventions (lakh/crore). */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-14" -> "14-Sep-2026". Date-only strings are never run through Date (no timezone shift). */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const iso = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  const [y, m, d] = iso.split("-");
  return `${d}-${MONTHS[Number(m) - 1]}-${y}`;
}

/** 1234567.5 -> "12,34,567.50" */
export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** "Rs. 12,34,567.50" — "Rs." not the rupee sign, which the bundled font lacks and the sample documents don't use either. */
export function formatRupees(value: number): string {
  return `Rs. ${formatNumber(value)}`;
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)]!);
    n %= 10;
  }
  if (n > 0) parts.push(ONES[n]!);
  return parts.join(" ");
}

/** 3239100 -> "Indian Rupees Thirty Two Lakh Thirty Nine Thousand One Hundred Only" (paise included when present). */
export function amountInWords(amount: number): string {
  const totalPaise = Math.round(amount * 100);
  let rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;
  const parts: string[] = [];
  for (const [unit, name] of [[10000000, "Crore"], [100000, "Lakh"], [1000, "Thousand"]] as const) {
    if (rupees >= unit) {
      parts.push(`${below1000(Math.floor(rupees / unit))} ${name}`);
      rupees %= unit;
    }
  }
  if (rupees > 0) parts.push(below1000(rupees));
  const rupeeWords = parts.length ? parts.join(" ") : "Zero";
  const paiseWords = paise > 0 ? ` and ${below1000(paise)} Paise` : "";
  return `Indian Rupees ${rupeeWords}${paiseWords} Only`;
}

export const RATE_UNIT_LABEL: Record<string, string> = { shift: "shift", day: "day", week: "week", month: "month" };
