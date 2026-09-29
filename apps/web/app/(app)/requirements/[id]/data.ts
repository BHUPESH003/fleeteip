import type { Auction, AuctionSummary } from "@fleetip/contracts/auction";
import type { Product } from "@fleetip/contracts/catalogue";
import { MachineStatus, type Machine } from "@fleetip/contracts/equipment";
import type { NotificationListResponse } from "@fleetip/contracts/notification";
import type { Organization } from "@fleetip/contracts/organization";
import type { CommercialQuotation, QuotationResponse } from "@fleetip/contracts/quotation";
import type { Requirement } from "@fleetip/contracts/rfq";
import { apiClient } from "../../../../lib/api-client";
import { formatRelativeTime, todayIsoDate } from "../../../../lib/format";
import { optional } from "../../../../lib/use-load";
import { loadSubcategoryIndex, type SubcategoryEntry } from "../shared";
import type { ActivityItem } from "./parts";

export interface AuctionRow {
  auction: Auction;
  /** From listAuctionsForOrganization — participant count and needsAttention. */
  summary: AuctionSummary | null;
}

export interface RenterDetail {
  kind: "renter";
  requirement: Requirement;
  entry: SubcategoryEntry | null;
  /** Every rental company's reply — Renter-only (see RentalCompanyDetail). */
  responses: QuotationResponse[];
  /** null when the role can't resolve names (quotation.respond). */
  companyNames: Map<string, string> | null;
  /** Quotations received against this requirement; null without quotation.respond. */
  quotations: CommercialQuotation[] | null;
  /** null without auction.manage. */
  auctions: AuctionRow[] | null;
  activity: ActivityItem[];
  today: string;
}

/**
 * The Rental Company's view is deliberately isolated: its own reply and its
 * own quotations only. The Renter's responses table shows every competing
 * company's name and indicative rate — showing that to another Rental
 * Company would be a real cross-tenant leak, not just a missing feature.
 */
export interface RentalCompanyDetail {
  kind: "rental_company";
  requirement: Requirement;
  entry: SubcategoryEntry | null;
  myResponse: QuotationResponse | null;
  /** This company's own quotations against the requirement; null without quotation.manage. */
  myQuotations: CommercialQuotation[] | null;
  /** The requirement's non-cancelled auction, if any (auction.participate). */
  auction: Auction | null;
  /** Non-retired machines of this type in the fleet; null without equipment.manage. */
  machineCount: number | null;
  activity: ActivityItem[];
  today: string;
}

export type RequirementDetail = RenterDetail | RentalCompanyDetail;

export interface DetailAccess {
  quotationsRenter: boolean;
  auctionsRenter: boolean;
  quotationsCompany: boolean;
  auctionsCompany: boolean;
  machines: boolean;
}

function activityFor(notifications: NotificationListResponse | null, requirementId: string, types: string[]): ActivityItem[] {
  return (notifications?.notifications ?? [])
    .filter((n) => n.relatedResourceId === requirementId && n.relatedResourceType !== null && types.includes(n.relatedResourceType))
    .map((n) => ({ id: n.id, text: n.message, when: formatRelativeTime(n.createdAt) }));
}

export async function loadRenterDetail(organizationId: string, id: string, access: DetailAccess): Promise<RenterDetail> {
  // The Renter's own record (rfq.manage). A 404 here is the page's 404.
  const requirement = (await apiClient.getRequirement(organizationId, id)) as Requirement;
  const [index, responses, companies, quotations, auctions, summaries, notifications] = await Promise.all([
    loadSubcategoryIndex(),
    apiClient.listResponsesForRequirement(organizationId, id) as Promise<QuotationResponse[]>,
    // Counterparty names / linked quotations are enrichment, not the point
    // of this page (rfq.manage is) — a role without quotation.respond still
    // gets a working page, just without names or quotation links.
    optional(access.quotationsRenter, () => apiClient.listRentalCompanyOrganizations(organizationId) as Promise<Organization[]>, null as Organization[] | null),
    optional(access.quotationsRenter, () => apiClient.listQuotations(organizationId) as Promise<CommercialQuotation[]>, null as CommercialQuotation[] | null),
    optional(access.auctionsRenter, () => apiClient.listAuctionsForRequirement(organizationId, id) as Promise<Auction[]>, null as Auction[] | null),
    optional(access.auctionsRenter, () => apiClient.listAuctionsForOrganization(organizationId) as Promise<AuctionSummary[]>, [] as AuctionSummary[]),
    optional(true, () => apiClient.listNotifications(organizationId) as Promise<NotificationListResponse>, null as NotificationListResponse | null),
  ]);
  const summaryById = new Map(summaries.map((s) => [s.id, s]));
  return {
    kind: "renter",
    requirement,
    entry: index.get(requirement.productSubcategoryId) ?? null,
    responses,
    companyNames: companies ? new Map(companies.map((o) => [o.id, o.name])) : null,
    quotations: quotations ? quotations.filter((q) => q.requirementId === id) : null,
    auctions: auctions ? auctions.map((auction) => ({ auction, summary: summaryById.get(auction.id) ?? null })) : null,
    activity: activityFor(notifications, id, ["requirement"]),
    today: todayIsoDate(),
  };
}

export async function loadRentalCompanyDetail(organizationId: string, id: string, access: DetailAccess): Promise<RentalCompanyDetail> {
  // A Rental Company has no rfq.manage on the Renter's org — the Renter-
  // scoped getRequirement/listResponsesForRequirement 404/403 for them.
  // Discovery (rfq.respond) is the read path they hold, same one OpenMarket
  // and CreateQuotationDialog use for exactly this reason.
  const requirement = (await apiClient.getRequirementForDiscovery(organizationId, id)) as Requirement;
  const [index, myResponse, quotations, auction, machines, products, notifications] = await Promise.all([
    loadSubcategoryIndex(),
    // 404 = no response submitted yet.
    optional(true, () => apiClient.getMyResponse(organizationId, id) as Promise<QuotationResponse>, null as QuotationResponse | null),
    optional(access.quotationsCompany, () => apiClient.listQuotations(organizationId) as Promise<CommercialQuotation[]>, null as CommercialQuotation[] | null),
    optional(access.auctionsCompany, () => apiClient.getActiveAuctionForRequirement(organizationId, id) as Promise<Auction>, null as Auction | null),
    optional(access.machines, () => apiClient.listMachines(organizationId) as Promise<Machine[]>, null as Machine[] | null),
    optional(access.machines, () => apiClient.listProducts() as Promise<Product[]>, [] as Product[]),
    optional(true, () => apiClient.listNotifications(organizationId) as Promise<NotificationListResponse>, null as NotificationListResponse | null),
  ]);
  let machineCount: number | null = null;
  if (machines) {
    const inSubcategory = new Set(products.filter((p) => p.productSubcategoryId === requirement.productSubcategoryId).map((p) => p.id));
    machineCount = machines.filter((m) => m.status !== MachineStatus.retired && inSubcategory.has(m.productId)).length;
  }
  return {
    kind: "rental_company",
    requirement,
    entry: index.get(requirement.productSubcategoryId) ?? null,
    myResponse,
    // listQuotations returns only this company's own quotations — never another company's.
    myQuotations: quotations ? quotations.filter((q) => q.requirementId === id || (myResponse && q.quotationResponseId === myResponse.id)) : null,
    auction,
    machineCount,
    activity: activityFor(notifications, id, ["requirement", "quotation_request"]),
    today: todayIsoDate(),
  };
}
