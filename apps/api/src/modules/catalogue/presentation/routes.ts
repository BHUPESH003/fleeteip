import {
  createProductCategoryRequestSchema,
  createProductRequestSchema,
  createProductSubcategoryRequestSchema,
  listProductsQuerySchema,
  updateProductCategoryRequestSchema,
  updateProductRequestSchema,
  updateProductSubcategoryRequestSchema,
} from "@fleetip/contracts/catalogue";
import type { FastifyInstance } from "fastify";
import { container } from "../../../infrastructure/container.js";
import { getAuthenticatedUserId } from "../../../shared/auth.js";
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

  // --- Platform administration: create/update the shared catalogue,
  // gated by catalogue.manage. :organizationId identifies the caller's own
  // membership for the permission check only — see CatalogueService. ---

  fastify.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/product-categories",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(createProductCategoryRequestSchema, request.body);
      const category = await container.catalogueService.createCategory(
        userId,
        request.params.organizationId,
        body,
      );
      reply.code(201);
      return category;
    },
  );

  fastify.patch<{ Params: { organizationId: string; categoryId: string } }>(
    "/organizations/:organizationId/product-categories/:categoryId",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(updateProductCategoryRequestSchema, request.body);
      return container.catalogueService.updateCategory(
        userId,
        request.params.organizationId,
        request.params.categoryId,
        body,
      );
    },
  );

  fastify.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/product-subcategories",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(createProductSubcategoryRequestSchema, request.body);
      const subcategory = await container.catalogueService.createSubcategory(
        userId,
        request.params.organizationId,
        body,
      );
      reply.code(201);
      return subcategory;
    },
  );

  fastify.patch<{ Params: { organizationId: string; subcategoryId: string } }>(
    "/organizations/:organizationId/product-subcategories/:subcategoryId",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(updateProductSubcategoryRequestSchema, request.body);
      return container.catalogueService.updateSubcategory(
        userId,
        request.params.organizationId,
        request.params.subcategoryId,
        body,
      );
    },
  );

  fastify.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/products",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(createProductRequestSchema, request.body);
      const product = await container.catalogueService.createProduct(
        userId,
        request.params.organizationId,
        body,
      );
      reply.code(201);
      return product;
    },
  );

  fastify.patch<{ Params: { organizationId: string; productId: string } }>(
    "/organizations/:organizationId/products/:productId",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(updateProductRequestSchema, request.body);
      return container.catalogueService.updateProduct(
        userId,
        request.params.organizationId,
        request.params.productId,
        body,
      );
    },
  );
}
