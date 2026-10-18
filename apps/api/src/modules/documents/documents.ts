import type { InvoiceDetail } from "@fleetip/contracts/billing";
import type { Logsheet } from "@fleetip/contracts/logsheet";
import type { CommercialQuotation, QuotationScopeItem } from "@fleetip/contracts/quotation";
import type { Rental } from "@fleetip/contracts/rental";
import type { WorkOrder, WorkOrderScopeItem } from "@fleetip/contracts/work-order";
import type { TDocumentDefinitions } from "pdfmake/interfaces.js";
import {
  dataTable,
  document,
  heading,
  keyValueTable,
  letterhead,
  numberedList,
  parties,
  signatures,
  totalRow,
  type Party,
  type Signatory,
} from "../../shared/pdf/blocks.js";
import { amountInWords, formatDate, formatNumber, formatRupees } from "../../shared/pdf/format.js";

/**
 * Document layouts modelled on the real quotations, work orders, timesheets and
 * tax invoices in docs/quotation-work_orders/. Pure functions: data in,
 * pdfmake definition out — no I/O, so each is testable without a database.
 */

const SCOPE_PARTY = { company: "Rental company", client: "Customer" } as const;
const OPERATOR_LABEL = { with_operator: "With operator", without_operator: "Without operator (bare hire)" } as const;

const per = (unit: string) => (unit === "month" ? "per month" : unit === "day" ? "per day" : unit === "week" ? "per week" : "per shift");

/** Free text (special conditions, company T&Cs) split into one clause per non-empty line. */
const clauses = (text: string | null | undefined) => (text ?? "").split(/\r?\n/).map((l) => l.trim());

/** Terms shared by the quotation and the work order (a work order snapshots the quotation). */
interface TermsSource {
  startDate: string;
  endDate: string | null;
  rate: number;
  rateUnit: string;
  mobilizationCharge: number | null;
  demobilizationCharge: number | null;
  overtimeRate: number | null;
  paymentTerms: string | null;
  shiftStructure: string | null;
  sundayCondition: string | null;
  fuelNorms: string | null;
  fuelScope: "client" | "company" | null;
  dehireTerms: string | null;
  operatorScope: "with_operator" | "without_operator" | null;
  accommodationScope: "client" | "company" | null;
  workingHours: number | null;
  workingDaysPerWeek: number | null;
  minimumRentalPeriodValue: number | null;
  minimumRentalPeriodUnit: string | null;
  gstTerms: string | null;
  noticePeriodDays: number | null;
  commercialNotes: string | null;
  companyTerms: string | null;
}

function priceRows(t: TermsSource, equipment: string): (string | number)[][] {
  const rows: (string | number)[][] = [[1, `${equipment} - hire charges`, `${formatRupees(t.rate)} + GST ${per(t.rateUnit)}`]];
  if (t.mobilizationCharge !== null) rows.push([rows.length + 1, "Mobilization charges", `${formatRupees(t.mobilizationCharge)} + GST`]);
  if (t.demobilizationCharge !== null) rows.push([rows.length + 1, "Demobilization charges", `${formatRupees(t.demobilizationCharge)} + GST`]);
  if (t.overtimeRate !== null) rows.push([rows.length + 1, "Overtime", `${formatRupees(t.overtimeRate)} + GST per hour`]);
  return rows;
}

function termRows(t: TermsSource): [string, string | number | null][] {
  const minimum = t.minimumRentalPeriodValue ? `${t.minimumRentalPeriodValue} ${t.minimumRentalPeriodUnit ?? ""}(s)`.trim() : null;
  return [
    ["Hire period", `${formatDate(t.startDate)} to ${t.endDate ? formatDate(t.endDate) : "open-ended"}`],
    ["Minimum rental period", minimum],
    ["Working hours", t.workingHours ? `${t.workingHours} hours per shift` : null],
    ["Working days", t.workingDaysPerWeek ? `${t.workingDaysPerWeek} days per week` : null],
    ["Shift structure", t.shiftStructure],
    ["Sunday / holidays", t.sundayCondition],
    ["Operator", t.operatorScope ? OPERATOR_LABEL[t.operatorScope] : null],
    ["Fuel", t.fuelScope ? `${SCOPE_PARTY[t.fuelScope]} scope${t.fuelNorms ? ` - ${t.fuelNorms}` : ""}` : t.fuelNorms],
    ["Accommodation", t.accommodationScope ? `${SCOPE_PARTY[t.accommodationScope]} scope` : null],
    ["Payment terms", t.paymentTerms],
    ["Goods and services tax", t.gstTerms ?? "Extra, as applicable"],
    ["Notice period", t.noticePeriodDays !== null ? `${t.noticePeriodDays} days` : null],
    ["Dehire", t.dehireTerms],
  ];
}

