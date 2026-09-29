import type { ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import { RateUnit } from "@fleetip/contracts/rental";
import type { CrewRequirement, Requirement, ShiftPattern } from "@fleetip/contracts/rfq";
import type { FigureTone } from "@fleetip/ui";
import { ApiError, apiClient } from "../../../lib/api-client";
import { daysBetween, formatNumber } from "../../../lib/format";
import { optional } from "../../../lib/use-load";

export { requirementRef } from "../../../lib/format";

export const RATE_UNIT_OPTIONS: { value: RateUnit; label: string }[] = [
  { value: RateUnit.shift, label: "Per shift" },
  { value: RateUnit.day, label: "Per day" },
  { value: RateUnit.week, label: "Per week" },
  { value: RateUnit.month, label: "Per month" },
];

export const DURATION_UNIT_OPTIONS: { value: RateUnit; label: string }[] = [
  { value: RateUnit.day, label: "Days" },
  { value: RateUnit.week, label: "Weeks" },
  { value: RateUnit.month, label: "Months" },
  { value: RateUnit.shift, label: "Shifts" },
];

const DURATION_WORD: Record<RateUnit, [string, string]> = {
  shift: ["shift", "shifts"],
  day: ["day", "days"],
  week: ["week", "weeks"],
  month: ["month", "months"],
};

export const SHIFT_PATTERN_LABEL: Record<ShiftPattern, string> = {
  single: "Single shift",
  double: "Double shift",
  flexi: "Flexi shift",
};

export const CREW_LABEL: Record<CrewRequirement, string> = {
  one_crew_set: "One crew set",
  two_crew_sets: "Two crew sets",
};

export const SHIFT_PATTERN_OPTIONS = (Object.keys(SHIFT_PATTERN_LABEL) as ShiftPattern[]).map((value) => ({
  value,
  label: SHIFT_PATTERN_LABEL[value],
}));

export const CREW_OPTIONS = (Object.keys(CREW_LABEL) as CrewRequirement[]).map((value) => ({
  value,
  label: CREW_LABEL[value],
}));

/** "3 months" — null when the requirement didn't say. */
export function durationLabel(value: number | null | undefined, unit: RateUnit | null | undefined): string | null {
  if (!value || !unit) return null;
  const [one, many] = DURATION_WORD[unit];
  return `${formatNumber(value, 0)} ${value === 1 ? one : many}`;
}

/** "50 t" — as entered, never converted. */
export function capacityText(requirement: Pick<Requirement, "capacity" | "capacityUnit">): string | null {
  if (!requirement.capacity) return null;
  return `${formatNumber(requirement.capacity, 2)}${requirement.capacityUnit ? ` ${requirement.capacityUnit}` : ""}`;
}

/** "Crawler crane · 50 t" — the equipment line used as a requirement's name. */
export function equipmentLine(requirement: Requirement, subcategoryName: string | null | undefined): string {
  return [subcategoryName ?? "Equipment type not found", capacityText(requirement)].filter(Boolean).join(" · ");
}

/** "Qty 2 · 36 m boom" */
export function quantityLine(requirement: Requirement): string {
  return [
    `Qty ${formatNumber(requirement.quantity, 0)}`,
    requirement.boomLength ? `${formatNumber(requirement.boomLength, 2)} m boom` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export interface ValidityInfo {
  /** Days from today to the validity date (negative once passed). */
  days: number;
  label: string;
  tone: FigureTone;
  /** Tailwind text colour for the label. */
  className: string;
}

/**
 * Validity is the last day a requirement takes responses (the Open Market
 * only lists requirements whose validity date is today or later). Amber
 * within 3 days, grey once passed.
 */
export function validityInfo(validityDate: string, today: string): ValidityInfo {
  const days = daysBetween(today, validityDate);
  if (days < 0) return { days, label: "Passed", tone: "muted", className: "text-disabled-text" };
  if (days === 0) return { days, label: "Last day today", tone: "warning", className: "text-attention" };
  if (days <= 3)
    return { days, label: `${days} ${days === 1 ? "day" : "days"} left`, tone: "warning", className: "text-attention" };
  return { days, label: `${days} days left`, tone: "default", className: "text-meta-light" };
}

export interface SubcategoryEntry {
  subcategory: ProductSubcategory;
  category: ProductCategory | null;
}

/**
 * Every subcategory with its category — the catalogue has no flat list
 * endpoint, so this is one call per category (open reads, no permission).
 * A failed call leaves that category's subcategories out rather than
 * failing the page. Includes disabled ones (name lookups); the post
 * requirement picker passes includeDisabled=false.
 */
export async function loadSubcategoryIndex(includeDisabled = true): Promise<Map<string, SubcategoryEntry>> {
  const categories = await optional(true, () => apiClient.listProductCategories(includeDisabled) as Promise<ProductCategory[]>, [] as ProductCategory[]);
  const lists = await Promise.all(
    categories.map((category) =>
      optional(true, () => apiClient.listProductSubcategories(category.id, includeDisabled) as Promise<ProductSubcategory[]>, [] as ProductSubcategory[]),
    ),
  );
  const byCategory = new Map(categories.map((c) => [c.id, c]));
  const index = new Map<string, SubcategoryEntry>();
  for (const subcategory of lists.flat()) {
    index.set(subcategory.id, { subcategory, category: byCategory.get(subcategory.productCategoryId) ?? null });
  }
  return index;
}

/**
 * Some requirement 400s come back without a field path (the service checks
 * merged values, not the request shape). When the server text names the
 * field, re-tag the error so useForm shows it under that field instead of
 * in the banner. Matches on message text on purpose: the rfq service (not
 * owned here) gives no path; drop this once it throws with issue paths.
 */
export function underField(pattern: RegExp, path: string) {
  return (error: unknown): never => {
    if (error instanceof ApiError && error.status === 400 && !error.issues.length && pattern.test(error.message)) {
      throw new ApiError(error.message, 400, error.code, [{ path, message: error.message }]);
    }
    throw error;
  };
}

export function subcategoryName(index: Map<string, SubcategoryEntry>, id: string): string | null {
  return index.get(id)?.subcategory.name ?? null;
}
