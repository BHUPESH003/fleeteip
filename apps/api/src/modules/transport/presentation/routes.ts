import {
  createTransportRequestSchema,
  updateTransportRequestSchema,
} from "@fleetip/contracts/transport";
import type { FastifyInstance } from "fastify";
import { container } from "../../../infrastructure/container.js";
import { getAuthenticatedUserId } from "../../../shared/auth.js";
import { parseWithSchema } from "../../../shared/validate.js";

export async function transportRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { organizationId: string; rentalId: string } }>(
    "/organizations/:organizationId/rentals/:rentalId/transport",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(createTransportRequestSchema, request.body);
      const record = await container.transportService.createTransport(
        userId,
        request.params.organizationId,
        request.params.rentalId,
        body,
      );
      reply.code(201);
      return record;
    },
  );

  fastify.get<{ Params: { organizationId: string; rentalId: string } }>(
    "/organizations/:organizationId/rentals/:rentalId/transport",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.transportService.listByRental(
        userId,
        request.params.organizationId,
        request.params.rentalId,
      );
    },
  );

  fastify.patch<{
    Params: { organizationId: string; rentalId: string; leg: "mobilization" | "demobilization" };
  }>("/organizations/:organizationId/rentals/:rentalId/transport/:leg", async (request) => {
    const userId = await getAuthenticatedUserId(request);
    const body = parseWithSchema(updateTransportRequestSchema, request.body);
    return container.transportService.updateTransport(
      userId,
      request.params.organizationId,
      request.params.rentalId,
      request.params.leg,
      body,
    );
  });
}
