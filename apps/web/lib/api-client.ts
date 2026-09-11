import type {
  Auction,
  AuctionDetail,
  AuctionParticipant,
  BiddingDirection,
} from "@fleetip/contracts/auction";
import type { CreateInvoiceRequest, Invoice, InvoiceDetail } from "@fleetip/contracts/billing";
import type { Product, ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import type { Machine, MachineStatus } from "@fleetip/contracts/equipment";
import type { Logsheet, MachineUtilization, RentalUtilization } from "@fleetip/contracts/logsheet";
import type { Organization } from "@fleetip/contracts/organization";
import type {
  CreateMaintenanceRequest,
  MaintenanceRecord,
  MaintenanceStatus,
} from "@fleetip/contracts/maintenance";
import type { NotificationListResponse } from "@fleetip/contracts/notification";
import type {
  CommercialQuotation,
  CreateCommercialQuotationRequest,
  CreateQuotationOfferRequest,
  QuotationOffer,
  QuotationResponse,
  SubmitQuotationResponseRequest,
  UpdateCommercialQuotationTermsRequest,
} from "@fleetip/contracts/quotation";
import type {
  CreateRentalRequest,
  Rental,
  RentalStatus,
  UpdateRentalTermsRequest,
} from "@fleetip/contracts/rental";
import type { CreateRequirementRequest, Requirement } from "@fleetip/contracts/rfq";
import type {
  CreateTransportRequest,
  TransportLeg,
  TransportRecord,
} from "@fleetip/contracts/transport";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T | undefined> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    // Only claim a JSON content-type when there's actually a body — sending
    // it on a bodiless request (e.g. logout) makes Fastify's JSON parser
    // reject the empty body outright.
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) return undefined;

  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new ApiError(
      body?.error?.message ?? `Request failed with status ${response.status}`,
      response.status,
    );
  }
  return body as T;
}

