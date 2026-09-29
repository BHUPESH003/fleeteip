import type { ChangePasswordRequest, SessionListResponse } from "@fleetip/contracts/identity";
import type {
  Auction,
  AuctionDetail,
  AuctionEvent,
  AuctionParticipant,
  AuctionSummary,
  BiddingDirection,
} from "@fleetip/contracts/auction";
import type {
  CreateInvoiceRequest,
  Invoice,
  InvoiceDetail,
  RecordPaymentRequest, InvoiceListItem } from "@fleetip/contracts/billing";
import type {
  CreateProductCategoryRequest,
  CreateProductRequest,
  CreateProductSubcategoryRequest,
  Product,
  ProductCategory,
  ProductSubcategory,
  UpdateProductCategoryRequest,
  UpdateProductRequest,
  UpdateProductSubcategoryRequest,
} from "@fleetip/contracts/catalogue";
import type { Machine, MachineStatus, UpdateMachineRequest } from "@fleetip/contracts/equipment";
import type {
  Logsheet,
  MachineUtilization,
  RentalUtilization,
  SubmitLogsheetRequest,
} from "@fleetip/contracts/logsheet";
import type {
  AcceptInviteRequest,
  CreateInviteResponse,
  CreateRoleRequest,
  InvitePreview,
  Organization,
  OrganizationInvite,
  OrganizationMember,
  RoleName,
  RoleWithPermissions,
  UpdateOrganizationRequest,
  UpdateRoleRequest,
} from "@fleetip/contracts/organization";
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
  CreateQuotationScopeItemRequest,
  ProposeAlternateDatesRequest,
  QuotationOffer,
  QuotationScopeItem,
  QuotationResponse,
  SubmitQuotationResponseRequest,
  UpdateCommercialQuotationTermsRequest,
} from "@fleetip/contracts/quotation";
import type {
  AvailabilityConflict,
  CheckMachinesAvailabilityRequest,
  MachineAvailability,
  MachinesAvailabilityResponse,
  CreateRentalRequest,
  CorrectActualDatesRequest,
  DisputeActualDatesRequest,
  ProposeRentalDateChangeRequest,
  Rental,
  RentalEvent,
  RentalStatus,
  UpdateRentalTermsRequest,
} from "@fleetip/contracts/rental";
import type {
  CreateRequirementRequest,
  Requirement,
  UpdateRequirementRequest,
} from "@fleetip/contracts/rfq";
import type {
  CreateProjectRequest,
  Project,
  UpdateProjectRequest,
} from "@fleetip/contracts/project";
import type { WorkOrder, WorkOrderScopeItem, WorkOrderStatus } from "@fleetip/contracts/work-order";
import type {
  InvoiceListQuery,
  LogsheetListQuery,
  MachineListQuery,
  MaintenanceListQuery,
  Page,
  QuotationListQuery,
  RentalListQuery,
  RequirementDiscoveryQuery,
  TransportListQuery,
} from "@fleetip/contracts/list";
import type { SearchResult } from "@fleetip/contracts/search";
import type {
  CreateTransportRequest,
  TransportLeg,
  TransportRecord,
  UpdateTransportRequest,
} from "@fleetip/contracts/transport";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Every failed call throws an ApiError. The API answers errors as
 * `{error:{code,message}}` (apps/api/src/app.ts); a request that never
 * reached the server (offline, API down) has status 0 and code "network".
 * Screens never show `message` raw — see lib/errors.ts.
 */
/** One rejected request field, as the API reports it (400). `path` is dotted, empty for the whole request. */
export interface ApiIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string = "unknown",
    /** 400 only: every rejected field. */
    public readonly issues: ApiIssue[] = [],
    /** 409 only, when the conflict is about one field (e.g. "assetCode"). */
    public readonly field?: string,
    /** 409 only: the rental or workshop job that blocked the write. */
    public readonly conflict?: AvailabilityConflict,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
}

