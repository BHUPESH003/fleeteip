import {
  createMachineRequestSchema,
  updateMachineStatusRequestSchema,
} from "@fleetip/contracts/equipment";
import type { FastifyInstance } from "fastify";
import { container } from "../../../infrastructure/container.js";
import { getAuthenticatedUserId } from "../../../shared/auth.js";
import { parseWithSchema } from "../../../shared/validate.js";

export async function equipmentRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/machines",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
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
}
