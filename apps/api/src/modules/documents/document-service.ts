import type { ClientSnapshot } from "@fleetip/contracts/rental";
import type { ProductRepositoryPort } from "../catalogue/domain/ports.js";
import type { MachineRepositoryPort } from "../equipment/domain/ports.js";
import type { BillingService } from "../billing/application/billing-service.js";
import type { LogsheetService } from "../logsheet/application/logsheet-service.js";
import type { CommercialQuotationService } from "../marketplace/commercial-quotation/application/commercial-quotation-service.js";
import type { RentalService } from "../marketplace/rental/application/rental-service.js";
import type { WorkOrderRepositoryPort } from "../marketplace/work-order/domain/ports.js";
import type { WorkOrderService } from "../marketplace/work-order/application/work-order-service.js";
import type {
  OrganizationProfileRecord,
  OrganizationProfileRepositoryPort,
  OrganizationRepositoryPort,
} from "../organizations/domain/ports.js";
import { NotFoundError, ValidationError } from "../../shared/errors.js";
import type { Party, Signatory } from "../../shared/pdf/blocks.js";
import { renderPdf } from "../../shared/pdf/render.js";
import {
  buildInvoicePdf,
  buildQuotationPdf,
  buildTimesheetPdf,
  buildWorkOrderPdf,
} from "./documents.js";

export interface GeneratedDocument {
  filename: string;
  buffer: Buffer;
}

interface OrganizationDetails {
  party: Party;
  signatory: Signatory | null;
  profile: OrganizationProfileRecord | undefined;
}

const safeName = (value: string) => value.replace(/[^A-Za-z0-9._-]+/g, "_");

/**
 * Gathers what a document needs through the existing services (so each one's
 * own permission and party checks apply) plus the organizations' company
 * details, then renders the PDF. Layouts live in documents.ts.
 */
export class DocumentService {
  constructor(
    private readonly quotations: CommercialQuotationService,
    private readonly workOrders: WorkOrderService,
    private readonly workOrderRepository: WorkOrderRepositoryPort,
    private readonly rentals: RentalService,
    private readonly logsheets: LogsheetService,
    private readonly billing: BillingService,
    private readonly machineRepository: MachineRepositoryPort,
    private readonly productRepository: ProductRepositoryPort,
    private readonly organizations: OrganizationRepositoryPort & OrganizationProfileRepositoryPort,
  ) {}

  async quotationPdf(userId: string, organizationId: string, quotationId: string): Promise<GeneratedDocument> {
    const quotation = await this.quotations.getQuotation(userId, organizationId, quotationId);
    const [issuer, customer, scopeItems, equipment] = await Promise.all([
      this.organization(quotation.rentalCompanyOrganizationId),
      this.customer(quotation.renterOrganizationId, quotation.clientSnapshot),
      this.quotations.listScopeItems(userId, organizationId, quotationId),
      this.equipment(quotation.machineId, quotation.productId, quotation.machineAssetCode, quotation.productName),
    ]);
    const buffer = await renderPdf(
      buildQuotationPdf({ quotation, issuer: issuer.party, signatory: issuer.signatory, customer, equipment, scopeItems }),
    );
    return { filename: `Quotation_${safeName(quotation.referenceNumber)}.pdf`, buffer };
  }

  async workOrderPdf(userId: string, organizationId: string, workOrderId: string): Promise<GeneratedDocument> {
    const { workOrder, scopeItems } = await this.workOrders.getPrintableWorkOrder(userId, organizationId, workOrderId);
    const quotation = await this.quotations.getQuotation(userId, organizationId, workOrder.quotationId).catch(() => null);
    const [issuer, customer, equipment] = await Promise.all([
      this.organization(workOrder.rentalCompanyOrganizationId),
      this.customer(workOrder.renterOrganizationId, workOrder.clientSnapshot),
      this.equipment(workOrder.machineId, null, workOrder.machineAssetCode, workOrder.productName),
    ]);
    const buffer = await renderPdf(
      buildWorkOrderPdf({
        workOrder,
        scopeItems,
        issuer: issuer.party,
        signatory: issuer.signatory,
        customer,
        equipment,
        quotationReference: quotation?.referenceNumber ?? null,
      }),
    );
    return { filename: `WorkOrder_${safeName(workOrder.referenceNumber)}.pdf`, buffer };
  }