function scopeTable(items: { item: string; responsibleParty: "client" | "company"; notes: string | null }[]) {
  return dataTable(
    [
      { header: "Sr", width: 24 },
      { header: "Item", width: "*" },
      { header: "Responsibility", width: 100 },
      { header: "Notes", width: 140 },
    ],
    items.map((s, i) => [i + 1, s.item, SCOPE_PARTY[s.responsibleParty], s.notes]),
  );
}

// ------------------------------------------------------------------ quotation

export interface QuotationDocument {
  quotation: CommercialQuotation;
  issuer: Party;
  signatory: Signatory | null;
  customer: Party;
  equipment: { name: string | null; assetCode: string | null; registration: string | null; yearOfManufacture: number | null };
  scopeItems: QuotationScopeItem[];
}

export function buildQuotationPdf(d: QuotationDocument): TDocumentDefinitions {
  const q = d.quotation;
  const equipmentName = d.equipment.name ?? "Equipment to be sourced";
  const equipmentLines = [
    d.equipment.assetCode ? `Asset code: ${d.equipment.assetCode}` : "To be sourced",
    d.equipment.registration ? `Registration: ${d.equipment.registration}` : "",
    d.equipment.yearOfManufacture ? `Year of manufacture: ${d.equipment.yearOfManufacture}` : "",
  ];
  return document(`Quotation ${q.referenceNumber}`, [
    letterhead(d.issuer, "QUOTATION", [
      ["Quotation No", q.referenceNumber],
      ["Date", formatDate(q.createdAt)],
      ["Valid until", formatDate(q.validityDate)],
    ]),
    parties({ label: "Quotation for", party: d.customer }, { label: "Equipment", party: { name: equipmentName, addressLines: equipmentLines } }),
    heading("Offer"),
    dataTable(
      [{ header: "Sr", width: 24 }, { header: "Description", width: "*" }, { header: "Offer", width: 190, align: "right" }],
      priceRows(q, equipmentName),
    ),
    heading("Commercial and operating terms"),
    keyValueTable(termRows(q)),
    ...(d.scopeItems.length ? [heading("Scope of supply"), scopeTable(d.scopeItems)] : []),
    ...(q.commercialNotes ? [heading("Special and site conditions"), numberedList(clauses(q.commercialNotes))] : []),
    ...(q.companyTerms ? [heading("Other terms and conditions"), numberedList(clauses(q.companyTerms))] : []),
    signatures(d.issuer.name, d.signatory, "Accepted by customer"),
  ]);
}

// ------------------------------------------------------------------ work order

export interface WorkOrderDocument {
  workOrder: WorkOrder;
  scopeItems: WorkOrderScopeItem[];
  issuer: Party;
  signatory: Signatory | null;
  customer: Party;
  equipment: { name: string | null; assetCode: string | null; registration: string | null; yearOfManufacture: number | null };
  quotationReference: string | null;
}

