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
