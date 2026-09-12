import { submitLogsheetRequestSchema } from "@fleetip/contracts/logsheet";
import type { FastifyInstance } from "fastify";
import { container } from "../../../infrastructure/container.js";
import { getAuthenticatedUserId } from "../../../shared/auth.js";
import { parseWithSchema } from "../../../shared/validate.js";

export async function logsheetRoutes(fastify: FastifyInstance): Promise<void> {
  // Standalone Logsheets screen — every logsheet across the org's own fleet
  // of rentals (Rental Company only).
  fastify.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/logsheets",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.logsheetService.listByOrganization(userId, request.params.organizationId);
    },
  );

  fastify.put<{ Params: { organizationId: string; rentalId: string } }>(
    "/organizations/:organizationId/rentals/:rentalId/logsheets",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(submitLogsheetRequestSchema, request.body);
      return container.logsheetService.submitLogsheet(
        userId,
        request.params.organizationId,
        request.params.rentalId,
        body,
      );
    },
  );

  fastify.get<{ Params: { organizationId: string; rentalId: string } }>(
    "/organizations/:organizationId/rentals/:rentalId/logsheets",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.logsheetService.listByRental(
        userId,
        request.params.organizationId,
        request.params.rentalId,
      );
    },
  );

  fastify.get<{ Params: { organizationId: string; rentalId: string } }>(
    "/organizations/:organizationId/rentals/:rentalId/utilization",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.utilizationService.getRentalUtilization(
        userId,
        request.params.organizationId,
        request.params.rentalId,
      );
    },
  );

  fastify.get<{ Params: { organizationId: string; machineId: string } }>(
    "/organizations/:organizationId/machines/:machineId/utilization",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.utilizationService.getMachineUtilization(
        userId,
        request.params.organizationId,
        request.params.machineId,
      );
    },
  );
}
