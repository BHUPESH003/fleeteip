import { staffLoginRequestSchema } from "@fleetip/contracts/platform-admin";
import type { FastifyInstance, FastifyReply } from "fastify";
import { env } from "../../../infrastructure/config/env.js";
import { container } from "../../../infrastructure/container.js";
import { getStaffSessionToken } from "../../../shared/auth.js";
import { UnauthorizedError } from "../../../shared/errors.js";
import { parseWithSchema } from "../../../shared/validate.js";

function setStaffSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(env.STAFF_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    signed: true,
    path: "/",
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    expires: expiresAt,
  });
}

// Same brute-force protection as tenant login — see identity/presentation/routes.ts.
const AUTH_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };

export async function staffRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/admin/auth/login",
    { config: { rateLimit: AUTH_RATE_LIMIT } },
    async (request, reply) => {
      const body = parseWithSchema(staffLoginRequestSchema, request.body);
      const result = await container.staffAuthService.login(body.email, body.password);
      setStaffSessionCookie(reply, result.token, result.expiresAt);
      return { staffUser: result.staffUser };
    },
  );

  fastify.post("/admin/auth/logout", async (request, reply) => {
    const token = getStaffSessionToken(request);
    if (token) await container.staffAuthService.logout(token);
    reply.clearCookie(env.STAFF_SESSION_COOKIE_NAME, { path: "/" });
    reply.code(204);
  });

  fastify.get("/admin/auth/me", async (request) => {
    const token = getStaffSessionToken(request);
    const staffUser = token ? await container.staffAuthService.getAuthenticatedStaff(token) : null;
    if (!staffUser) throw new UnauthorizedError();
    return {
      staffUser: {
        id: staffUser.id,
        email: staffUser.email,
        displayName: staffUser.display_name,
        createdAt: new Date(staffUser.created_at).toISOString(),
      },
    };
  });
}
