import type { Product, ProductCategory, ProductSpecifications, ProductSubcategory } from "@fleetip/contracts/catalogue";
import { MachineStatus, type Machine } from "@fleetip/contracts/equipment";
import { MaintenanceStatus, type MaintenanceRecord, type MaintenanceType } from "@fleetip/contracts/maintenance";
import { RentalStatus, type Rental } from "@fleetip/contracts/rental";
import { formatNumber } from "../../../lib/format";
import type { Deployment } from "../../../lib/status";

export type { Deployment };

/** Rental statuses that commit a machine's dates (the API's availability check uses the same set). */
export const COMMITTING_RENTAL_STATUSES: ReadonlyArray<RentalStatus> = [RentalStatus.confirmed, RentalStatus.active, RentalStatus.off_rent];

/** Maintenance statuses that block new rentals (mirrors hasOverlappingMaintenance). */
export function blocksAvailability(status: MaintenanceStatus): boolean {
  return status === MaintenanceStatus.scheduled || status === MaintenanceStatus.in_progress;
}

export const MAINTENANCE_TYPE_LABEL: Record<MaintenanceType, string> = {
  scheduled: "Scheduled service",
  breakdown: "Breakdown",
  inspection: "Inspection",
  other: "Other",
};

export const MAINTENANCE_TYPE_OPTIONS = (Object.keys(MAINTENANCE_TYPE_LABEL) as MaintenanceType[]).map((value) => ({
  value,
  label: MAINTENANCE_TYPE_LABEL[value],
}));

/**
 * "Right now" — derived from the machine's rentals, never stored. Hidden
 * (null) when the stored status already says it (Under maintenance, Retired)
 * so the page never says the same thing twice.
 * on_rent = an active rental · off_rent ("Returning") = marked off rent ·
 * booked = a confirmed rental ahead · available = none of those.
 */
export function deploymentFor(machine: Machine, rentals: Rental[]): Deployment | null {
  if (machine.status !== MachineStatus.active) return null;
  const own = rentals.filter((r) => r.machineId === machine.id);
  if (own.some((r) => r.status === RentalStatus.active)) return "on_rent";
  if (own.some((r) => r.status === RentalStatus.off_rent)) return "off_rent";
  if (own.some((r) => r.status === RentalStatus.confirmed)) return "booked";
  return "available";
}

/**
 * The rental the machine is on now: active, else returning (off rent), else
 * the earliest confirmed one ahead ("Next rental").
 */
export function currentRentalFor(machineId: string, rentals: Rental[]): Rental | null {
  const own = rentals.filter((r) => r.machineId === machineId);
  return (
    own.find((r) => r.status === RentalStatus.active) ??
    own.find((r) => r.status === RentalStatus.off_rent) ??
    own.filter((r) => r.status === RentalStatus.confirmed).sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ??
    null
  );
}

/** Inclusive date-range overlap; null end = open-ended. */
export function rangesOverlap(aStart: string, aEnd: string | null, bStart: string, bEnd: string | null): boolean {
  const aEndValue = aEnd ?? "9999-12-31";
  const bEndValue = bEnd ?? "9999-12-31";
  return aStart <= bEndValue && bStart <= aEndValue;
}

/** First committing rental overlapping [start, end]. */
export function conflictingRental(rentals: Rental[], start: string, end: string | null): Rental | null {
  return (
    rentals
      .filter((r) => COMMITTING_RENTAL_STATUSES.includes(r.status))
      .filter((r) => rangesOverlap(r.startDate, r.endDate, start, end))
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null
  );
}

export function conflictingMaintenance(
  records: MaintenanceRecord[],
  start: string,
  end: string | null,
): MaintenanceRecord | null {
  return (
    records
      .filter((m) => blocksAvailability(m.status))
      .filter((m) => rangesOverlap(m.startDate, m.endDate, start, end))
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null
  );
}

export function productName(product: Product | null | undefined): string | null {
  return product ? `${product.manufacturer} ${product.name}` : null;
}

