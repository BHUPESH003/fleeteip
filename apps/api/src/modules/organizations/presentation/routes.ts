import { createInviteRequestSchema } from "@fleetip/contracts/organization";
import type { FastifyInstance } from "fastify";
import { container } from "../../../infrastructure/container.js";
import { getAuthenticatedUserId } from "../../../shared/auth.js";
import { parseWithSchema } from "../../../shared/validate.js";

// Tenant organization administration — a member managing THEIR OWN
// organization's profile/members/roles. See OrganizationService for the
// authorization shape (organization.manage / membership.manage, already
// seeded — see docs/frontend-backend-gap-report.md's Organization
// administration entry for what's genuinely in scope here).
export async function organizationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.organizationService.getOrganization(userId, request.params.organizationId);
    },
  );

  fastify.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/members",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.organizationService.listMembers(userId, request.params.organizationId);
    },
  );

  fastify.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/invites",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(createInviteRequestSchema, request.body);
      const result = await container.inviteService.createInvite(
        userId,
        request.params.organizationId,
        body.roleName,
      );
      reply.code(201);
      return result;
    },
  );

  fastify.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/roles",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.organizationService.listRolesAndPermissions(
        userId,
        request.params.organizationId,
      );
    },
  );
}
