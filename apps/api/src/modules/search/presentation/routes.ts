import { searchQuerySchema } from "@fleetip/contracts/search";
import type { FastifyInstance } from "fastify";
import { container } from "../../../infrastructure/container.js";
import { getAuthenticatedUserId } from "../../../shared/auth.js";
import { parseWithSchema } from "../../../shared/validate.js";

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/search",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const query = parseWithSchema(searchQuerySchema, request.query);
      return container.searchService.search(userId, request.params.organizationId, query.q);
    },
  );
}
