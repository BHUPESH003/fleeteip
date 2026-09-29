import {
  createMachineRequestSchema,
  updateMachineRequestSchema,
  updateMachineStatusRequestSchema,
} from "@fleetip/contracts/equipment";
import { checkMachinesAvailabilityRequestSchema } from "@fleetip/contracts/rental";
import { machineListQuerySchema } from "@fleetip/contracts/list";
import type { FastifyInstance } from "fastify";
import { container } from "../../../infrastructure/container.js";
import { getAuthenticatedUserId } from "../../../shared/auth.js";
import { parseListQuery } from "../../../shared/list-query.js";
import { parseWithSchema } from "../../../shared/validate.js";

export async function equipmentRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/machines",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const page = parseListQuery(machineListQuerySchema, request.query);
      if (page) {
        return container.equipmentService.listMachinesPage(userId, request.params.organizationId, page);
      }
      return container.equipmentService.listMachines(userId, request.params.organizationId);
    },
  );

  fastify.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/machines",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(createMachineRequestSchema, request.body);
      const machine = await container.equipmentService.createMachine(
        userId,
        request.params.organizationId,
        body,
      );
      reply.code(201);
      return machine;
    },
  );

  // Batch availability ("Free between" on the machines list): one answer per
  // machine, rentals and open workshop jobs both counted. POST so a long id
  // list isn't squeezed into a query string.
  fastify.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/machines/availability",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(checkMachinesAvailabilityRequestSchema, request.body);
      return container.rentalService.checkMachinesAvailability(
        userId,
        request.params.organizationId,
        body,
      );
    },
  );

  fastify.patch<{ Params: { organizationId: string; machineId: string } }>(
    "/organizations/:organizationId/machines/:machineId/status",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(updateMachineStatusRequestSchema, request.body);
      return container.equipmentService.updateMachineStatus(
        userId,
        request.params.organizationId,
        request.params.machineId,
        body.status,
      );
    },
  );

  fastify.patch<{ Params: { organizationId: string; machineId: string } }>(
    "/organizations/:organizationId/machines/:machineId",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(updateMachineRequestSchema, request.body);
      return container.equipmentService.updateMachine(
        userId,
        request.params.organizationId,
        request.params.machineId,
        body,
      );
    },
  );
}
