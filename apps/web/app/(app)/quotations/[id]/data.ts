import type { Product } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
import type { Organization } from "@fleetip/contracts/organization";
import { CommercialQuotationStatus, type CommercialQuotation, type QuotationOffer, type QuotationScopeItem } from "@fleetip/contracts/quotation";
import type { Requirement } from "@fleetip/contracts/rfq";
import type { WorkOrder } from "@fleetip/contracts/work-order";
import { apiClient } from "../../../../lib/api-client";
import { todayIsoDate } from "../../../../lib/format";
import { optional } from "../../../../lib/use-load";
import { equipmentLine, loadSubcategoryIndex } from "../../requirements/shared";

export type Viewer = "renter" | "rental_company";

export interface QuotationAccess {
  machines: boolean;
  workOrders: boolean;
  requirementAsRenter: boolean;
  requirementAsCompany: boolean;
}

export interface QuotationDetailData {
  quotation: CommercialQuotation;
  /** Append-only negotiation trail, oldest first. */
  offers: QuotationOffer[];
  /** null when the list didn't load. */
  scopeItems: QuotationScopeItem[] | null;
  /** Rental Company with equipment.manage only. */
  machine: Machine | null;
  product: Product | null;
  /** The other party's name; null when it couldn't be resolved. */
  counterpartyName: string | null;
  requirement: Requirement | null;
  requirementEquipment: string | null;
  /** Only once awarded (rental.manage / rental.respond). */
  workOrder: WorkOrder | null;
  viewer: Viewer;
  today: string;
}

export async function loadQuotation(organizationId: string, id: string, viewer: Viewer, access: QuotationAccess): Promise<QuotationDetailData> {
  // A draft is hidden from the Renter server-side (404), same as a
  // quotation between other organizations — that's the page's 404.
  const [quotation, offers] = await Promise.all([
    apiClient.getQuotation(organizationId, id) as Promise<CommercialQuotation>,
    apiClient.listOffers(organizationId, id) as Promise<QuotationOffer[]>,
  ]);
  const isCompany = viewer === "rental_company";
  const [scopeItems, machines, products, organizations, workOrder, requirement] = await Promise.all([
    optional(true, () => apiClient.listScopeItems(organizationId, id) as Promise<QuotationScopeItem[]>, null as QuotationScopeItem[] | null),
    // Machine lookup needs equipment.manage (Rental Company only). A Renter
    // gets machineAssetCode/productName resolved server-side on the quotation.
    optional(isCompany && access.machines, () => apiClient.listMachines(organizationId) as Promise<Machine[]>, [] as Machine[]),
    optional(isCompany && access.machines, () => apiClient.listProducts() as Promise<Product[]>, [] as Product[]),
    isCompany
      ? optional(true, () => apiClient.listRenterOrganizations(organizationId) as Promise<Organization[]>, [] as Organization[])
      : optional(true, () => apiClient.listRentalCompanyOrganizations(organizationId) as Promise<Organization[]>, [] as Organization[]),
    quotation.status === CommercialQuotationStatus.awarded
      ? optional(access.workOrders, async () => (await apiClient.getWorkOrderByQuotationId(organizationId, id)) ?? null, null as WorkOrder | null)
      : Promise.resolve(null),
    quotation.requirementId
      ? isCompany
        ? optional(access.requirementAsCompany, () => apiClient.getRequirementForDiscovery(organizationId, quotation.requirementId!) as Promise<Requirement>, null as Requirement | null)
        : optional(access.requirementAsRenter, () => apiClient.getRequirement(organizationId, quotation.requirementId!) as Promise<Requirement>, null as Requirement | null)
      : Promise.resolve(null),
  ]);
  const machine = machines.find((m) => m.id === quotation.machineId) ?? null;
  const product = machine ? (products.find((p) => p.id === machine.productId) ?? null) : null;
  const counterpartyId = isCompany ? quotation.renterOrganizationId : quotation.rentalCompanyOrganizationId;
  const counterpartyName = isCompany && quotation.clientSnapshot
    ? quotation.clientSnapshot.name
    : (organizations.find((o) => o.id === counterpartyId)?.name ?? null);
  let requirementEquipment: string | null = null;
  if (requirement) {
    const index = await loadSubcategoryIndex();
    requirementEquipment = equipmentLine(requirement, index.get(requirement.productSubcategoryId)?.subcategory.name);
  }
  return {
    quotation,
    offers,
    scopeItems,
    machine,
    product,
    counterpartyName,
    requirement,
    requirementEquipment,
    workOrder,
    viewer,
    today: todayIsoDate(),
  };
}