export function buildWorkOrderPdf(d: WorkOrderDocument): TDocumentDefinitions {
  const w = d.workOrder;
  const equipmentName = d.equipment.name ?? d.equipment.assetCode ?? "Equipment";
  const equipmentLines = [
    d.equipment.assetCode ? `Asset code: ${d.equipment.assetCode}` : "",
    d.equipment.registration ? `Registration: ${d.equipment.registration}` : "",
    d.equipment.yearOfManufacture ? `Year of manufacture: ${d.equipment.yearOfManufacture}` : "",
  ];
  return document(`Work order ${w.referenceNumber}`, [
    letterhead(d.issuer, "WORK ORDER", [
      ["Work Order No", w.referenceNumber],
      ["Date", formatDate(w.createdAt)],
      ["Status", w.status.toUpperCase()],
    ]),
    parties({ label: "Customer", party: d.customer }, { label: "Equipment", party: { name: equipmentName, addressLines: equipmentLines } }),
    keyValueTable([
      ["Customer work order / PO", w.customerWorkOrderNumber ? `${w.customerWorkOrderNumber}${w.customerWorkOrderDate ? ` dated ${formatDate(w.customerWorkOrderDate)}` : ""}` : null],
      ["Against quotation", d.quotationReference],
      ["Project", w.projectCode],
    ]),
    heading("1. Price schedule"),
    dataTable(
      [{ header: "Sl", width: 24 }, { header: "Description", width: "*" }, { header: "Rate", width: 190, align: "right" }],
      priceRows(w, equipmentName),
    ),
    heading("2. Terms"),
    keyValueTable(termRows(w)),
    ...(d.scopeItems.length ? [heading("3. Scope of work"), scopeTable(d.scopeItems)] : []),
    ...(w.commercialNotes ? [heading("Special and site conditions"), numberedList(clauses(w.commercialNotes))] : []),
    ...(w.companyTerms ? [heading("General terms and conditions"), numberedList(clauses(w.companyTerms))] : []),
    signatures(d.issuer.name, d.signatory, "Order accepted by customer"),
  ]);
}

// ------------------------------------------------------------------ timesheet

export interface TimesheetDocument {
  rental: Rental;
  /** "YYYY-MM" */
  month: string;
  logsheets: Logsheet[];
  issuer: Party;
  customer: Party;
  equipmentName: string | null;
  customerWorkOrder: string | null;
}

export function buildTimesheetPdf(d: TimesheetDocument): TDocumentDefinitions {
  const sorted = [...d.logsheets].sort((a, b) => a.logDate.localeCompare(b.logDate));
  const sum = (pick: (l: Logsheet) => number | null) => sorted.reduce((total, l) => total + (pick(l) ?? 0), 0);
  const fuelUnits = [...new Set(sorted.map((l) => l.fuelUnit).filter(Boolean))].join("/");
  const hours = (n: number | null) => (n === null ? "" : formatNumber(n, 1));
  const columns = [
    { header: "Date", width: 52 },
    { header: "Shift", width: 50 },
    { header: "Operator", width: "*" as const },
    { header: "Working hrs", width: 44, align: "right" as const },
    { header: "OT hrs", width: 34, align: "right" as const },
    { header: "Idle hrs", width: 36, align: "right" as const },
    { header: `Fuel${fuelUnits ? ` (${fuelUnits})` : ""}`, width: 40, align: "right" as const },
    { header: "Remarks", width: 74 },
    { header: "Confirmed", width: 56, align: "center" as const },
  ];
  const rows = sorted.map((l) => [
    formatDate(l.logDate),
    l.shift,
    l.operatorName,
    hours(l.operatingHours),
    hours(l.overtimeHours),
    hours(l.idleHours),
    l.fuelConsumed === null ? "" : formatNumber(l.fuelConsumed, 1),
    l.remarks,
    l.customerConfirmed ? "Yes" : "",
  ]);
  const [y, m] = d.month.split("-");
  const monthName = formatDate(`${y}-${m}-01`).slice(3);
  const totals = [
    { text: "Total", bold: true, colSpan: 3 }, {}, {},
    { text: hours(sum((l) => l.operatingHours)), bold: true, alignment: "right" as const },
    { text: hours(sum((l) => l.overtimeHours)), bold: true, alignment: "right" as const },
    { text: hours(sum((l) => l.idleHours)), bold: true, alignment: "right" as const },
    { text: formatNumber(sum((l) => l.fuelConsumed), 1), bold: true, alignment: "right" as const },
    { text: `${sorted.length} day(s) logged`, colSpan: 2 }, {},
  ];
  return document(`Timesheet ${monthName} - ${d.equipmentName ?? d.rental.machineAssetCode ?? ""}`, [
    letterhead(d.issuer, "MONTHLY TIMESHEET", [["Period", monthName], ["Customer WO / PO", d.customerWorkOrder]]),
    parties(
      { label: "Customer", party: d.customer },
      { label: "Equipment", party: { name: d.equipmentName ?? d.rental.machineAssetCode ?? "Equipment", addressLines: [d.rental.machineAssetCode ? `Asset code: ${d.rental.machineAssetCode}` : "", d.rental.projectName ? `Project: ${d.rental.projectName}` : ""] } },
    ),
    keyValueTable([
      ["Contract rate", `${formatRupees(d.rental.rate)} ${per(d.rental.rateUnit)}`],
      ["Overtime rate", d.rental.overtimeRate !== null ? `${formatRupees(d.rental.overtimeRate)} per hour` : null],
    ]),
    heading("Daily record"),
    sorted.length
      ? dataTable(columns, rows, [totals as never])
      : { text: "No logsheets were recorded for this month.", color: "#5a6573" },
    signatures(d.issuer.name, null, "Certified by customer site in-charge"),
  ]);
}

