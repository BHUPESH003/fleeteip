import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../infrastructure/config/env.js";
import { container } from "../infrastructure/container.js";
import type { CurrentSession } from "../modules/identity/application/auth-service.js";
import { UnauthorizedError } from "./errors.js";

// Shared by identity/presentation/routes.ts (login/signup) and
// organizations/presentation/invite-routes.ts (accepting an invite as a
// brand-new account also starts a real tenant session) — one cookie
// convention, not two copies of it.
export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    signed: true,
    path: "/",
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    expires: expiresAt,
  });
}

export function getSessionToken(request: FastifyRequest): string | undefined {
  const raw = request.cookies[env.SESSION_COOKIE_NAME];
  if (!raw) return undefined;
  const unsigned = request.unsignCookie(raw);
  return unsigned.valid ? (unsigned.value ?? undefined) : undefined;
}

/** The signed-in tenant session (id + user id), or 401. */
export async function getCurrentSession(request: FastifyRequest): Promise<CurrentSession> {
  const token = getSessionToken(request);
  const session = token ? await container.authService.resolveSession(token) : null;
  if (!session) throw new UnauthorizedError();
  return { sessionId: session.sessionId, userId: session.userId };
}

export async function getAuthenticatedUserId(request: FastifyRequest): Promise<string> {
  return (await getCurrentSession(request)).userId;
}

// Unlike getAuthenticatedUserId, never throws — for the few routes (invite
// accept/preview) that must work for a visitor with no session at all, and
// behave differently when one is present. Never use this where the lack of
// a session should be an error.
export async function getOptionalAuthenticatedUserId(request: FastifyRequest): Promise<string | null> {
  const token = getSessionToken(request);
  const session = token ? await container.authService.resolveSession(token) : null;
  return session?.userId ?? null;
}

// Platform Admin's own principal — a wholly separate cookie/session/table
// from the tenant one above. See the staff module for why.
export function getStaffSessionToken(request: FastifyRequest): string | undefined {
  const raw = request.cookies[env.STAFF_SESSION_COOKIE_NAME];
  if (!raw) return undefined;
  const unsigned = request.unsignCookie(raw);
  return unsigned.valid ? (unsigned.value ?? undefined) : undefined;
}

// The /admin/* onRequest guard (app.ts) resolves the staff session once;
// handlers calling getAuthenticatedStaffId again reuse it instead of a second lookup.
const staffIdByRequest = new WeakMap<FastifyRequest, string>();

export async function getAuthenticatedStaffId(request: FastifyRequest): Promise<string> {
  const cached = staffIdByRequest.get(request);
  if (cached) return cached;
  const token = getStaffSessionToken(request);
  const staffUser = token ? await container.staffAuthService.getAuthenticatedStaff(token) : null;
  if (!staffUser) throw new UnauthorizedError();
  staffIdByRequest.set(request, staffUser.id);
  return staffUser.id;
}

/**
 * onRequest guard for every /admin/* route except /admin/auth/* (login,
 * logout, me). Enforced once by prefix so a new admin handler that forgets
 * its own getAuthenticatedStaffId call is still staff-only.
 */
export async function requireStaffSessionForAdminRoutes(request: FastifyRequest): Promise<void> {
  // The matched route pattern, not the raw URL — no encoding/query tricks; unmatched URLs 404 anyway.
  const path = request.routeOptions.url ?? "";
  if (!path.startsWith("/admin/") || path.startsWith("/admin/auth/")) return;
  await getAuthenticatedStaffId(request);
}
