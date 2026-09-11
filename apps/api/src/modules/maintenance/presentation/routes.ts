import {
  createMaintenanceRequestSchema,
  updateMaintenanceStatusRequestSchema,
} from "@fleetip/contracts/maintenance";
import type { FastifyInstance } from "fastify";
import { container } from "../../../infrastructure/container.js";
import { getAuthenticatedUserId } from "../../../shared/auth.js";
import { parseWithSchema } from "../../../shared/validate.js";

export async function maintenanceRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/maintenance-records",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(createMaintenanceRequestSchema, request.body);
      const record = await container.maintenanceService.createMaintenance(
        userId,
        request.params.organizationId,
        body,
      );
      reply.code(201);
      return record;
    },
  );

  fastify.get<{ Params: { organizationId: string; machineId: string } }>(
    "/organizations/:organizationId/machines/:machineId/maintenance-records",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.maintenanceService.listByMachine(
        userId,
        request.params.organizationId,
        request.params.machineId,
      );
    },
  );

  fastify.patch<{ Params: { organizationId: string; maintenanceId: string } }>(
    "/organizations/:organizationId/maintenance-records/:maintenanceId/status",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(updateMaintenanceStatusRequestSchema, request.body);
      return container.maintenanceService.updateStatus(
        userId,
        request.params.organizationId,
        request.params.maintenanceId,
        body.status,
      );
    },
  );
}
