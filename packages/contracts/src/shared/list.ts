import { z } from "zod";
import { isoDate } from "./dates.js";
import { invoiceStatusSchema } from "../billing/index.js";
import { machineStatusSchema } from "../equipment/index.js";
import { maintenanceStatusSchema, maintenanceTypeSchema } from "../maintenance/index.js";
import { commercialQuotationStatusSchema } from "../quotation/index.js";
import { rentalStatusSchema } from "../rental/index.js";
import { transportLegSchema, transportStatusSchema } from "../transport/index.js";

// Optional server-side paging for list endpoints (risk register §4.1,
// ticket l). A list endpoint called with none of these params returns the
// full array exactly as before; with any of them it returns a Page.

export const sortDirSchema = z.enum(["asc", "desc"]);
export type SortDir = z.infer<typeof sortDirSchema>;
export const SortDir = sortDirSchema.enum;

export const LIST_LIMIT_MAX = 200;
export const LIST_LIMIT_DEFAULT = 50;

export interface Page<T> {
  items: T[];
  // Opaque; pass back as `cursor` for the next page. null = last page.
  nextCursor: string | null;
}

export function pageSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

function listQuerySchema<const S extends readonly [string, ...string[]]>(
  sorts: S,
  defaultSort: S[number],
  defaultDir: SortDir = "desc",
) {
  return z.object({
    limit: z.coerce.number().int().min(1).max(LIST_LIMIT_MAX).default(LIST_LIMIT_DEFAULT),
    cursor: z.string().min(1).optional(),
    sort: z.enum(sorts).default(defaultSort as S[number] & string),
    dir: sortDirSchema.default(defaultDir),
  });
}

const q = z.string().trim().min(1).max(100).optional();
const id = z.string().uuid().optional();
const date = isoDate().optional();

export const machineListQuerySchema = listQuerySchema(["createdAt", "assetCode"], "createdAt").extend({
  status: machineStatusSchema.optional(),
  q, // asset code, registration or chassis number
});

export const rentalListQuerySchema = listQuerySchema(["createdAt", "startDate"], "createdAt").extend({
  status: rentalStatusSchema.optional(),
  machineId: id,
  // Rentals overlapping [from, to] (open-ended rentals run forever).
  from: date,
  to: date,
  q, // RN- reference, machine asset code or project name
});

export const invoiceListQuerySchema = listQuerySchema(["createdAt", "dueDate"], "createdAt").extend({
  // `overdue` also matches issued invoices past their due date (the list's `overdue` flag).
  status: invoiceStatusSchema.optional(),
  rentalId: id,
  from: date, // due date range
  to: date,
  q, // invoice number
});

export const maintenanceListQuerySchema = listQuerySchema(["startDate", "createdAt"], "startDate").extend({
  status: maintenanceStatusSchema.optional(),
  maintenanceType: maintenanceTypeSchema.optional(),
  machineId: id,
  from: date, // start date range
  to: date,
  q, // machine asset code or registration number
});

export const logsheetListQuerySchema = listQuerySchema(["logDate", "createdAt"], "logDate").extend({
  rentalId: id,
  machineId: id,
  from: date, // log date range
  to: date,
});

export const transportListQuerySchema = listQuerySchema(["createdAt"], "createdAt").extend({
  status: transportStatusSchema.optional(),
  leg: transportLegSchema.optional(),
  rentalId: id,
  from: date, // planned date range
  to: date,
  q, // RN- reference or machine asset code
});

export const quotationListQuerySchema = listQuerySchema(["createdAt", "validityDate"], "createdAt").extend({
  status: commercialQuotationStatusSchema.optional(),
  machineId: id,
  q, // reference number
});

export const requirementDiscoveryQuerySchema = listQuerySchema(
  ["createdAt", "requestedStartDate", "validityDate"],
  "createdAt",
).extend({
  productSubcategoryId: id,
  from: date, // requested start date range
  to: date,
  q, // project name or location
});

// Input types (every field optional) for callers building a query.
export type MachineListQuery = z.input<typeof machineListQuerySchema>;
export type RentalListQuery = z.input<typeof rentalListQuerySchema>;
export type InvoiceListQuery = z.input<typeof invoiceListQuerySchema>;
export type MaintenanceListQuery = z.input<typeof maintenanceListQuerySchema>;
export type LogsheetListQuery = z.input<typeof logsheetListQuerySchema>;
export type TransportListQuery = z.input<typeof transportListQuerySchema>;
export type QuotationListQuery = z.input<typeof quotationListQuerySchema>;
export type RequirementDiscoveryQuery = z.input<typeof requirementDiscoveryQuerySchema>;

// Parsed (defaults applied) forms, as the API sees them.
export type MachineListParams = z.output<typeof machineListQuerySchema>;
export type RentalListParams = z.output<typeof rentalListQuerySchema>;
export type InvoiceListParams = z.output<typeof invoiceListQuerySchema>;
export type MaintenanceListParams = z.output<typeof maintenanceListQuerySchema>;
export type LogsheetListParams = z.output<typeof logsheetListQuerySchema>;
export type TransportListParams = z.output<typeof transportListQuerySchema>;
export type QuotationListParams = z.output<typeof quotationListQuerySchema>;
export type RequirementDiscoveryParams = z.output<typeof requirementDiscoveryQuerySchema>;
