import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { InvoiceDetail } from "@fleetip/contracts/billing";
import type { Logsheet } from "@fleetip/contracts/logsheet";
import type { CommercialQuotation } from "@fleetip/contracts/quotation";
import type { Rental } from "@fleetip/contracts/rental";
import type { WorkOrder } from "@fleetip/contracts/work-order";
import {
  buildInvoicePdf,
  buildQuotationPdf,
  buildTimesheetPdf,
  buildWorkOrderPdf,
} from "../src/modules/documents/documents.js";
import { amountInWords, formatDate, formatNumber } from "../src/shared/pdf/format.js";
import { renderPdf } from "../src/shared/pdf/render.js";

const ID = "11111111-1111-4111-8111-111111111111";
const terms = {
  startDate: "2026-09-15",
  endDate: "2027-03-14",
  rate: 450000,
  rateUnit: "month" as const,
  mobilizationCharge: 45000,
  demobilizationCharge: 45000,
  overtimeRate: 1500,
  paymentTerms: "One month advance on reaching site. Balance within 30 days of invoice.",
  shiftStructure: "1 shift x 10 h",
  sundayCondition: "Sundays are non-working",
  fuelNorms: "12 to 14 litres per hour",
  fuelScope: "client" as const,
  dehireTerms: "Minimum 30 days notice.",
  operatorScope: "with_operator" as const,
  accommodationScope: "client" as const,
  workingHours: 10,
  workingDaysPerWeek: 6,
  minimumRentalPeriodValue: 6,
  minimumRentalPeriodUnit: "month" as const,
  gstTerms: "GST 18% extra",
  noticePeriodDays: 30,
  commercialNotes: "Ground to be levelled.\nSteel plates by customer.",
  companyTerms: "Disputes subject to Pune jurisdiction.\nEquipment works to load chart only.",
};
const issuer = { name: "Landmark Infrastructure Solutions Pvt Ltd", addressLines: ["Sushant City, Kundli", "Sonipat, Haryana 131028"], gstin: "06AAECL3756H1ZG", pan: "AAECL3756H", contactLine: "Mr Rajkumar Sharma 9876543210" };
const customer = { name: "Ayoki Fabricon Private Limited", addressLines: ["Gate No 1, Mylavaram", "YSR Kadapa, Andhra Pradesh 516433"], gstin: "37AABCA5780F1ZP" };
const equipment = { name: "Putzmeister 36-4", assetCode: "AST-0001", registration: "NL01AE1081", yearOfManufacture: 2018 };
const signatory = { name: "Rajkumar Sharma", designation: "Director", phone: "9876543210" };

const quotation = {
  id: ID, rentalCompanyOrganizationId: ID, renterOrganizationId: null, clientSnapshot: null, requirementId: null,
  quotationResponseId: null, sourceAuctionId: null, referenceNumber: "QT-2026-0042", machineId: null, productId: ID,
  ...terms, validityDate: "2026-09-14", status: "sent", renterAcceptedAt: null, proposedAlternateStartDate: null,
  proposedAlternateEndDate: null, alternateDateStatus: null, alternateDateReason: null,
  createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z", machineAssetCode: null, productName: null,
} as unknown as CommercialQuotation;

const workOrder = {
  ...quotation, referenceNumber: "WO-2026-0007", quotationId: ID, rentalId: ID, status: "issued",
  customerWorkOrderNumber: "AFPL/2026-27/DWO18262", customerWorkOrderDate: "2026-09-14", projectCode: "C-1135-C",
  machineAssetCode: "AST-0001", productName: "Putzmeister 36-4",
} as unknown as WorkOrder;

const rental = {
  id: ID, machineId: ID, machineAssetCode: "AST-0001", rentalCompanyOrganizationId: ID, renterOrganizationId: null,
  clientSnapshot: null, projectName: "Dalmia Cement Kadappa", rate: 450000, rateUnit: "month", overtimeRate: 1500,
} as unknown as Rental;