export interface SignupInput {
  email: string;
  password: string;
  displayName: string;
  organizationName: string;
  organizationTypeCode: "rental_company" | "renter";
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface CreateMachineInput {
  productId: string;
  assetCode: string;
  chassisNumber?: string;
  registrationNumber: string;
  yearOfManufacture?: number;
}

export const apiClient = {
  signup: (input: SignupInput) =>
    apiRequest("/auth/signup", { method: "POST", body: JSON.stringify(input) }),
  login: (input: LoginInput) =>
    apiRequest("/auth/login", { method: "POST", body: JSON.stringify(input) }),
  logout: () => apiRequest("/auth/logout", { method: "POST" }),
  me: () => apiRequest("/auth/me", { method: "GET" }),

  listProductCategories: () =>
    apiRequest<ProductCategory[]>("/product-categories", { method: "GET" }),
  listProductSubcategories: (categoryId: string) =>
    apiRequest<ProductSubcategory[]>(`/product-categories/${categoryId}/subcategories`, {
      method: "GET",
    }),
  listProducts: (subcategoryId?: string) =>
    apiRequest<Product[]>(`/products${subcategoryId ? `?subcategoryId=${subcategoryId}` : ""}`, {
      method: "GET",
    }),
  listMachines: (organizationId: string) =>
    apiRequest<Machine[]>(`/organizations/${organizationId}/machines`, { method: "GET" }),
  createMachine: (organizationId: string, input: CreateMachineInput) =>
    apiRequest<Machine>(`/organizations/${organizationId}/machines`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateMachineStatus: (organizationId: string, machineId: string, status: MachineStatus) =>
    apiRequest<Machine>(`/organizations/${organizationId}/machines/${machineId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  listRentals: (organizationId: string) =>
    apiRequest<Rental[]>(`/organizations/${organizationId}/rentals`, { method: "GET" }),
  createRental: (organizationId: string, input: CreateRentalRequest) =>
    apiRequest<Rental>(`/organizations/${organizationId}/rentals`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getRental: (organizationId: string, rentalId: string) =>
    apiRequest<Rental>(`/organizations/${organizationId}/rentals/${rentalId}`, { method: "GET" }),
  updateRentalTerms: (
    organizationId: string,
    rentalId: string,
    updates: UpdateRentalTermsRequest,
  ) =>
    apiRequest<Rental>(`/organizations/${organizationId}/rentals/${rentalId}/terms`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),
  updateRentalStatus: (organizationId: string, rentalId: string, status: RentalStatus) =>
    apiRequest<Rental>(`/organizations/${organizationId}/rentals/${rentalId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  checkRentalAvailability: (
    organizationId: string,
    machineId: string,
    startDate: string,
    endDate?: string,
  ) =>
    apiRequest<{ available: boolean }>(
      `/organizations/${organizationId}/rentals/availability?${new URLSearchParams({
        machineId,
        startDate,
        ...(endDate ? { endDate } : {}),
      }).toString()}`,
      { method: "GET" },
    ),

  // --- RFQ (Requirement) ---
  listRequirements: (organizationId: string) =>
    apiRequest<Requirement[]>(`/organizations/${organizationId}/requirements`, { method: "GET" }),
  createRequirement: (organizationId: string, input: CreateRequirementRequest) =>
    apiRequest<Requirement>(`/organizations/${organizationId}/requirements`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateRequirementStatus: (
    organizationId: string,
    requirementId: string,
    status: "closed" | "cancelled",
  ) =>
    apiRequest<Requirement>(
      `/organizations/${organizationId}/requirements/${requirementId}/status`,
      { method: "PATCH", body: JSON.stringify({ status }) },
    ),
  discoverRequirements: (organizationId: string) =>
    apiRequest<Requirement[]>(`/organizations/${organizationId}/requirement-discovery`, {
      method: "GET",
    }),
  getRequirementForDiscovery: (organizationId: string, requirementId: string) =>
    apiRequest<Requirement>(
      `/organizations/${organizationId}/requirement-discovery/${requirementId}`,
      { method: "GET" },
    ),

  // --- QuotationResponse ---
  listResponsesForRequirement: (organizationId: string, requirementId: string) =>
    apiRequest<QuotationResponse[]>(
      `/organizations/${organizationId}/requirements/${requirementId}/responses`,
      { method: "GET" },
    ),
  getMyResponse: (organizationId: string, requirementId: string) =>
    apiRequest<QuotationResponse>(
      `/organizations/${organizationId}/requirements/${requirementId}/response`,
      { method: "GET" },
    ),
  submitResponse: (
    organizationId: string,
    requirementId: string,
    input: SubmitQuotationResponseRequest,
  ) =>
    apiRequest<QuotationResponse>(
      `/organizations/${organizationId}/requirements/${requirementId}/response`,
      { method: "PUT", body: JSON.stringify(input) },
    ),

  // --- CommercialQuotation + Negotiation ---
  listRenterOrganizations: (organizationId: string) =>
    apiRequest<Organization[]>(`/organizations/${organizationId}/renter-organizations`, {
      method: "GET",
    }),
  listRentalCompanyOrganizations: (organizationId: string) =>
    apiRequest<Organization[]>(`/organizations/${organizationId}/rental-company-organizations`, {
      method: "GET",
    }),
  listQuotations: (organizationId: string) =>
    apiRequest<CommercialQuotation[]>(`/organizations/${organizationId}/quotations`, {
      method: "GET",
    }),
  getQuotation: (organizationId: string, quotationId: string) =>
    apiRequest<CommercialQuotation>(`/organizations/${organizationId}/quotations/${quotationId}`, {
      method: "GET",
    }),
  createQuotation: (organizationId: string, input: CreateCommercialQuotationRequest) =>
    apiRequest<CommercialQuotation>(`/organizations/${organizationId}/quotations`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateQuotationTerms: (
    organizationId: string,
    quotationId: string,
    updates: UpdateCommercialQuotationTermsRequest,
  ) =>
    apiRequest<CommercialQuotation>(
      `/organizations/${organizationId}/quotations/${quotationId}/terms`,
      { method: "PATCH", body: JSON.stringify(updates) },
    ),
  sendQuotation: (organizationId: string, quotationId: string) =>
    apiRequest<CommercialQuotation>(
      `/organizations/${organizationId}/quotations/${quotationId}/send`,
      { method: "POST" },
    ),
  withdrawQuotation: (organizationId: string, quotationId: string) =>
    apiRequest<CommercialQuotation>(
      `/organizations/${organizationId}/quotations/${quotationId}/withdraw`,
      { method: "POST" },
    ),
  acceptQuotation: (organizationId: string, quotationId: string) =>
    apiRequest<CommercialQuotation>(
      `/organizations/${organizationId}/quotations/${quotationId}/accept`,
      { method: "POST" },
    ),
  rejectQuotation: (organizationId: string, quotationId: string) =>
    apiRequest<CommercialQuotation>(
      `/organizations/${organizationId}/quotations/${quotationId}/reject`,
      { method: "POST" },
    ),
  awardQuotation: (organizationId: string, quotationId: string) =>
    apiRequest<CommercialQuotation>(
      `/organizations/${organizationId}/quotations/${quotationId}/award`,
      { method: "POST" },
    ),
  listOffers: (organizationId: string, quotationId: string) =>
    apiRequest<QuotationOffer[]>(
      `/organizations/${organizationId}/quotations/${quotationId}/offers`,
      { method: "GET" },
    ),
  makeOffer: (organizationId: string, quotationId: string, input: CreateQuotationOfferRequest) =>
    apiRequest<QuotationOffer>(
      `/organizations/${organizationId}/quotations/${quotationId}/offers`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  acceptOffer: (organizationId: string, quotationId: string, offerId: string) =>
    apiRequest<CommercialQuotation>(
      `/organizations/${organizationId}/quotations/${quotationId}/offers/${offerId}/accept`,
      { method: "POST" },
    ),

  // --- Auction ---
  listAuctionsForRequirement: (organizationId: string, requirementId: string) =>
    apiRequest<Auction[]>(
      `/organizations/${organizationId}/requirements/${requirementId}/auctions`,
      { method: "GET" },
    ),
  createAuction: (
    organizationId: string,
    requirementId: string,
    input: {
      biddingDirection: BiddingDirection;
      basePrice: number;
      maxBidsPerParticipant?: number;
      startsAt: string;
      endsAt: string;
    },
  ) =>
    apiRequest<Auction>(`/organizations/${organizationId}/requirements/${requirementId}/auctions`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getActiveAuctionForRequirement: (organizationId: string, requirementId: string) =>
    apiRequest<Auction>(
      `/organizations/${organizationId}/requirement-discovery/${requirementId}/auction`,
      { method: "GET" },
    ),
  getAuctionDetail: (organizationId: string, auctionId: string) =>
    apiRequest<AuctionDetail>(`/organizations/${organizationId}/auctions/${auctionId}`, {
      method: "GET",
    }),
  requestToJoinAuction: (organizationId: string, auctionId: string) =>
    apiRequest<AuctionParticipant>(
      `/organizations/${organizationId}/auctions/${auctionId}/participants`,
      { method: "POST" },
    ),
  reviewParticipant: (
    organizationId: string,
    auctionId: string,
    participantId: string,
    status: "approved" | "rejected",
  ) =>
    apiRequest<AuctionParticipant>(
      `/organizations/${organizationId}/auctions/${auctionId}/participants/${participantId}`,
      { method: "PATCH", body: JSON.stringify({ status }) },
    ),
  selectParticipant: (organizationId: string, auctionId: string, participantId: string) =>
    apiRequest<AuctionParticipant>(
      `/organizations/${organizationId}/auctions/${auctionId}/participants/${participantId}/select`,
      { method: "POST" },
    ),
  placeBid: (organizationId: string, auctionId: string, amount: number) =>
    apiRequest(`/organizations/${organizationId}/auctions/${auctionId}/bids`, {
      method: "POST",
      body: JSON.stringify({ amount }),
    }),
  closeAuctionEarly: (organizationId: string, auctionId: string) =>
    apiRequest<Auction>(`/organizations/${organizationId}/auctions/${auctionId}/close`, {
      method: "POST",
    }),
  cancelAuction: (organizationId: string, auctionId: string) =>
    apiRequest<Auction>(`/organizations/${organizationId}/auctions/${auctionId}/cancel`, {
      method: "POST",
    }),

  // --- Maintenance ---
  listMaintenanceForMachine: (organizationId: string, machineId: string) =>
    apiRequest<MaintenanceRecord[]>(
      `/organizations/${organizationId}/machines/${machineId}/maintenance-records`,
      { method: "GET" },
    ),
  createMaintenance: (organizationId: string, input: CreateMaintenanceRequest) =>
    apiRequest<MaintenanceRecord>(`/organizations/${organizationId}/maintenance-records`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateMaintenanceStatus: (
    organizationId: string,
    maintenanceId: string,
    status: MaintenanceStatus,
  ) =>
    apiRequest<MaintenanceRecord>(
      `/organizations/${organizationId}/maintenance-records/${maintenanceId}/status`,
      { method: "PATCH", body: JSON.stringify({ status }) },
    ),

  // --- Transport ---
  listTransportForRental: (organizationId: string, rentalId: string) =>
    apiRequest<TransportRecord[]>(
      `/organizations/${organizationId}/rentals/${rentalId}/transport`,
      {
        method: "GET",
      },
    ),
  createTransport: (organizationId: string, rentalId: string, input: CreateTransportRequest) =>
    apiRequest<TransportRecord>(`/organizations/${organizationId}/rentals/${rentalId}/transport`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateTransport: (
    organizationId: string,
    rentalId: string,
    leg: TransportLeg,
    updates: { status?: TransportRecord["status"]; actualDate?: string },
  ) =>
    apiRequest<TransportRecord>(
      `/organizations/${organizationId}/rentals/${rentalId}/transport/${leg}`,
      { method: "PATCH", body: JSON.stringify(updates) },
    ),

  // --- Logsheets + Utilization ---
  listLogsheetsForRental: (organizationId: string, rentalId: string) =>
    apiRequest<Logsheet[]>(`/organizations/${organizationId}/rentals/${rentalId}/logsheets`, {
      method: "GET",
    }),
  submitLogsheet: (
    organizationId: string,
    rentalId: string,
    input: { logDate: string; operatingHours?: number; idleHours?: number; overtimeHours?: number },
  ) =>
    apiRequest<Logsheet>(`/organizations/${organizationId}/rentals/${rentalId}/logsheets`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  getRentalUtilization: (organizationId: string, rentalId: string) =>
    apiRequest<RentalUtilization>(
      `/organizations/${organizationId}/rentals/${rentalId}/utilization`,
      { method: "GET" },
    ),
  getMachineUtilization: (organizationId: string, machineId: string) =>
    apiRequest<MachineUtilization>(
      `/organizations/${organizationId}/machines/${machineId}/utilization`,
      { method: "GET" },
    ),

  // --- Billing ---
  listInvoices: (organizationId: string) =>
    apiRequest<Invoice[]>(`/organizations/${organizationId}/invoices`, { method: "GET" }),
  getInvoiceDetail: (organizationId: string, invoiceId: string) =>
    apiRequest<InvoiceDetail>(`/organizations/${organizationId}/invoices/${invoiceId}`, {
      method: "GET",
    }),
  createInvoice: (organizationId: string, input: CreateInvoiceRequest) =>
    apiRequest<Invoice>(`/organizations/${organizationId}/invoices`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateInvoiceStatus: (
    organizationId: string,
    invoiceId: string,
    status: "issued" | "cancelled",
  ) =>
    apiRequest<Invoice>(`/organizations/${organizationId}/invoices/${invoiceId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  recordPayment: (
    organizationId: string,
    invoiceId: string,
    input: { amount: number; paidDate: string; method?: string; reference?: string },
  ) =>
    apiRequest<Invoice>(`/organizations/${organizationId}/invoices/${invoiceId}/payments`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // --- Notifications ---
  listNotifications: (organizationId: string) =>
    apiRequest<NotificationListResponse>(`/organizations/${organizationId}/notifications`, {
      method: "GET",
    }),
  markNotificationRead: (organizationId: string, notificationId: string) =>
    apiRequest(`/organizations/${organizationId}/notifications/${notificationId}/read`, {
      method: "POST",
    }),
  markAllNotificationsRead: (organizationId: string) =>
    apiRequest(`/organizations/${organizationId}/notifications/read-all`, { method: "POST" }),
};
