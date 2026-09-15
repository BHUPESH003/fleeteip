import {
  createInviteRequestSchema,
  createRoleRequestSchema,
  updateMemberRoleRequestSchema,
  updateRoleRequestSchema,
} from "@fleetip/contracts/organization";
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

  fastify.patch<{ Params: { organizationId: string; membershipId: string } }>(
    "/organizations/:organizationId/members/:membershipId",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(updateMemberRoleRequestSchema, request.body);
      return container.organizationService.updateMemberRole(
        userId,
        request.params.organizationId,
        request.params.membershipId,
        body.roleId,
      );
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
        body.roleId,
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

  fastify.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/roles",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(createRoleRequestSchema, request.body);
      const result = await container.organizationService.createRole(
        userId,
        request.params.organizationId,
        body,
      );
      reply.code(201);
      return result;
    },
  );

  fastify.patch<{ Params: { organizationId: string; roleId: string } }>(
    "/organizations/:organizationId/roles/:roleId",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(updateRoleRequestSchema, request.body);
      return container.organizationService.updateRole(
        userId,
        request.params.organizationId,
        request.params.roleId,
        body,
      );
    },
  );

  fastify.delete<{ Params: { organizationId: string; roleId: string } }>(
    "/organizations/:organizationId/roles/:roleId",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      await container.organizationService.deleteRole(
        userId,
        request.params.organizationId,
        request.params.roleId,
      );
      reply.code(204);
    },
  );
}