// ------------------------------------------------------------------ invoice

export interface InvoiceDocument {
  detail: InvoiceDetail;
  issuer: Party;
  signatory: Signatory | null;
  customer: Party;
  bank: { name: string | null; accountName: string | null; accountNumber: string | null; ifsc: string | null; branch: string | null };
  customerWorkOrder: string | null;
  workOrderReference: string | null;
}

export function buildInvoicePdf(d: InvoiceDocument): TDocumentDefinitions {
  const { invoice, lineItems, payments, amountPaid, balanceDue } = d.detail;
  const items = lineItems.map((l, i) => [i + 1, l.description, formatNumber(l.quantity, l.quantity % 1 === 0 ? 0 : 2), formatNumber(l.rate), formatNumber(l.amount)]);
  const cols = [
    { header: "Sr", width: 24 },
    { header: "Description", width: "*" as const },
    { header: "Qty", width: 50, align: "right" as const },
    { header: "Rate (Rs.)", width: 70, align: "right" as const },
    { header: "Amount (Rs.)", width: 80, align: "right" as const },
  ];
  const totals = [
    totalRow(5, "Sub total", formatNumber(invoice.subtotal)),
    totalRow(5, "Tax (GST)", formatNumber(invoice.taxAmount)),
    ...(invoice.adjustmentAmount !== 0 ? [totalRow(5, "Adjustment", formatNumber(invoice.adjustmentAmount))] : []),
    totalRow(5, "Invoice total", formatNumber(invoice.totalAmount), true),
  ];
  const bankRows: [string, string | null][] = [
    ["Bank", d.bank.name],
    ["Account name", d.bank.accountName],
    ["Account number", d.bank.accountNumber],
    ["IFSC", d.bank.ifsc],
    ["Branch", d.bank.branch],
  ];
  return document(`Invoice ${invoice.invoiceNumber}`, [
    letterhead(d.issuer, "TAX INVOICE", [
      ["Invoice No", invoice.invoiceNumber],
      ["Billing period", `${formatDate(invoice.billingPeriodStart)} to ${formatDate(invoice.billingPeriodEnd)}`],
      ["Due date", formatDate(invoice.dueDate)],
    ]),
    parties({ label: "Bill to", party: d.customer }, { label: "References", party: { name: d.workOrderReference ? `Work order ${d.workOrderReference}` : "FleetIP rental", addressLines: [d.customerWorkOrder ? `Customer WO / PO: ${d.customerWorkOrder}` : ""] } }),
    heading("Charges"),
    dataTable(cols, items, totals),
    { text: `Amount in words: ${amountInWords(invoice.totalAmount)}`, margin: [0, 6, 0, 0], bold: true },
    ...(payments.length
      ? [
          heading("Payments received"),
          dataTable(
            [{ header: "Date", width: 70 }, { header: "Method / reference", width: "*" }, { header: "Amount (Rs.)", width: 90, align: "right" }],
            payments.map((p) => [formatDate(p.paidDate), [p.method, p.reference].filter(Boolean).join(" / "), formatNumber(p.amount)]),
          ),
        ]
      : []),
    keyValueTable([["Amount paid", formatRupees(amountPaid)], ["Balance due", formatRupees(balanceDue)]]),
    ...(bankRows.some(([, v]) => v) ? [heading("Pay by NEFT / RTGS to"), keyValueTable(bankRows)] : []),
    ...(invoice.notes ? [heading("Notes"), { text: invoice.notes }] : []),
    signatures(d.issuer.name, d.signatory, "Received by"),
  ]);
}
