import type { FastifyInstance } from "fastify";
import { container } from "../../../infrastructure/container.js";
import { getAuthenticatedUserId } from "../../../shared/auth.js";

export async function notificationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/notifications",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.notificationService.list(userId, request.params.organizationId);
    },
  );

  fastify.post<{ Params: { organizationId: string; notificationId: string } }>(
    "/organizations/:organizationId/notifications/:notificationId/read",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.notificationService.markRead(
        userId,
        request.params.organizationId,
        request.params.notificationId,
      );
    },
  );

  fastify.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/notifications/read-all",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      await container.notificationService.markAllRead(userId, request.params.organizationId);
      reply.code(204);
    },
  );
}
