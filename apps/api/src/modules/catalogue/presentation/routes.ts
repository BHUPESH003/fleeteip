import { listProductsQuerySchema } from "@fleetip/contracts/catalogue";
import type { FastifyInstance } from "fastify";
import { container } from "../../../infrastructure/container.js";
import { parseWithSchema } from "../../../shared/validate.js";

export async function catalogueRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/product-categories", async () => container.catalogueService.listCategories());

  fastify.get<{ Params: { categoryId: string } }>(
    "/product-categories/:categoryId/subcategories",
    async (request) => container.catalogueService.listSubcategories(request.params.categoryId),
  );

  fastify.get("/products", async (request) => {
    const query = parseWithSchema(listProductsQuerySchema, request.query);
    return container.catalogueService.listProducts(query.subcategoryId);
  });
}
