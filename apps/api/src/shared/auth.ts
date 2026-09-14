import type { FastifyRequest } from "fastify";
import { env } from "../infrastructure/config/env.js";
import { container } from "../infrastructure/container.js";
import { UnauthorizedError } from "./errors.js";

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
