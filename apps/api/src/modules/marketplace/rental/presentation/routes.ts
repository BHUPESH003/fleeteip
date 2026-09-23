import {
  checkMachineAvailabilityQuerySchema,
  createRentalRequestSchema,
  disputeActualDatesRequestSchema,
  updateRentalStatusRequestSchema,
  updateRentalTermsRequestSchema,
} from "@fleetip/contracts/rental";
import type { FastifyInstance } from "fastify";
import { container } from "../../../../infrastructure/container.js";
import { getAuthenticatedUserId } from "../../../../shared/auth.js";
import { parseWithSchema } from "../../../../shared/validate.js";

export async function rentalRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/rentals",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.rentalService.listRentals(userId, request.params.organizationId);
    },
  );

  fastify.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/rentals",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(createRentalRequestSchema, request.body);
      const rental = await container.rentalService.createRental(
        userId,
        request.params.organizationId,
        body,
      );
      reply.code(201);
      return rental;
    },
  );

  // Registered before the :rentalId route so "availability" is never
  // captured as a rentalId path param.
  fastify.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/rentals/availability",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const query = parseWithSchema(checkMachineAvailabilityQuerySchema, request.query);
      const available = await container.rentalService.checkAvailability(
        userId,
        request.params.organizationId,
        query,
      );
      return { available };
    },
  );

  fastify.get<{ Params: { organizationId: string; rentalId: string } }>(
    "/organizations/:organizationId/rentals/:rentalId",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.rentalService.getRental(
        userId,
        request.params.organizationId,
        request.params.rentalId,
      );
    },
  );

  fastify.patch<{ Params: { organizationId: string; rentalId: string } }>(
    "/organizations/:organizationId/rentals/:rentalId/terms",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(updateRentalTermsRequestSchema, request.body);
      return container.rentalService.updateRentalTerms(
        userId,
        request.params.organizationId,
        request.params.rentalId,
        body,
      );
    },
  );

  fastify.patch<{ Params: { organizationId: string; rentalId: string } }>(
    "/organizations/:organizationId/rentals/:rentalId/status",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(updateRentalStatusRequestSchema, request.body);
      return container.rentalService.updateRentalStatus(
        userId,
        request.params.organizationId,
        request.params.rentalId,
        body.status,
        body.actualDate,
      );
    },
  );

  fastify.post<{ Params: { organizationId: string; rentalId: string } }>(
    "/organizations/:organizationId/rentals/:rentalId/actual-dates/verify",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.rentalService.verifyActualDates(
        userId,
        request.params.organizationId,
        request.params.rentalId,
      );
    },
  );

  fastify.post<{ Params: { organizationId: string; rentalId: string } }>(
    "/organizations/:organizationId/rentals/:rentalId/actual-dates/dispute",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(disputeActualDatesRequestSchema, request.body);
      return container.rentalService.disputeActualDates(
        userId,
        request.params.organizationId,
        request.params.rentalId,
        body.reason,
      );
    },
  );
}
