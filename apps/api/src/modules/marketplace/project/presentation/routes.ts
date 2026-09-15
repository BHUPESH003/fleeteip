import {
  createProjectRequestSchema,
  updateProjectRequestSchema,
  updateProjectStatusRequestSchema,
} from "@fleetip/contracts/project";
import type { FastifyInstance } from "fastify";
import { container } from "../../../../infrastructure/container.js";
import { getAuthenticatedUserId } from "../../../../shared/auth.js";
import { parseWithSchema } from "../../../../shared/validate.js";

export async function projectRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/projects",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(createProjectRequestSchema, request.body);
      const project = await container.projectService.createProject(
        userId,
        request.params.organizationId,
        body,
      );
      reply.code(201);
      return project;
    },
  );

  fastify.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/projects",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.projectService.listProjects(userId, request.params.organizationId);
    },
  );

  fastify.get<{ Params: { organizationId: string; projectId: string } }>(
    "/organizations/:organizationId/projects/:projectId",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.projectService.getProject(
        userId,
        request.params.organizationId,
        request.params.projectId,
      );
    },
  );

  fastify.patch<{ Params: { organizationId: string; projectId: string } }>(
    "/organizations/:organizationId/projects/:projectId",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(updateProjectRequestSchema, request.body);
      return container.projectService.updateProject(
        userId,
        request.params.organizationId,
        request.params.projectId,
        body,
      );
    },
  );

  fastify.patch<{ Params: { organizationId: string; projectId: string } }>(
    "/organizations/:organizationId/projects/:projectId/status",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(updateProjectStatusRequestSchema, request.body);
      return container.projectService.updateProjectStatus(
        userId,
        request.params.organizationId,
        request.params.projectId,
        body.status,
      );
    },
  );
}