export function capacityLabel(product: Product | null | undefined): string | null {
  if (!product?.capacity) return null;
  return `${formatNumber(product.capacity, 2)} ${product.capacityUnit ?? ""}`.trim();
}

/** Resolves a machine's catalogue chain. */
export function catalogueFor(
  machine: Machine,
  productsById: Map<string, Product>,
  subcategoriesById: Map<string, ProductSubcategory>,
  categoriesById: Map<string, ProductCategory>,
) {
  const product = productsById.get(machine.productId) ?? null;
  const subcategory = product ? (subcategoriesById.get(product.productSubcategoryId) ?? null) : null;
  const category = subcategory ? (categoriesById.get(subcategory.productCategoryId) ?? null) : null;
  return { product, subcategory, category };
}

// ------------------------------------------------------------------ specifications

interface SpecField {
  key: string;
  label: string;
  unit?: string;
}

/** Only the groups that exist in productSpecificationsSchema; units only where the key carries one. */
const SPEC_GROUPS: Array<{ key: keyof ProductSpecifications; label: string; fields: SpecField[] }> = [
  {
    key: "boomFamily",
    label: "Boom",
    fields: [
      { key: "boomLengthM", label: "Boom length", unit: "m" },
      { key: "jibLengthM", label: "Jib length", unit: "m" },
      { key: "luffingLengthM", label: "Luffing length", unit: "m" },
    ],
  },
  {
    key: "craneRigging",
    label: "Crane rigging",
    fields: [
      { key: "wireRope", label: "Wire rope" },
      { key: "wireRopeDia", label: "Wire rope diameter" },
      { key: "auxiliaryWireRope", label: "Auxiliary wire rope" },
      { key: "auxiliaryWireRopeDia", label: "Auxiliary rope diameter" },
      { key: "counterWeight", label: "Counterweight" },
      { key: "superliftCounterWeight", label: "Superlift counterweight" },
      { key: "boomSection", label: "Boom sections" },
    ],
  },
  {
    key: "fluids",
    label: "Fluids",
    fields: [
      { key: "dieselTankCapacity", label: "Diesel tank capacity" },
      { key: "hydraulicOilTank", label: "Hydraulic oil tank" },
      { key: "hydraulicOilGrade", label: "Hydraulic oil grade" },
      { key: "engineOilCapacity", label: "Engine oil capacity" },
      { key: "engineOilGrade", label: "Engine oil grade" },
    ],
  },
  {
    key: "transport",
    label: "Transport dimensions",
    fields: [
      { key: "lengthMm", label: "Length", unit: "mm" },
      { key: "widthMm", label: "Width", unit: "mm" },
      { key: "heightMm", label: "Height", unit: "mm" },
      { key: "weightKg", label: "Weight", unit: "kg" },
    ],
  },
];

export interface SpecGroupView {
  key: string;
  label: string;
  items: Array<{ label: string; value: string }>;
}

/** Filled specification groups only — empty groups are not rendered. */
export function specGroups(specs: ProductSpecifications | null | undefined): SpecGroupView[] {
  if (!specs) return [];
  const groups: SpecGroupView[] = [];
  for (const group of SPEC_GROUPS) {
    const values = specs[group.key] as Record<string, unknown> | undefined;
    if (!values) continue;
    const items = group.fields
      .map((field) => {
        const raw = values[field.key];
        if (raw === undefined || raw === null || raw === "") return null;
        const value = typeof raw === "number" ? formatNumber(raw, 2) : String(raw);
        return { label: field.label, value: field.unit ? `${value} ${field.unit}` : value };
      })
      .filter((item): item is { label: string; value: string } => item !== null);
    if (items.length) groups.push({ key: group.key, label: group.label, items });
  }
  return groups;
}

/** Boom length for the model line ("36 m boom"), when the product has one. */
export function boomLength(product: Product | null | undefined): number | null {
  return product?.specifications?.boomFamily?.boomLengthM ?? null;
}
