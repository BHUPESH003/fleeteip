import { describe, expect, it } from "vitest";
import type { OrganizationTypeCode } from "@fleetip/contracts/organization";
import type {
  ActiveMembershipRecord,
  MembershipRepositoryPort,
  OrganizationRepositoryPort,
} from "../src/modules/organizations/domain/ports.js";
import type { RoleRepositoryPort } from "../src/modules/permissions/domain/ports.js";
import { PermissionService } from "../src/modules/permissions/application/permission-service.js";
import type {
  RentalRecord,
  RentalRepositoryPort,
} from "../src/modules/marketplace/rental/domain/ports.js";
import type {
  CreateInvoiceInput,
  CreatePaymentInput,
  InvoiceLineItemRecord,
  InvoiceRecord,
  InvoiceRepositoryPort,
  PaymentRecord,
} from "../src/modules/billing/domain/ports.js";
import { BillingService } from "../src/modules/billing/application/billing-service.js";
import { NotificationService } from "../src/modules/notification/application/notification-service.js";
import type { NotificationRepositoryPort } from "../src/modules/notification/domain/ports.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../src/shared/errors.js";

const OWNER_ROLE_ID = "role-owner";
const RC_ORG_ID = "org-rental-company";
const OTHER_RC_ORG_ID = "org-other-rental-company";
const RENTER_ORG_ID = "org-renter";
const RENTAL_ID = "rental-1";

function fakePermissionService(rcOrgType: OrganizationTypeCode = "rental_company") {
  const membershipRepository: MembershipRepositoryPort = {
    findActiveMembership: async (): Promise<ActiveMembershipRecord | undefined> => ({
      id: "membership-1",
      status: "active",
      role_id: OWNER_ROLE_ID,
    }),
    create: async () => {
      throw new Error("not used in this test");
    },
    listWithOrganizationByUserId: async () => [],
    listByOrganization: async () => {
      throw new Error("not used in this test");
    },
  };
  const roleRepository: RoleRepositoryPort = {
    findByName: async (name) => ({ id: OWNER_ROLE_ID, name }),
    hasPermission: async (roleId) => roleId === OWNER_ROLE_ID,
    listPermissionCodesByRoleId: async (roleId) =>
      roleId === OWNER_ROLE_ID ? ["billing.manage", "billing.respond"] : [],
  };
  return new PermissionService(
    membershipRepository,
    roleRepository,
    fakeOrganizationTypeRepository({
      [RC_ORG_ID]: rcOrgType,
      [OTHER_RC_ORG_ID]: "rental_company",
      [RENTER_ORG_ID]: "renter",
    }),
  );
}

function fakeOrganizationTypeRepository(
  organizationTypes: Record<string, OrganizationTypeCode>,
): OrganizationRepositoryPort {
  return {
    findTypeByCode: async () => {
      throw new Error("not used in this test");
    },
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async () => {
      throw new Error("not used in this test");
    },
    findWithTypeById: async (id) => {
      const organizationTypeCode = organizationTypes[id];
      if (!organizationTypeCode) return undefined;
      return {
        id,
        organization_type_id: `type-${organizationTypeCode}`,
        organization_type_code: organizationTypeCode,
        name: "Test Org",
        code: "TESTORG",
        status: "active",
        created_at: new Date(),
      };
    },
    listAllForPlatformAdmin: async () => {
      throw new Error("not used in this test");
    },
    updateStatus: async () => {
      throw new Error("not used in this test");
    },
    codeExists: async () => {
      throw new Error("not used in this test");
    },
    listByType: async () => {
      throw new Error("not used in this test");
    },
  };
}

