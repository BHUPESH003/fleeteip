import {
  checkMachineAvailabilityQuerySchema,
  createRentalRequestSchema,
  correctActualDatesRequestSchema,
  disputeActualDatesRequestSchema,
  proposeRentalDateChangeRequestSchema,
  respondToRentalDateChangeRequestSchema,
  updateRentalStatusRequestSchema,
  updateRentalTermsRequestSchema,
} from "@fleetip/contracts/rental";
import { rentalListQuerySchema } from "@fleetip/contracts/list";
import type { FastifyInstance } from "fastify";
import { container } from "../../../../infrastructure/container.js";
import { getAuthenticatedUserId } from "../../../../shared/auth.js";
import { parseListQuery } from "../../../../shared/list-query.js";
import { parseWithSchema } from "../../../../shared/validate.js";

export async function rentalRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/rentals",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const page = parseListQuery(rentalListQuerySchema, request.query);
      if (page) return container.rentalService.listRentalsPage(userId, request.params.organizationId, page);
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
      // { available, conflicts[] } — `available` kept for older callers.
      return container.rentalService.checkAvailability(userId, request.params.organizationId, query);
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

  fastify.post<{ Params: { organizationId: string; rentalId: string } }>(
    "/organizations/:organizationId/rentals/:rentalId/actual-dates/correct",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(correctActualDatesRequestSchema, request.body);
      return container.rentalService.correctActualDates(
        userId,
        request.params.organizationId,
        request.params.rentalId,
        body,
      );
    },
  );

  // Rental Company proposes (or, with no Renter organization, applies).
  fastify.post<{ Params: { organizationId: string; rentalId: string } }>(
    "/organizations/:organizationId/rentals/:rentalId/date-change",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(proposeRentalDateChangeRequestSchema, request.body);
      return container.rentalService.proposeDateChange(
        userId,
        request.params.organizationId,
        request.params.rentalId,
        body,
      );
    },
  );

  fastify.post<{ Params: { organizationId: string; rentalId: string } }>(
    "/organizations/:organizationId/rentals/:rentalId/date-change/respond",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(respondToRentalDateChangeRequestSchema, request.body);
      return container.rentalService.respondToDateChange(
        userId,
        request.params.organizationId,
        request.params.rentalId,
        body.decision,
      );
    },
  );

  fastify.post<{ Params: { organizationId: string; rentalId: string } }>(
    "/organizations/:organizationId/rentals/:rentalId/date-change/withdraw",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.rentalService.withdrawDateChange(
        userId,
        request.params.organizationId,
        request.params.rentalId,
      );
    },
  );

  fastify.get<{ Params: { organizationId: string; rentalId: string } }>(
    "/organizations/:organizationId/rentals/:rentalId/events",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.rentalService.listEvents(
        userId,
        request.params.organizationId,
        request.params.rentalId,
      );
    },
  );
}
