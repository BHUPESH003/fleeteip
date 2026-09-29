import {
  createMaintenanceRequestSchema,
  logCompletedMaintenanceRequestSchema,
  updateMaintenanceStatusRequestSchema,
} from "@fleetip/contracts/maintenance";
import { maintenanceListQuerySchema } from "@fleetip/contracts/list";
import type { FastifyInstance } from "fastify";
import { container } from "../../../infrastructure/container.js";
import { getAuthenticatedUserId } from "../../../shared/auth.js";
import { parseListQuery } from "../../../shared/list-query.js";
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

  // Job In progress + machine Under maintenance, one transaction.
  fastify.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/maintenance-records/send-to-workshop",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(createMaintenanceRequestSchema, request.body);
      const record = await container.maintenanceService.sendToWorkshop(
        userId,
        request.params.organizationId,
        body,
      );
      reply.code(201);
      return record;
    },
  );

  // A job that already happened, created Completed in one write.
  fastify.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/maintenance-records/log-completed",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(logCompletedMaintenanceRequestSchema, request.body);
      const record = await container.maintenanceService.logCompleted(
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

  // Standalone Maintenance screen — every maintenance record across the
  // org's own fleet, not one machine at a time. Registered after the
  // per-machine route above so Fastify's more specific path still matches
  // first for that shape (distinct path segments regardless, but keeping
  // reading order consistent with the rest of this file).
  fastify.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/maintenance-records",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const page = parseListQuery(maintenanceListQuerySchema, request.query);
      if (page) {
        return container.maintenanceService.listMaintenancePage(userId, request.params.organizationId, page);
      }
      return container.maintenanceService.listByOrganization(userId, request.params.organizationId);
    },
  );

  fastify.get<{ Params: { organizationId: string; maintenanceId: string } }>(
    "/organizations/:organizationId/maintenance-records/:maintenanceId",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.maintenanceService.getMaintenanceRecord(
        userId,
        request.params.organizationId,
        request.params.maintenanceId,
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
        body.machineStatus,
      );
    },
  );
}