function rental(overrides: Partial<RentalRecord> = {}): RentalRecord {
  return {
    id: RENTAL_ID,
    rental_company_organization_id: RC_ORG_ID,
    renter_organization_id: RENTER_ORG_ID,
    client_snapshot: null,
    machine_id: "machine-1",
    status: "active",
    project_name: null,
    project_location: null,
    start_date: "2026-03-01",
    end_date: "2026-03-10",
    rate: 5000,
    rate_unit: "day",
    mobilization_charge: null,
    demobilization_charge: null,
    payment_terms: null,
    shift_structure: null,
    overtime_rate: null,
    sunday_condition: null,
    fuel_norms: null,
    operator_scope: null,
    notice_period_days: null,
    dehire_terms: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function fakeRentalRepository(rentals: RentalRecord[]): RentalRepositoryPort {
  return {
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async (id) => rentals.find((r) => r.id === id),
    listByOrganization: async () => {
      throw new Error("not used in this test");
    },
    listByRenterOrganization: async () => {
      throw new Error("not used in this test");
    },
    updateTerms: async () => {
      throw new Error("not used in this test");
    },
    updateStatus: async () => {
      throw new Error("not used in this test");
    },
    isAvailable: async () => {
      throw new Error("not used in this test");
    },
    searchByOrganization: async () => {
      throw new Error("not used in this test");
    },
    searchByRenterOrganization: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeInvoiceRepository(): InvoiceRepositoryPort {
  const invoices = new Map<string, InvoiceRecord>();
  const lineItems = new Map<string, InvoiceLineItemRecord[]>();
  const payments = new Map<string, PaymentRecord[]>();
  let nextId = 1;
  let sequence = 1;

  return {
    nextInvoiceNumber: async () => `INV-2026-${sequence++}`,
    create: async (input: CreateInvoiceInput) => {
      const id = `invoice-${nextId++}`;
      const record: InvoiceRecord = {
        id,
        rental_company_organization_id: input.rentalCompanyOrganizationId,
        rental_id: input.rentalId,
        invoice_number: input.invoiceNumber,
        billing_period_start: input.billingPeriodStart,
        billing_period_end: input.billingPeriodEnd,
        status: "draft",
        subtotal: input.subtotal,
        tax_amount: input.taxAmount,
        adjustment_amount: input.adjustmentAmount,
        total_amount: input.totalAmount,
        due_date: input.dueDate,
        notes: input.notes ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      invoices.set(id, record);
      lineItems.set(
        id,
        input.lineItems.map((item, index) => ({
          id: `line-${id}-${index}`,
          invoice_id: id,
          description: item.description,
          quantity: item.quantity,
          rate: item.rate,
          amount: item.amount,
          created_at: new Date(),
        })),
      );
      payments.set(id, []);
      return record;
    },
    findById: async (id) => invoices.get(id),
    listByRentalCompany: async (rentalCompanyOrganizationId) =>
      [...invoices.values()].filter(
        (i) => i.rental_company_organization_id === rentalCompanyOrganizationId,
      ),
    listByRenter: async () => {
      throw new Error("not used in this test");
    },
    listLineItems: async (invoiceId) => lineItems.get(invoiceId) ?? [],
    listPayments: async (invoiceId) => payments.get(invoiceId) ?? [],
    updateStatus: async (id, status) => {
      const existing = invoices.get(id);
      if (!existing) throw new Error("not used in this test");
      const updated = { ...existing, status, updated_at: new Date() };
      invoices.set(id, updated);
      return updated;
    },
    markOverdueIfDue: async (id) => {
      const existing = invoices.get(id);
      if (!existing) return undefined;
      const today = new Date().toISOString().slice(0, 10);
      if (existing.status === "issued" && existing.due_date < today) {
        const updated: InvoiceRecord = { ...existing, status: "overdue", updated_at: new Date() };
        invoices.set(id, updated);
        return updated;
      }
      return existing;
    },
    recordPayment: async (input: CreatePaymentInput) => {
      const invoice = invoices.get(input.invoiceId);
      if (!invoice) throw new Error("not used in this test");
      const payment: PaymentRecord = {
        id: `payment-${nextId++}`,
        invoice_id: input.invoiceId,
        amount: input.amount,
        paid_date: input.paidDate,
        method: input.method ?? null,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        created_at: new Date(),
      };
      const existingPayments = payments.get(input.invoiceId) ?? [];
      payments.set(input.invoiceId, [...existingPayments, payment]);

      const amountPaid = [...existingPayments, payment].reduce((sum, p) => sum + p.amount, 0);
      let updatedInvoice = invoice;
      if (amountPaid >= invoice.total_amount && invoice.status !== "paid") {
        updatedInvoice = { ...invoice, status: "paid", updated_at: new Date() };
        invoices.set(input.invoiceId, updatedInvoice);
      }
      return { payment, invoice: updatedInvoice };
    },
  };
}

// Every caller swallows notification failures (best-effort side effect), so
// a throwing fake is sufficient — this file isn't testing notification
// behavior itself.
function fakeNotificationService(): NotificationService {
  const throwingRepo: NotificationRepositoryPort = {
    create: async () => {
      throw new Error("not used in this test");
    },
    listByOrganization: async () => {
      throw new Error("not used in this test");
    },
    countUnread: async () => {
      throw new Error("not used in this test");
    },
    markRead: async () => {
      throw new Error("not used in this test");
    },
    markAllRead: async () => {
      throw new Error("not used in this test");
    },
  };
  return new NotificationService(throwingRepo, fakePermissionService());
}

function buildService(rentals: RentalRecord[] = [rental()]) {
  return new BillingService(
    fakeInvoiceRepository(),
    fakeRentalRepository(rentals),
    fakePermissionService(),
    fakeNotificationService(),
  );
}

// Due date must stay in the future relative to the real clock — markOverdueIfDue
// runs on every touch, so a stale narrative date (e.g. one already in the
// past) would flip the invoice to 'overdue' before a test ever gets to
// exercise 'issued' behavior. See the dedicated overdue test below instead.
const FAR_FUTURE_DUE_DATE = "2099-12-31";

const baseInput = {
  rentalId: RENTAL_ID,
  billingPeriodStart: "2026-03-01",
  billingPeriodEnd: "2026-03-10",
  dueDate: FAR_FUTURE_DUE_DATE,
  lineItems: [{ description: "Excavator rental, 10 days", quantity: 10, rate: 500 }],
};

describe("BillingService", () => {
  it("rejects billing management for a Renter organization", async () => {
    const service = new BillingService(
      fakeInvoiceRepository(),
      fakeRentalRepository([rental()]),
      fakePermissionService("renter"),
      fakeNotificationService(),
    );
    await expect(service.createInvoice("user-1", RC_ORG_ID, baseInput)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("rejects creating an invoice against a rental in a different organization", async () => {
    const service = buildService([rental({ rental_company_organization_id: OTHER_RC_ORG_ID })]);
    await expect(service.createInvoice("user-1", RC_ORG_ID, baseInput)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("computes subtotal/total correctly from line items, tax, and adjustment", async () => {
    const service = buildService();
    const invoice = await service.createInvoice("user-1", RC_ORG_ID, {
      ...baseInput,
      taxAmount: 500,
      adjustmentAmount: -200,
    });
    expect(invoice.subtotal).toBe(5000);
    expect(invoice.totalAmount).toBe(5300);
    expect(invoice.invoiceNumber).toMatch(/^INV-\d{4}-\d+$/);
    expect(invoice.status).toBe("draft");
  });

  it("rejects an illegal invoice status transition", async () => {
    const service = buildService();
    const invoice = await service.createInvoice("user-1", RC_ORG_ID, baseInput);
    await expect(
      service.updateInvoiceStatus("user-1", RC_ORG_ID, invoice.id, "issued"),
    ).resolves.toMatchObject({ status: "issued" });
    await expect(
      service.updateInvoiceStatus("user-1", RC_ORG_ID, invoice.id, "issued"),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects recording a payment against a draft invoice", async () => {
    const service = buildService();
    const invoice = await service.createInvoice("user-1", RC_ORG_ID, baseInput);
    await expect(
      service.recordPayment("user-1", RC_ORG_ID, invoice.id, {
        amount: 1000,
        paidDate: "2026-03-15",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("stays issued after a partial payment, flips to paid once fully covered", async () => {
    const service = buildService();
    const invoice = await service.createInvoice("user-1", RC_ORG_ID, baseInput);
    await service.updateInvoiceStatus("user-1", RC_ORG_ID, invoice.id, "issued");

    const afterPartial = await service.recordPayment("user-1", RC_ORG_ID, invoice.id, {
      amount: 2000,
      paidDate: "2026-03-15",
    });
    expect(afterPartial.status).toBe("issued");

    const afterFull = await service.recordPayment("user-1", RC_ORG_ID, invoice.id, {
      amount: 3000,
      paidDate: "2026-03-18",
    });
    expect(afterFull.status).toBe("paid");
  });

  it("hides an invoice from an organization that isn't a party to it", async () => {
    const service = buildService();
    const invoice = await service.createInvoice("user-1", RC_ORG_ID, baseInput);
    await expect(service.getInvoiceDetail("user-2", OTHER_RC_ORG_ID, invoice.id)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("lets the Renter party view invoice detail read-only", async () => {
    const service = buildService();
    const invoice = await service.createInvoice("user-1", RC_ORG_ID, baseInput);
    const detail = await service.getInvoiceDetail("user-2", RENTER_ORG_ID, invoice.id);
    expect(detail.invoice.id).toBe(invoice.id);
    expect(detail.balanceDue).toBe(invoice.totalAmount);
  });

  it("lazily marks an issued invoice overdue once its due date has passed", async () => {
    const service = buildService();
    const invoice = await service.createInvoice("user-1", RC_ORG_ID, {
      ...baseInput,
      dueDate: "2020-01-01",
    });
    await service.updateInvoiceStatus("user-1", RC_ORG_ID, invoice.id, "issued");
    const detail = await service.getInvoiceDetail("user-1", RC_ORG_ID, invoice.id);
    expect(detail.invoice.status).toBe("overdue");
  });
});
