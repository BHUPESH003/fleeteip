import { submitQuotationResponseRequestSchema } from "@fleetip/contracts/quotation";
import type { FastifyInstance } from "fastify";
import { container } from "../../../../infrastructure/container.js";
import { getAuthenticatedUserId } from "../../../../shared/auth.js";
import { parseWithSchema } from "../../../../shared/validate.js";

export async function quotationResponseRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.put<{ Params: { organizationId: string; requirementId: string } }>(
    "/organizations/:organizationId/requirements/:requirementId/response",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(submitQuotationResponseRequestSchema, request.body);
      return container.quotationResponseService.submitResponse(
        userId,
        request.params.organizationId,
        request.params.requirementId,
        body,
      );
    },
  );

  fastify.get<{ Params: { organizationId: string; requirementId: string } }>(
    "/organizations/:organizationId/requirements/:requirementId/response",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.quotationResponseService.getMyResponse(
        userId,
        request.params.organizationId,
        request.params.requirementId,
      );
    },
  );

  fastify.get<{ Params: { organizationId: string; requirementId: string } }>(
    "/organizations/:organizationId/requirements/:requirementId/responses",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.quotationResponseService.listResponsesForRequirement(
        userId,
        request.params.organizationId,
        request.params.requirementId,
      );
    },
  );

  fastify.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/requested-quotations",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.quotationResponseService.listRequestedQuotations(
        userId,
        request.params.organizationId,
      );
    },
  );

  fastify.post<{
    Params: { organizationId: string; requirementId: string; rentalCompanyOrganizationId: string };
  }>(
    "/organizations/:organizationId/requirements/:requirementId/responses/:rentalCompanyOrganizationId/request-quotation",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      await container.quotationResponseService.requestQuotation(
        userId,
        request.params.organizationId,
        request.params.requirementId,
        request.params.rentalCompanyOrganizationId,
      );
      reply.code(204);
    },
  );
}
