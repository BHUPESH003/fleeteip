import {
  createRequirementRequestSchema,
  updateRequirementRequestSchema,
  updateRequirementStatusRequestSchema,
} from "@fleetip/contracts/rfq";
import type { FastifyInstance } from "fastify";
import { container } from "../../../../infrastructure/container.js";
import { getAuthenticatedUserId } from "../../../../shared/auth.js";
import { parseWithSchema } from "../../../../shared/validate.js";

export async function requirementRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/requirements",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(createRequirementRequestSchema, request.body);
      const requirement = await container.requirementService.createRequirement(
        userId,
        request.params.organizationId,
        body,
      );
      reply.code(201);
      return requirement;
    },
  );

  fastify.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/requirements",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.requirementService.listRequirements(userId, request.params.organizationId);
    },
  );

  // Discovery: a Rental Company browsing open Requirements broadcast by any
  // Renter — not scoped to :organizationId's own records. See
  // docs/marketplace-core-loop-design.md §4.
  fastify.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/requirement-discovery",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.requirementService.discoverRequirements(
        userId,
        request.params.organizationId,
      );
    },
  );

  fastify.get<{ Params: { organizationId: string; requirementId: string } }>(
    "/organizations/:organizationId/requirement-discovery/:requirementId",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.requirementService.getRequirementForDiscovery(
        userId,
        request.params.organizationId,
        request.params.requirementId,
      );
    },
  );

  fastify.get<{ Params: { organizationId: string; requirementId: string } }>(
    "/organizations/:organizationId/requirements/:requirementId",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.requirementService.getRequirement(
        userId,
        request.params.organizationId,
        request.params.requirementId,
      );
    },
  );

  fastify.patch<{ Params: { organizationId: string; requirementId: string } }>(
    "/organizations/:organizationId/requirements/:requirementId",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(updateRequirementRequestSchema, request.body);
      return container.requirementService.updateRequirement(
        userId,
        request.params.organizationId,
        request.params.requirementId,
        body,
      );
    },
  );

  fastify.patch<{ Params: { organizationId: string; requirementId: string } }>(
    "/organizations/:organizationId/requirements/:requirementId/status",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(updateRequirementStatusRequestSchema, request.body);
      return container.requirementService.updateRequirementStatus(
        userId,
        request.params.organizationId,
        request.params.requirementId,
        body.status,
      );
    },
  );
}