function errorFromBody(body: unknown, status: number): ApiError {
  if (typeof body === "object" && body !== null) {
    const directMessage = (body as { message?: unknown }).message;
    if (typeof directMessage === "string") return new ApiError(directMessage, status);

    const nested = (body as { error?: unknown }).error;
    if (typeof nested === "object" && nested !== null) {
      const { message, code, issues, field, conflict } = nested as { message?: unknown; code?: unknown; issues?: unknown; field?: unknown; conflict?: unknown };
      if (typeof message === "string") {
        return new ApiError(
          message,
          status,
          typeof code === "string" ? code : "unknown",
          Array.isArray(issues) ? issues.filter(isIssue) : [],
          typeof field === "string" ? field : undefined,
          typeof conflict === "object" && conflict !== null ? (conflict as AvailabilityConflict) : undefined,
        );
      }
    }
  }
  return new ApiError(`Request failed with status ${status}`, status);
}

function isIssue(value: unknown): value is ApiIssue {
  return typeof value === "object" && value !== null && typeof (value as ApiIssue).path === "string" && typeof (value as ApiIssue).message === "string";
}

// --- Connection state, read by the offline banner (components/OfflineBanner) ---
type ConnectionListener = (state: { reachable: boolean; lastSuccessAt: Date | null }) => void;
let lastSuccessAt: Date | null = null;
let reachable = true;
const connectionListeners = new Set<ConnectionListener>();

function setReachable(value: boolean) {
  if (value) lastSuccessAt = new Date();
  if (reachable === value && value) return;
  reachable = value;
  connectionListeners.forEach((listener) => listener({ reachable, lastSuccessAt }));
}

export function subscribeConnection(listener: ConnectionListener): () => void {
  connectionListeners.add(listener);
  return () => connectionListeners.delete(listener);
}

export function connectionSnapshot() {
  return { reachable, lastSuccessAt };
}

