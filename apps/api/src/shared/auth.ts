import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../infrastructure/config/env.js";
import { container } from "../infrastructure/container.js";
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

export async function getAuthenticatedUserId(request: FastifyRequest): Promise<string> {
  const token = getSessionToken(request);
  const session = token ? await container.authService.getAuthenticatedSession(token) : null;
  if (!session) throw new UnauthorizedError();
  return session.user.id;
}

// Unlike getAuthenticatedUserId, never throws — for the few routes (invite
// accept/preview) that must work for a visitor with no session at all, and
// behave differently when one is present. Never use this where the lack of
// a session should be an error.
export async function getOptionalAuthenticatedUserId(request: FastifyRequest): Promise<string | null> {
  const token = getSessionToken(request);
  const session = token ? await container.authService.getAuthenticatedSession(token) : null;
  return session?.user.id ?? null;
}

// Platform Admin's own principal — a wholly separate cookie/session/table
// from the tenant one above. See the staff module for why.
export function getStaffSessionToken(request: FastifyRequest): string | undefined {
  const raw = request.cookies[env.STAFF_SESSION_COOKIE_NAME];
  if (!raw) return undefined;
  const unsigned = request.unsignCookie(raw);
  return unsigned.valid ? (unsigned.value ?? undefined) : undefined;
}

export async function getAuthenticatedStaffId(request: FastifyRequest): Promise<string> {
  const token = getStaffSessionToken(request);
  const staffUser = token ? await container.staffAuthService.getAuthenticatedStaff(token) : null;
  if (!staffUser) throw new UnauthorizedError();
  return staffUser.id;
}
