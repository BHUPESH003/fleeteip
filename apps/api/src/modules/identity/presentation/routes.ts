import { loginRequestSchema, signupRequestSchema } from "@fleetip/contracts/identity";
import type { FastifyInstance, FastifyReply } from "fastify";
import { env } from "../../../infrastructure/config/env.js";
import { container } from "../../../infrastructure/container.js";
import { getSessionToken } from "../../../shared/auth.js";
import { UnauthorizedError } from "../../../shared/errors.js";
import { parseWithSchema } from "../../../shared/validate.js";

function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    signed: true,
    path: "/",
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    expires: expiresAt,
  });
}

// Brute-force/enumeration protection — keyed by IP, not email, since an
// attacker controls the email field. Deliberately generous (this guards
// against automated credential-stuffing, not a legitimate user mistyping a
// password a few times).
const AUTH_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };

export async function identityRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/auth/signup",
    { config: { rateLimit: AUTH_RATE_LIMIT } },
    async (request, reply) => {
      const body = parseWithSchema(signupRequestSchema, request.body);
      const result = await container.authService.signup(body);
      setSessionCookie(reply, result.token, result.expiresAt);
      reply.code(201);
      return { user: result.user };
    },
  );

  fastify.post(
    "/auth/login",
    { config: { rateLimit: AUTH_RATE_LIMIT } },
    async (request, reply) => {
      const body = parseWithSchema(loginRequestSchema, request.body);
      const result = await container.authService.login(body);
      setSessionCookie(reply, result.token, result.expiresAt);
      return { user: result.user };
    },
  );

  fastify.post("/auth/logout", async (request, reply) => {
    const token = getSessionToken(request);
    if (token) await container.authService.logout(token);
    reply.clearCookie(env.SESSION_COOKIE_NAME, { path: "/" });
    reply.code(204);
  });

  fastify.get("/auth/me", async (request) => {
    const token = getSessionToken(request);
    const session = token ? await container.authService.getAuthenticatedSession(token) : null;
    if (!session) throw new UnauthorizedError();
    return session;
  });
}
