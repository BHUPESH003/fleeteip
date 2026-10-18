import {
  changePasswordRequestSchema,
  emailVerificationConfirmSchema,
  emailVerificationResendSchema,
  loginRequestSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  signupRequestSchema,
} from "@fleetip/contracts/identity";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "../../../infrastructure/config/env.js";
import { container } from "../../../infrastructure/container.js";
import { getCurrentSession, getSessionToken, setSessionCookie } from "../../../shared/auth.js";
import { UnauthorizedError } from "../../../shared/errors.js";
import { parseWithSchema } from "../../../shared/validate.js";

// Brute-force/enumeration protection — keyed by IP, not email, since an
// attacker controls the email field. Deliberately generous (this guards
// against automated credential-stuffing, not a legitimate user mistyping a
// password a few times). keyGenerator overrides app.ts's global per-session key.
const AUTH_RATE_LIMIT = {
  max: 10,
  timeWindow: "1 minute",
  keyGenerator: (request: FastifyRequest) => request.ip,
};

const sessionMeta = (request: FastifyRequest) => ({ userAgent: request.headers["user-agent"] });

export async function identityRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/auth/signup",
    { config: { rateLimit: AUTH_RATE_LIMIT } },
    async (request, reply) => {
      const body = parseWithSchema(signupRequestSchema, request.body);
      const result = await container.authService.signup(body, sessionMeta(request));
      reply.code(201);
      // No session yet: the account signs in after following the emailed link.
      if (result.verificationRequired) return { user: result.user, verificationRequired: true };
      setSessionCookie(reply, result.token, result.expiresAt);
      return { user: result.user };
    },
  );

  fastify.post(
    "/auth/login",
    { config: { rateLimit: AUTH_RATE_LIMIT } },
    async (request, reply) => {
      const body = parseWithSchema(loginRequestSchema, request.body);
      const result = await container.authService.login(body, sessionMeta(request));
      setSessionCookie(reply, result.token, result.expiresAt);
      return { user: result.user };
    },
  );

  // Public, no session. Both answer 204 whether or not the account exists.
  fastify.post(
    "/auth/email-verification/confirm",
    { config: { rateLimit: AUTH_RATE_LIMIT } },
    async (request, reply) => {
      const body = parseWithSchema(emailVerificationConfirmSchema, request.body);
      await container.emailVerificationService.confirm(body);
      reply.code(204);
    },
  );

  fastify.post(
    "/auth/email-verification/resend",
    { config: { rateLimit: AUTH_RATE_LIMIT } },
    async (request, reply) => {
      const body = parseWithSchema(emailVerificationResendSchema, request.body);
      await container.emailVerificationService.resend(body);
      reply.code(204);
    },
  );

  // Public, no session. Always 204 — see PasswordResetService.requestReset.
  fastify.post(
    "/auth/password-reset/request",
    { config: { rateLimit: AUTH_RATE_LIMIT } },
    async (request, reply) => {
      const body = parseWithSchema(passwordResetRequestSchema, request.body);
      await container.passwordResetService.requestReset(body);
      reply.code(204);
    },
  );

  fastify.post(
    "/auth/password-reset/confirm",
    { config: { rateLimit: AUTH_RATE_LIMIT } },
    async (request, reply) => {
      const body = parseWithSchema(passwordResetConfirmSchema, request.body);
      await container.passwordResetService.confirmReset(body);
      reply.code(204);
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

  // --- Signed-in account security (Settings > Security) ---

  // Rate-limited like login: a stolen cookie must not be a free oracle for the current password.
  fastify.post("/auth/password", { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const current = await getCurrentSession(request);
    const body = parseWithSchema(changePasswordRequestSchema, request.body);
    await container.authService.changePassword(current, body);
    reply.code(204);
  });

  fastify.get("/auth/sessions", async (request) => {
    return container.authService.listSessions(await getCurrentSession(request));
  });

  fastify.delete<{ Params: { sessionId: string } }>("/auth/sessions/:sessionId", async (request, reply) => {
    const current = await getCurrentSession(request);
    await container.authService.revokeSession(current, request.params.sessionId);
    if (request.params.sessionId === current.sessionId) {
      reply.clearCookie(env.SESSION_COOKIE_NAME, { path: "/" });
    }
    reply.code(204);
  });

  fastify.post("/auth/sessions/revoke-others", async (request, reply) => {
    await container.authService.revokeOtherSessions(await getCurrentSession(request));
    reply.code(204);
  });
}
