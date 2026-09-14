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
import type { Auction } from "@fleetip/contracts/auction";
import type {
  PlatformDashboardCounts,
  PlatformOrganization,
  PlatformUser,
  StaffLoginRequest,
  StaffUser,
} from "@fleetip/contracts/platform-admin";
import type { Requirement } from "@fleetip/contracts/rfq";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class AdminApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

function errorMessage(status: number, body: unknown): string {
  if (typeof body === "object" && body !== null) {
    const nestedError = (body as { error?: unknown }).error;
    if (typeof nestedError === "object" && nestedError !== null) {
      const nestedMessage = (nestedError as { message?: unknown }).message;
      if (typeof nestedMessage === "string") return nestedMessage;
    }
  }
  return `Request failed with status ${status}`;
}

// Same fetch discipline as the tenant apiClient (lib/api-client.ts), but
// against /admin/* and the separate staff session cookie — never mixed
// into the same client, so a staff session can never be confused with a
// tenant one on either side.
async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T | undefined> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) return undefined;

  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new AdminApiError(errorMessage(response.status, body), response.status);
  }
  return body as T;
}

export const adminApiClient = {
  login: (input: StaffLoginRequest) =>
    adminRequest<{ staffUser: StaffUser }>("/admin/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  logout: () => adminRequest<void>("/admin/auth/logout", { method: "POST" }),
  me: () => adminRequest<{ staffUser: StaffUser }>("/admin/auth/me", { method: "GET" }),

  getDashboard: () => adminRequest<PlatformDashboardCounts>("/admin/dashboard", { method: "GET" }),

  listOrganizations: () =>
    adminRequest<PlatformOrganization[]>("/admin/organizations", { method: "GET" }),
  setOrganizationStatus: (organizationId: string, status: "active" | "suspended") =>
    adminRequest<PlatformOrganization>(`/admin/organizations/${organizationId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  listUsers: () => adminRequest<PlatformUser[]>("/admin/users", { method: "GET" }),
  setUserStatus: (userId: string, status: "active" | "suspended") =>
    adminRequest<PlatformUser>(`/admin/users/${userId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  listOpenRequirements: () => adminRequest<Requirement[]>("/admin/requirements", { method: "GET" }),
  listAuctions: () => adminRequest<Auction[]>("/admin/auctions", { method: "GET" }),

  createCategory: (input: CreateProductCategoryRequest) =>
    adminRequest<ProductCategory>("/admin/catalogue/categories", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateCategory: (categoryId: string, input: UpdateProductCategoryRequest) =>
    adminRequest<ProductCategory>(`/admin/catalogue/categories/${categoryId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  createSubcategory: (input: CreateProductSubcategoryRequest) =>
    adminRequest<ProductSubcategory>("/admin/catalogue/subcategories", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateSubcategory: (subcategoryId: string, input: UpdateProductSubcategoryRequest) =>
    adminRequest<ProductSubcategory>(`/admin/catalogue/subcategories/${subcategoryId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  createProduct: (input: CreateProductRequest) =>
    adminRequest<Product>("/admin/catalogue/products", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateProduct: (productId: string, input: UpdateProductRequest) =>
    adminRequest<Product>(`/admin/catalogue/products/${productId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
};
