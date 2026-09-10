import type { Product, ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import type { Machine, MachineStatus } from "@fleetip/contracts/equipment";
import type {
  CreateRentalRequest,
  Rental,
  RentalStatus,
  UpdateRentalTermsRequest,
} from "@fleetip/contracts/rental";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {}

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
    throw new ApiError(body?.error?.message ?? `Request failed with status ${response.status}`);
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
};