/** Lightweight reachability probe used by "Try again". */
export async function pingApi(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/health`, { credentials: "include", cache: "no-store" });
    setReachable(response.ok);
    return response.ok;
  } catch {
    setReachable(false);
    return false;
  }
}

// Server-side paging (ticket l, docs/frontend-backend-gap-report.md). Always
// sends `limit`, so the endpoint answers with a Page, never the full array.
function pageQuery(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams({ limit: "50" });
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.toString();
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T | undefined> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
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
  } catch {
    setReachable(false);
    throw new ApiError("Could not reach FleetIP", 0, "network");
  }
  setReachable(true);

  if (response.status === 204) return undefined;

  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw errorFromBody(body, response.status);
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
  requestPasswordReset: (input: { email: string }) =>
    apiRequest("/auth/password-reset/request", { method: "POST", body: JSON.stringify(input) }),
  confirmPasswordReset: (input: { token: string; password: string }) =>
    apiRequest("/auth/password-reset/confirm", { method: "POST", body: JSON.stringify(input) }),
  // Signed-in account security (Settings > Security).
  changePassword: (input: ChangePasswordRequest) =>
    apiRequest("/auth/password", { method: "POST", body: JSON.stringify(input) }),
  listSessions: () => apiRequest<SessionListResponse>("/auth/sessions", { method: "GET" }),
  revokeSession: (sessionId: string) => apiRequest(`/auth/sessions/${sessionId}`, { method: "DELETE" }),
  revokeOtherSessions: () => apiRequest("/auth/sessions/revoke-others", { method: "POST" }),

  // --- Organization administration (tenant) ---
  getOrganizationProfile: (organizationId: string) =>
    apiRequest<Organization>(`/organizations/${organizationId}`, { method: "GET" }),
  listOrganizationMembers: (organizationId: string) =>
    apiRequest<OrganizationMember[]>(`/organizations/${organizationId}/members`, {
      method: "GET",
    }),
  createInvite: (organizationId: string, roleId: string) =>
    apiRequest<CreateInviteResponse>(`/organizations/${organizationId}/invites`, {
      method: "POST",
      body: JSON.stringify({ roleId }),
    }),
  listInvites: (organizationId: string) =>
    apiRequest<OrganizationInvite[]>(`/organizations/${organizationId}/invites`, { method: "GET" }),
  revokeInvite: (organizationId: string, inviteId: string) =>
    apiRequest<OrganizationInvite>(`/organizations/${organizationId}/invites/${inviteId}/revoke`, {
      method: "POST",
    }),
  updateOrganizationProfile: (organizationId: string, input: UpdateOrganizationRequest) =>
    apiRequest<Organization>(`/organizations/${organizationId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  updateMemberRole: (organizationId: string, membershipId: string, roleId: string) =>
    apiRequest<OrganizationMember>(`/organizations/${organizationId}/members/${membershipId}`, {
      method: "PATCH",
      body: JSON.stringify({ roleId }),
    }),
  listRolesAndPermissions: (organizationId: string) =>
    apiRequest<RoleWithPermissions[]>(`/organizations/${organizationId}/roles`, {
      method: "GET",
    }),
  createRole: (organizationId: string, input: CreateRoleRequest) =>
    apiRequest<RoleWithPermissions>(`/organizations/${organizationId}/roles`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateRole: (organizationId: string, roleId: string, input: UpdateRoleRequest) =>
    apiRequest<RoleWithPermissions>(`/organizations/${organizationId}/roles/${roleId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteRole: (organizationId: string, roleId: string) =>
    apiRequest<void>(`/organizations/${organizationId}/roles/${roleId}`, { method: "DELETE" }),

  // --- Public invite-link flow (may be called with no session at all) ---
  getInvitePreview: (token: string) =>
    apiRequest<InvitePreview>(`/invites/${token}`, { method: "GET" }),
  acceptInvite: (token: string, newAccount?: AcceptInviteRequest) =>
    apiRequest<{ organizationId: string; roleName: RoleName }>(`/invites/${token}/accept`, {
      method: "POST",
      ...(newAccount ? { body: JSON.stringify(newAccount) } : {}),
    }),

  // Catalogue lists include disabled items by default: most callers resolve
  // names for existing records. Pickers (register machine, post
  // requirement) pass includeDisabled=false; the API then also drops items
  // under a disabled category/subcategory (soft cascade, 0037).
  listProductCategories: (includeDisabled = true) =>
    apiRequest<ProductCategory[]>(
      `/product-categories${includeDisabled ? "?includeDisabled=true" : ""}`,
      { method: "GET" },
    ),
  listProductSubcategories: (categoryId: string, includeDisabled = true) =>
    apiRequest<ProductSubcategory[]>(
      `/product-categories/${categoryId}/subcategories${includeDisabled ? "?includeDisabled=true" : ""}`,
      { method: "GET" },
    ),
  listProducts: (subcategoryId?: string, includeDisabled = true) => {
    const query = new URLSearchParams(subcategoryId ? { subcategoryId } : {});
    if (includeDisabled) query.set("includeDisabled", "true");
    return apiRequest<Product[]>(`/products?${query}`, { method: "GET" });
  },
  getProductCategory: (categoryId: string) =>
    apiRequest<ProductCategory>(`/product-categories/${categoryId}`, { method: "GET" }),
  getProductSubcategory: (subcategoryId: string) =>
    apiRequest<ProductSubcategory>(`/product-subcategories/${subcategoryId}`, { method: "GET" }),
  getProduct: (productId: string) =>
    apiRequest<Product>(`/products/${productId}`, { method: "GET" }),
  setProductDisabled: (organizationId: string, productId: string, disabled: boolean) =>
    apiRequest<Product>(
      `/organizations/${organizationId}/products/${productId}/${disabled ? "disable" : "enable"}`,
      { method: "POST" },
    ),
  setProductCategoryDisabled: (organizationId: string, categoryId: string, disabled: boolean) =>
    apiRequest<ProductCategory>(
      `/organizations/${organizationId}/product-categories/${categoryId}/${disabled ? "disable" : "enable"}`,
      { method: "POST" },
    ),
  setProductSubcategoryDisabled: (organizationId: string, subcategoryId: string, disabled: boolean) =>
    apiRequest<ProductSubcategory>(
      `/organizations/${organizationId}/product-subcategories/${subcategoryId}/${disabled ? "disable" : "enable"}`,
      { method: "POST" },
    ),
  createProductCategory: (organizationId: string, input: CreateProductCategoryRequest) =>
    apiRequest<ProductCategory>(`/organizations/${organizationId}/product-categories`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateProductCategory: (
    organizationId: string,
    categoryId: string,
    input: UpdateProductCategoryRequest,
  ) =>
    apiRequest<ProductCategory>(
      `/organizations/${organizationId}/product-categories/${categoryId}`,
      { method: "PATCH", body: JSON.stringify(input) },
    ),
  createProductSubcategory: (organizationId: string, input: CreateProductSubcategoryRequest) =>
    apiRequest<ProductSubcategory>(`/organizations/${organizationId}/product-subcategories`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateProductSubcategory: (
    organizationId: string,
    subcategoryId: string,
    input: UpdateProductSubcategoryRequest,
  ) =>
    apiRequest<ProductSubcategory>(
      `/organizations/${organizationId}/product-subcategories/${subcategoryId}`,
      { method: "PATCH", body: JSON.stringify(input) },
    ),
  createProduct: (organizationId: string, input: CreateProductRequest) =>
    apiRequest<Product>(`/organizations/${organizationId}/products`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateProduct: (organizationId: string, productId: string, input: UpdateProductRequest) =>
    apiRequest<Product>(`/organizations/${organizationId}/products/${productId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  listMachines: (organizationId: string) =>
    apiRequest<Machine[]>(`/organizations/${organizationId}/machines`, { method: "GET" }),
  createMachine: (organizationId: string, input: CreateMachineInput) =>
    apiRequest<Machine>(`/organizations/${organizationId}/machines`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** "Free between" for many machines at once: rentals and open workshop jobs both count. */
  checkMachinesAvailability: (organizationId: string, input: CheckMachinesAvailabilityRequest) =>
    apiRequest<MachinesAvailabilityResponse>(`/organizations/${organizationId}/machines/availability`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateMachineStatus: (organizationId: string, machineId: string, status: MachineStatus) =>
    apiRequest<Machine>(`/organizations/${organizationId}/machines/${machineId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  updateMachine: (organizationId: string, machineId: string, input: UpdateMachineRequest) =>
    apiRequest<Machine>(`/organizations/${organizationId}/machines/${machineId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
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
  updateRentalStatus: (
    organizationId: string,
    rentalId: string,
    status: RentalStatus,
    actualDate?: string,
  ) =>
    apiRequest<Rental>(`/organizations/${organizationId}/rentals/${rentalId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, actualDate }),
    }),
  verifyActualDates: (organizationId: string, rentalId: string) =>
    apiRequest<Rental>(`/organizations/${organizationId}/rentals/${rentalId}/actual-dates/verify`, {
      method: "POST",
    }),
  disputeActualDates: (organizationId: string, rentalId: string, input: DisputeActualDatesRequest) =>
    apiRequest<Rental>(`/organizations/${organizationId}/rentals/${rentalId}/actual-dates/dispute`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  correctActualDates: (organizationId: string, rentalId: string, input: CorrectActualDatesRequest) =>
    apiRequest<Rental>(`/organizations/${organizationId}/rentals/${rentalId}/actual-dates/correct`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  proposeRentalDateChange: (organizationId: string, rentalId: string, input: ProposeRentalDateChangeRequest) =>
    apiRequest<Rental>(`/organizations/${organizationId}/rentals/${rentalId}/date-change`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  respondToRentalDateChange: (organizationId: string, rentalId: string, decision: "accepted" | "rejected") =>
    apiRequest<Rental>(`/organizations/${organizationId}/rentals/${rentalId}/date-change/respond`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),
  withdrawRentalDateChange: (organizationId: string, rentalId: string) =>
    apiRequest<Rental>(`/organizations/${organizationId}/rentals/${rentalId}/date-change/withdraw`, {
      method: "POST",
    }),
  listRentalEvents: (organizationId: string, rentalId: string) =>
    apiRequest<RentalEvent[]>(`/organizations/${organizationId}/rentals/${rentalId}/events`, { method: "GET" }),
  checkRentalAvailability: (
    organizationId: string,
    machineId: string,
    startDate: string,
    endDate?: string,
  ) =>
    apiRequest<MachineAvailability>(
      `/organizations/${organizationId}/rentals/availability?${new URLSearchParams({
        machineId,
        startDate,
        ...(endDate ? { endDate } : {}),
      }).toString()}`,
      { method: "GET" },
    ),

  // --- Project ---
  listProjects: (organizationId: string) =>
    apiRequest<Project[]>(`/organizations/${organizationId}/projects`, { method: "GET" }),
  getProject: (organizationId: string, projectId: string) =>
    apiRequest<Project>(`/organizations/${organizationId}/projects/${projectId}`, {
      method: "GET",
    }),
  createProject: (organizationId: string, input: CreateProjectRequest) =>
    apiRequest<Project>(`/organizations/${organizationId}/projects`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateProject: (organizationId: string, projectId: string, input: UpdateProjectRequest) =>
    apiRequest<Project>(`/organizations/${organizationId}/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  updateProjectStatus: (
    organizationId: string,
    projectId: string,
    status: "completed" | "cancelled",
  ) =>
    apiRequest<Project>(`/organizations/${organizationId}/projects/${projectId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  // --- RFQ (Requirement) ---
  listRequirements: (organizationId: string) =>
    apiRequest<Requirement[]>(`/organizations/${organizationId}/requirements`, { method: "GET" }),
  getRequirement: (organizationId: string, requirementId: string) =>
    apiRequest<Requirement>(`/organizations/${organizationId}/requirements/${requirementId}`, {
      method: "GET",
    }),
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
  updateRequirement: (
    organizationId: string,
    requirementId: string,
    input: UpdateRequirementRequest,
  ) =>
    apiRequest<Requirement>(`/organizations/${organizationId}/requirements/${requirementId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
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
  listRequestedQuotations: (organizationId: string) =>
    apiRequest<QuotationResponse[]>(`/organizations/${organizationId}/requested-quotations`, {
      method: "GET",
    }),
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
  requestQuotation: (organizationId: string, requirementId: string, rentalCompanyOrganizationId: string) =>
    apiRequest<void>(
      `/organizations/${organizationId}/requirements/${requirementId}/responses/${rentalCompanyOrganizationId}/request-quotation`,
      { method: "POST" },
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
  proposeAlternateDates: (
    organizationId: string,
    quotationId: string,
    input: ProposeAlternateDatesRequest,
  ) =>
    apiRequest<CommercialQuotation>(
      `/organizations/${organizationId}/quotations/${quotationId}/alternate-dates`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  respondToAlternateDates: (
    organizationId: string,
    quotationId: string,
    decision: "accepted" | "rejected",
  ) =>
    apiRequest<CommercialQuotation>(
      `/organizations/${organizationId}/quotations/${quotationId}/alternate-dates/respond`,
      { method: "POST", body: JSON.stringify({ decision }) },
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
  listScopeItems: (organizationId: string, quotationId: string) =>
    apiRequest<QuotationScopeItem[]>(
      `/organizations/${organizationId}/quotations/${quotationId}/scope-items`,
      { method: "GET" },
    ),
  addScopeItem: (
    organizationId: string,
    quotationId: string,
    input: CreateQuotationScopeItemRequest,
  ) =>
    apiRequest<QuotationScopeItem>(
      `/organizations/${organizationId}/quotations/${quotationId}/scope-items`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  removeScopeItem: (organizationId: string, quotationId: string, scopeItemId: string) =>
    apiRequest<void>(
      `/organizations/${organizationId}/quotations/${quotationId}/scope-items/${scopeItemId}`,
      { method: "DELETE" },
    ),

  // --- Work Order (the finalized commercial order, auto-created on award) ---
  listWorkOrders: (organizationId: string) =>
    apiRequest<WorkOrder[]>(`/organizations/${organizationId}/work-orders`, { method: "GET" }),
  getWorkOrder: (organizationId: string, workOrderId: string) =>
    apiRequest<WorkOrder>(`/organizations/${organizationId}/work-orders/${workOrderId}`, {
      method: "GET",
    }),
  getWorkOrderByQuotationId: (organizationId: string, quotationId: string) =>
    apiRequest<WorkOrder | null>(
      `/organizations/${organizationId}/quotations/${quotationId}/work-order`,
      { method: "GET" },
    ),
  listWorkOrderScopeItems: (organizationId: string, workOrderId: string) =>
    apiRequest<WorkOrderScopeItem[]>(
      `/organizations/${organizationId}/work-orders/${workOrderId}/scope-items`,
      { method: "GET" },
    ),
  updateWorkOrderStatus: (organizationId: string, workOrderId: string, status: WorkOrderStatus) =>
    apiRequest<WorkOrder>(`/organizations/${organizationId}/work-orders/${workOrderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  workOrderPrintUrl: (organizationId: string, workOrderId: string) =>
    `${API_URL}/organizations/${organizationId}/work-orders/${workOrderId}/print`,

  // --- Auction ---
  listAuctionsForOrganization: (organizationId: string) =>
    apiRequest<AuctionSummary[]>(`/organizations/${organizationId}/auctions`, { method: "GET" }),
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
  listAuctionEvents: (organizationId: string, auctionId: string) =>
    apiRequest<AuctionEvent[]>(`/organizations/${organizationId}/auctions/${auctionId}/events`, {
      method: "GET",
    }),
  cancelAuction: (organizationId: string, auctionId: string) =>
    apiRequest<Auction>(`/organizations/${organizationId}/auctions/${auctionId}/cancel`, {
      method: "POST",
    }),

  // --- Maintenance ---
  listMaintenanceRecords: (organizationId: string) =>
    apiRequest<MaintenanceRecord[]>(`/organizations/${organizationId}/maintenance-records`, {
      method: "GET",
    }),
  getMaintenanceRecord: (organizationId: string, maintenanceId: string) =>
    apiRequest<MaintenanceRecord>(
      `/organizations/${organizationId}/maintenance-records/${maintenanceId}`,
      { method: "GET" },
    ),
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
  /** Job In progress + machine Under maintenance, in one transaction. */
  sendToWorkshop: (organizationId: string, input: CreateMaintenanceRequest) =>
    apiRequest<MaintenanceRecord>(`/organizations/${organizationId}/maintenance-records/send-to-workshop`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** A job that already happened, created Completed (endDate required, not in the future). */
  logCompletedMaintenance: (organizationId: string, input: CreateMaintenanceRequest) =>
    apiRequest<MaintenanceRecord>(`/organizations/${organizationId}/maintenance-records/log-completed`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** `machineStatus` also moves the machine, in the same transaction as the job. */
  updateMaintenanceStatus: (
    organizationId: string,
    maintenanceId: string,
    status: MaintenanceStatus,
    machineStatus?: MachineStatus,
  ) =>
    apiRequest<MaintenanceRecord>(
      `/organizations/${organizationId}/maintenance-records/${maintenanceId}/status`,
      { method: "PATCH", body: JSON.stringify({ status, machineStatus }) },
    ),

  // --- Transport ---
  listTransportRecords: (organizationId: string) =>
    apiRequest<TransportRecord[]>(`/organizations/${organizationId}/transport-records`, {
      method: "GET",
    }),
  listTransportForRental: (organizationId: string, rentalId: string) =>
    apiRequest<TransportRecord[]>(
      `/organizations/${organizationId}/rentals/${rentalId}/transport`,
      {
        method: "GET",
      },
    ),
  // For a notification/dashboard deep link, which only has the transport
  // record's own id, not its rentalId.
  getTransportRecordById: (organizationId: string, id: string) =>
    apiRequest<TransportRecord>(`/organizations/${organizationId}/transport-records/${id}`, {
      method: "GET",
    }),
  createTransport: (organizationId: string, rentalId: string, input: CreateTransportRequest) =>
    apiRequest<TransportRecord>(`/organizations/${organizationId}/rentals/${rentalId}/transport`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateTransport: (
    organizationId: string,
    rentalId: string,
    leg: TransportLeg,
    updates: UpdateTransportRequest,
  ) =>
    apiRequest<TransportRecord>(
      `/organizations/${organizationId}/rentals/${rentalId}/transport/${leg}`,
      { method: "PATCH", body: JSON.stringify(updates) },
    ),

  // --- Logsheets + Utilization ---
  listLogsheets: (organizationId: string) =>
    apiRequest<Logsheet[]>(`/organizations/${organizationId}/logsheets`, { method: "GET" }),
  // For a notification/dashboard deep link, which only has the logsheet's
  // own id, not its rentalId.
  getLogsheetById: (organizationId: string, id: string) =>
    apiRequest<Logsheet>(`/organizations/${organizationId}/logsheets/${id}`, { method: "GET" }),
  listLogsheetsForRental: (organizationId: string, rentalId: string) =>
    apiRequest<Logsheet[]>(`/organizations/${organizationId}/rentals/${rentalId}/logsheets`, {
      method: "GET",
    }),
  submitLogsheet: (
    organizationId: string,
    rentalId: string,
    input: SubmitLogsheetRequest,
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
    apiRequest<InvoiceListItem[]>(`/organizations/${organizationId}/invoices`, { method: "GET" }),
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
    input: RecordPaymentRequest,
  ) =>
    apiRequest<Invoice>(`/organizations/${organizationId}/invoices/${invoiceId}/payments`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // --- Paged lists (ticket l). Screens still use the full lists above. ---
  listMachinesPage: (organizationId: string, query: MachineListQuery = {}) =>
    apiRequest<Page<Machine>>(`/organizations/${organizationId}/machines?${pageQuery(query)}`, { method: "GET" }),
  listRentalsPage: (organizationId: string, query: RentalListQuery = {}) =>
    apiRequest<Page<Rental>>(`/organizations/${organizationId}/rentals?${pageQuery(query)}`, { method: "GET" }),
  listInvoicesPage: (organizationId: string, query: InvoiceListQuery = {}) =>
    apiRequest<Page<InvoiceListItem>>(`/organizations/${organizationId}/invoices?${pageQuery(query)}`, {
      method: "GET",
    }),
  listMaintenanceRecordsPage: (organizationId: string, query: MaintenanceListQuery = {}) =>
    apiRequest<Page<MaintenanceRecord>>(
      `/organizations/${organizationId}/maintenance-records?${pageQuery(query)}`,
      { method: "GET" },
    ),
  listLogsheetsPage: (organizationId: string, query: LogsheetListQuery = {}) =>
    apiRequest<Page<Logsheet>>(`/organizations/${organizationId}/logsheets?${pageQuery(query)}`, {
      method: "GET",
    }),
  listTransportRecordsPage: (organizationId: string, query: TransportListQuery = {}) =>
    apiRequest<Page<TransportRecord>>(
      `/organizations/${organizationId}/transport-records?${pageQuery(query)}`,
      { method: "GET" },
    ),
  listQuotationsPage: (organizationId: string, query: QuotationListQuery = {}) =>
    apiRequest<Page<CommercialQuotation>>(`/organizations/${organizationId}/quotations?${pageQuery(query)}`, {
      method: "GET",
    }),
  discoverRequirementsPage: (organizationId: string, query: RequirementDiscoveryQuery = {}) =>
    apiRequest<Page<Requirement>>(
      `/organizations/${organizationId}/requirement-discovery?${pageQuery(query)}`,
      { method: "GET" },
    ),

  // --- Search ---
  search: (organizationId: string, q: string) =>
    apiRequest<SearchResult[]>(
      `/organizations/${organizationId}/search?q=${encodeURIComponent(q)}`,
      { method: "GET" },
    ),

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
