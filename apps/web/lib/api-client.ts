const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T | undefined> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    // Only claim a JSON content-type when there's actually a body — sending
    // it on a bodiless request (e.g. logout) makes Fastify's JSON parser
    // reject the empty body outright.
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
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

export const apiClient = {
  signup: (input: SignupInput) =>
    apiRequest("/auth/signup", { method: "POST", body: JSON.stringify(input) }),
  login: (input: LoginInput) =>
    apiRequest("/auth/login", { method: "POST", body: JSON.stringify(input) }),
  logout: () => apiRequest("/auth/logout", { method: "POST" }),
  me: () => apiRequest("/auth/me", { method: "GET" }),
};
