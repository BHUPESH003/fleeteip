// Covers the date-sanity refines added directly to the Zod request schemas
// (packages/contracts) — these run only at the presentation/routes.ts
// boundary (see parseWithSchema), never inside the services, so they need
// their own schema-level tests rather than being exercised by the
// service-unit tests, which all call services directly and bypass Zod.
import { describe, expect, it } from "vitest";
import { createRequirementRequestSchema, updateRequirementRequestSchema } from "@fleetip/contracts/rfq";
import { createRentalRequestSchema } from "@fleetip/contracts/rental";
import { createProjectRequestSchema } from "@fleetip/contracts/project";
import { createMaintenanceRequestSchema } from "@fleetip/contracts/maintenance";
import { createInvoiceRequestSchema } from "@fleetip/contracts/billing";
import {
  createCommercialQuotationRequestSchema,
  createQuotationOfferRequestSchema,
} from "@fleetip/contracts/quotation";
import { updateTransportRequestSchema } from "@fleetip/contracts/transport";

function daysFromNow(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

describe("createRequirementRequestSchema date rules", () => {
  const base = {
    projectId: "11111111-1111-1111-1111-111111111111",
    productSubcategoryId: "22222222-2222-2222-2222-222222222222",
    requestedStartDate: daysFromNow(10),
    validityDate: daysFromNow(5),
  };

  it("accepts a future start date with an earlier validity date", () => {
    expect(createRequirementRequestSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a requestedStartDate in the past", () => {
    const result = createRequirementRequestSchema.safeParse({
      ...base,
      requestedStartDate: daysFromNow(-1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a validityDate in the past", () => {
    const result = createRequirementRequestSchema.safeParse({ ...base, validityDate: daysFromNow(-1) });
    expect(result.success).toBe(false);
  });

  it("rejects a validityDate after the requestedStartDate", () => {
    const result = createRequirementRequestSchema.safeParse({
      ...base,
      requestedStartDate: daysFromNow(5),
      validityDate: daysFromNow(10),
    });
    expect(result.success).toBe(false);
  });
});

describe("updateRequirementRequestSchema date rules", () => {
  it("rejects a requestedStartDate in the past", () => {
    expect(updateRequirementRequestSchema.safeParse({ requestedStartDate: daysFromNow(-1) }).success).toBe(
      false,
    );
  });

  it("rejects a validityDate in the past", () => {
    expect(updateRequirementRequestSchema.safeParse({ validityDate: daysFromNow(-1) }).success).toBe(false);
  });

  it("accepts a future requestedStartDate on its own", () => {
    expect(updateRequirementRequestSchema.safeParse({ requestedStartDate: daysFromNow(1) }).success).toBe(
      true,
    );
  });
});

describe("createRentalRequestSchema date rules", () => {
  const base = {
    machineId: "11111111-1111-1111-1111-111111111111",
    renterOrganizationId: "22222222-2222-2222-2222-222222222222",
    startDate: daysFromNow(5),
    rate: 6000,
    rateUnit: "day" as const,
  };

  it("accepts a future start date with no end date", () => {
    expect(createRentalRequestSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a startDate in the past", () => {
    expect(createRentalRequestSchema.safeParse({ ...base, startDate: daysFromNow(-1) }).success).toBe(
      false,
    );
  });

  it("rejects an endDate before the startDate", () => {
    expect(
      createRentalRequestSchema.safeParse({ ...base, endDate: daysFromNow(4) }).success,
    ).toBe(false);
  });
});

describe("createProjectRequestSchema date rules", () => {
  const base = {
    projectType: "Bridge",
    projectName: "Test Project",
    siteLocation: "Jaipur",
    startDate: daysFromNow(-30),
  };

  it("allows a startDate in the past (backfilling an already-underway project)", () => {
    expect(createProjectRequestSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an endDate before the startDate", () => {
    expect(
      createProjectRequestSchema.safeParse({ ...base, endDate: daysFromNow(-31) }).success,
    ).toBe(false);
  });
});

describe("createMaintenanceRequestSchema date rules", () => {
  const base = { machineId: "11111111-1111-1111-1111-111111111111", maintenanceType: "scheduled" as const };

  it("allows a fully past, already-completed maintenance window", () => {
    expect(
      createMaintenanceRequestSchema.safeParse({
        ...base,
        startDate: daysFromNow(-10),
        endDate: daysFromNow(-8),
      }).success,
    ).toBe(true);
  });

  it("rejects an endDate before the startDate", () => {
    expect(
      createMaintenanceRequestSchema.safeParse({
        ...base,
        startDate: daysFromNow(-8),
        endDate: daysFromNow(-10),
      }).success,
    ).toBe(false);
  });
});

describe("createInvoiceRequestSchema date rules", () => {
  const base = {
    rentalId: "11111111-1111-1111-1111-111111111111",
    billingPeriodStart: daysFromNow(-10),
    billingPeriodEnd: daysFromNow(-5),
    dueDate: daysFromNow(10),
    lineItems: [{ description: "Rental", quantity: 1, rate: 100 }],
  };

  it("allows a backdated billing period", () => {
    expect(createInvoiceRequestSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a billingPeriodEnd before billingPeriodStart", () => {
    expect(
      createInvoiceRequestSchema.safeParse({ ...base, billingPeriodEnd: daysFromNow(-11) }).success,
    ).toBe(false);
  });

  it("rejects a dueDate before the billing period ends", () => {
    expect(createInvoiceRequestSchema.safeParse({ ...base, dueDate: daysFromNow(-6) }).success).toBe(false);
  });
});

describe("createCommercialQuotationRequestSchema date rules", () => {
  const base = {
    renterOrganizationId: "22222222-2222-2222-2222-222222222222",
    machineId: "11111111-1111-1111-1111-111111111111",
    startDate: daysFromNow(10),
    rate: 6000,
    rateUnit: "day" as const,
    validityDate: daysFromNow(5),
  };

  it("accepts a future startDate with an earlier validityDate", () => {
    expect(createCommercialQuotationRequestSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a startDate in the past", () => {
    expect(
      createCommercialQuotationRequestSchema.safeParse({ ...base, startDate: daysFromNow(-1) }).success,
    ).toBe(false);
  });

  it("rejects a validityDate after the startDate", () => {
    expect(
      createCommercialQuotationRequestSchema.safeParse({ ...base, validityDate: daysFromNow(11) }).success,
    ).toBe(false);
  });
});

describe("createQuotationOfferRequestSchema date rules", () => {
  it("allows a startDate that has already lapsed (a stale, long-running negotiation)", () => {
    expect(
      createQuotationOfferRequestSchema.safeParse({
        rate: 6000,
        rateUnit: "day",
        startDate: daysFromNow(-5),
      }).success,
    ).toBe(true);
  });

  it("still rejects an endDate before the startDate", () => {
    expect(
      createQuotationOfferRequestSchema.safeParse({
        rate: 6000,
        rateUnit: "day",
        startDate: daysFromNow(5),
        endDate: daysFromNow(4),
      }).success,
    ).toBe(false);
  });
});

describe("updateTransportRequestSchema date rules", () => {
  it("allows an actualDate today or in the past", () => {
    expect(updateTransportRequestSchema.safeParse({ actualDate: daysFromNow(-1) }).success).toBe(true);
  });

  it("rejects an actualDate in the future", () => {
    expect(updateTransportRequestSchema.safeParse({ actualDate: daysFromNow(1) }).success).toBe(false);
  });
});
