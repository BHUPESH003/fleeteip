import { acceptInviteRequestSchema } from "@fleetip/contracts/organization";
import type { FastifyInstance } from "fastify";
import { container } from "../../../infrastructure/container.js";
import { getOptionalAuthenticatedUserId, setSessionCookie } from "../../../shared/auth.js";
import { parseWithSchema } from "../../../shared/validate.js";

/**
 * Public routes — identified purely by the invite token, reachable by a
 * visitor who may not have (or want to create, if they already have one
 * for a different organization) a session yet. Never nested under
 * /organizations/:id — the visitor isn't assumed to know or be authorized
 * for that id at all; the token itself is the only credential.
 */
export async function inviteRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { token: string } }>("/invites/:token", async (request) => {
    return container.inviteService.getPreview(request.params.token);
  });

  fastify.post<{ Params: { token: string } }>("/invites/:token/accept", async (request, reply) => {
    const existingUserId = await getOptionalAuthenticatedUserId(request);
    const newAccount = existingUserId
      ? undefined
      : parseWithSchema(acceptInviteRequestSchema, request.body);

    const result = await container.inviteService.accept(request.params.token, {
      existingUserId: existingUserId ?? undefined,
      newAccount,
    });

    if (result.authResult) {
      setSessionCookie(reply, result.authResult.token, result.authResult.expiresAt);
    }
    return { organizationId: result.organizationId, roleName: result.roleName };
  });
}