const logsheets = ["2026-09-15", "2026-09-16", "2026-09-17"].map((logDate, i) => ({
  id: String(i), rentalId: ID, machineId: ID, logDate, shift: "Day", operatingHours: 9 + i, idleHours: 1, overtimeHours: i,
  operatorName: "R. Singh", fuelConsumed: 120 + i, fuelUnit: "L", remarks: i === 2 ? "Breakdown 2h" : null, customerConfirmed: i < 2,
  createdAt: "", updatedAt: "",
})) as unknown as Logsheet[];

const detail = {
  invoice: {
    id: ID, rentalCompanyOrganizationId: ID, rentalId: ID, invoiceNumber: "INV-2026-0011", billingPeriodStart: "2026-09-15",
    billingPeriodEnd: "2026-10-14", status: "issued", subtotal: 2745000, taxAmount: 494100, adjustmentAmount: 0,
    totalAmount: 3239100, dueDate: "2026-11-13", notes: "Thank you.",
  },
  lineItems: [
    { id: "a", invoiceId: ID, description: "Hiring of boom placer 36 m, 6 months", quantity: 6, rate: 450000, amount: 2700000 },
    { id: "b", invoiceId: ID, description: "Mobilization charges", quantity: 1, rate: 45000, amount: 45000 },
  ],
  payments: [{ id: "p", invoiceId: ID, amount: 450000, paidDate: "2026-09-20", method: "NEFT", reference: "UTR123" }],
  amountPaid: 450000,
  balanceDue: 2789100,
} as unknown as InvoiceDetail;

const bank = { name: "HDFC Bank", accountName: "Landmark Infrastructure", accountNumber: "50200012345678", ifsc: "HDFC0001234", branch: "Sonipat" };

const documents = {
  quotation: () => buildQuotationPdf({ quotation, issuer, signatory, customer, equipment, scopeItems: [
    { id: "1", quotationId: ID, item: "Diesel", responsibleParty: "client", notes: null, createdAt: "" },
    { id: "2", quotationId: ID, item: "Repair and maintenance", responsibleParty: "company", notes: "Incl. consumables", createdAt: "" },
  ] }),
  workOrder: () => buildWorkOrderPdf({ workOrder, scopeItems: [], issuer, signatory, customer, equipment, quotationReference: "QT-2026-0042" }),
  timesheet: () => buildTimesheetPdf({ rental, month: "2026-09", logsheets, issuer, customer, equipmentName: "Putzmeister 36-4", customerWorkOrder: "AFPL/2026-27/DWO18262" }),
  invoice: () => buildInvoicePdf({ detail, issuer, signatory, customer, bank, customerWorkOrder: "AFPL/2026-27/DWO18262", workOrderReference: "WO-2026-0007" }),
};

describe("document formatting", () => {
  it("writes amounts in words the Indian way", () => {
    expect(amountInWords(3239100)).toBe("Indian Rupees Thirty Two Lakh Thirty Nine Thousand One Hundred Only");
    expect(amountInWords(8260)).toBe("Indian Rupees Eight Thousand Two Hundred Sixty Only");
    expect(amountInWords(0)).toBe("Indian Rupees Zero Only");
    expect(amountInWords(1250.5)).toBe("Indian Rupees One Thousand Two Hundred Fifty and Fifty Paise Only");
    expect(amountInWords(25000000)).toBe("Indian Rupees Two Crore Fifty Lakh Only");
  });

  it("groups digits in lakhs and keeps date-only strings in their own day", () => {
    expect(formatNumber(1234567.5)).toBe("12,34,567.50");
    expect(formatDate("2026-09-14")).toBe("14-Sep-2026");
  });
});

describe("generated documents", () => {
  for (const [name, build] of Object.entries(documents)) {
    it(`renders the ${name} as a PDF`, async () => {
      const buffer = await renderPdf(build());
      expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
      // PDF_SAMPLE_DIR=/some/dir pnpm test documents  -> look at the layouts
      if (process.env.PDF_SAMPLE_DIR) {
        mkdirSync(process.env.PDF_SAMPLE_DIR, { recursive: true });
        writeFileSync(`${process.env.PDF_SAMPLE_DIR}/${name}.pdf`, buffer);
      }
    });
  }

  it("renders a timesheet for a month with no logsheets", async () => {
    const buffer = await renderPdf(buildTimesheetPdf({ rental, month: "2026-08", logsheets: [], issuer, customer, equipmentName: null, customerWorkOrder: null }));
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