  async timesheetPdf(userId: string, organizationId: string, rentalId: string, month: string): Promise<GeneratedDocument> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ValidationError("month must be YYYY-MM");
    const rental = await this.rentals.getRental(userId, organizationId, rentalId);
    const all = await this.logsheets.listByRental(userId, organizationId, rentalId);
    const [issuer, customer, workOrder] = await Promise.all([
      this.organization(rental.rentalCompanyOrganizationId),
      this.customer(rental.renterOrganizationId, rental.clientSnapshot),
      this.workOrderRepository.findByRentalId(rentalId),
    ]);
    const machine = await this.machineRepository.findById(rental.machineId);
    const product = machine ? await this.productRepository.findById(machine.product_id) : undefined;
    const equipmentName = product ? `${product.manufacturer} ${product.name}` : null;
    const buffer = await renderPdf(
      buildTimesheetPdf({
        rental,
        month,
        logsheets: all.filter((l) => l.logDate.startsWith(month)),
        issuer: issuer.party,
        customer,
        equipmentName,
        customerWorkOrder: workOrder?.customer_work_order_number ?? null,
      }),
    );
    return { filename: `Timesheet_${safeName(rental.machineAssetCode ?? rentalId.slice(0, 8))}_${month}.pdf`, buffer };
  }

  async invoicePdf(userId: string, organizationId: string, invoiceId: string): Promise<GeneratedDocument> {
    const detail = await this.billing.getInvoiceDetail(userId, organizationId, invoiceId);
    const rental = await this.rentals.getRental(userId, organizationId, detail.invoice.rentalId);
    const [issuer, customer, workOrder] = await Promise.all([
      this.organization(detail.invoice.rentalCompanyOrganizationId),
      this.customer(rental.renterOrganizationId, rental.clientSnapshot),
      this.workOrderRepository.findByRentalId(detail.invoice.rentalId),
    ]);
    const profile = issuer.profile;
    const buffer = await renderPdf(
      buildInvoicePdf({
        detail,
        issuer: issuer.party,
        signatory: issuer.signatory,
        customer,
        bank: {
          name: profile?.bank_name ?? null,
          accountName: profile?.bank_account_name ?? null,
          accountNumber: profile?.bank_account_number ?? null,
          ifsc: profile?.bank_ifsc ?? null,
          branch: profile?.bank_branch ?? null,
        },
        customerWorkOrder: workOrder?.customer_work_order_number ?? null,
        workOrderReference: workOrder?.reference_number ?? null,
      }),
    );
    return { filename: `Invoice_${safeName(detail.invoice.invoiceNumber)}.pdf`, buffer };
  }

  // ---------------------------------------------------------------- helpers

  private async organization(organizationId: string): Promise<OrganizationDetails> {
    const [org, profile, contacts] = await Promise.all([
      this.organizations.findById(organizationId),
      this.organizations.findProfile(organizationId),
      this.organizations.listContacts(organizationId),
    ]);
    if (!org) throw new NotFoundError("Organization not found");
    const cityLine = [profile?.city, [profile?.state, profile?.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const contactLine = [
      ...contacts.slice(0, 2).map((c) => [c.name, c.phone].filter(Boolean).join(" ")),
      contacts.find((c) => c.email)?.email,
    ]
      .filter(Boolean)
      .join(" | ");
    const lead = contacts[0];
    return {
      profile,
      party: {
        name: org.name,
        addressLines: [profile?.address_line1 ?? "", profile?.address_line2 ?? "", cityLine, profile?.country ?? ""].filter(Boolean),
        gstin: profile?.gst_number,
        pan: profile?.pan_number,
        contactLine,
        website: profile?.website,
      },
      signatory: lead ? { name: lead.name, designation: lead.designation, phone: lead.phone } : null,
    };
  }

  private async customer(renterOrganizationId: string | null, snapshot: ClientSnapshot | null): Promise<Party> {
    if (renterOrganizationId) return (await this.organization(renterOrganizationId)).party;
    return {
      name: snapshot?.name ?? "Customer",
      contactLine: [snapshot?.contactPerson, snapshot?.phone, snapshot?.email].filter(Boolean).join(" | "),
    };
  }

  /** Machine and product details for the company; the party-resolved names already on the record otherwise. */
  private async equipment(
    machineId: string | null,
    productId: string | null,
    assetCode: string | null,
    productName: string | null,
  ) {
    const machine = machineId ? await this.machineRepository.findById(machineId) : undefined;
    const product = machine || productId ? await this.productRepository.findById(machine?.product_id ?? productId!) : undefined;
    return {
      name: product ? `${product.manufacturer} ${product.name}` : productName,
      assetCode: machine?.asset_code ?? assetCode,
      registration: machine?.registration_number ?? null,
      yearOfManufacture: machine?.year_of_manufacture ?? null,
    };
  }
}
