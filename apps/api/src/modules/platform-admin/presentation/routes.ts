import {
  createProductCategoryRequestSchema,
  createProductRequestSchema,
  createProductSubcategoryRequestSchema,
  updateProductCategoryRequestSchema,
  updateProductRequestSchema,
  updateProductSubcategoryRequestSchema,
} from "@fleetip/contracts/catalogue";
import { updateStatusRequestSchema } from "@fleetip/contracts/platform-admin";
import type { FastifyInstance } from "fastify";
import { container } from "../../../infrastructure/container.js";
import { getAuthenticatedStaffId } from "../../../shared/auth.js";
import { parseWithSchema } from "../../../shared/validate.js";

/**
 * Every route here requires a valid staff session (getAuthenticatedStaffId)
 * — that IS the authorization check (see PlatformAdminService's own
 * comment for why no finer-grained permission exists yet). Frontend
 * visibility is never the enforcement point; each handler independently
 * re-verifies the session regardless of what the admin UI shows.
 */
export async function platformAdminRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/admin/dashboard", async (request) => {
    await getAuthenticatedStaffId(request);
    return container.platformAdminService.getDashboardCounts();
  });

  fastify.get("/admin/organizations", async (request) => {
    await getAuthenticatedStaffId(request);
    return container.platformAdminService.listOrganizations();
  });

  fastify.patch<{ Params: { organizationId: string } }>(
    "/admin/organizations/:organizationId/status",
    async (request) => {
      await getAuthenticatedStaffId(request);
      const body = parseWithSchema(updateStatusRequestSchema, request.body);
      return container.platformAdminService.setOrganizationStatus(
        request.params.organizationId,
        body.status,
      );
    },
  );

  fastify.get("/admin/users", async (request) => {
    await getAuthenticatedStaffId(request);
    return container.platformAdminService.listUsers();
  });

  fastify.patch<{ Params: { userId: string } }>(
    "/admin/users/:userId/status",
    async (request) => {
      await getAuthenticatedStaffId(request);
      const body = parseWithSchema(updateStatusRequestSchema, request.body);
      return container.platformAdminService.setUserStatus(request.params.userId, body.status);
    },
  );

  fastify.get("/admin/requirements", async (request) => {
    await getAuthenticatedStaffId(request);
    return container.platformAdminService.listOpenRequirements();
  });

  fastify.get("/admin/auctions", async (request) => {
    await getAuthenticatedStaffId(request);
    return container.platformAdminService.listAuctions();
  });

  // --- Catalogue administration (brief §12) ---

  fastify.post("/admin/catalogue/categories", async (request, reply) => {
    await getAuthenticatedStaffId(request);
    const body = parseWithSchema(createProductCategoryRequestSchema, request.body);
    const category = await container.platformAdminService.catalogueService.createCategoryAsPlatformAdmin(body);
    reply.code(201);
    return category;
  });

  fastify.patch<{ Params: { categoryId: string } }>(
    "/admin/catalogue/categories/:categoryId",
    async (request) => {
      await getAuthenticatedStaffId(request);
      const body = parseWithSchema(updateProductCategoryRequestSchema, request.body);
      return container.platformAdminService.catalogueService.updateCategoryAsPlatformAdmin(
        request.params.categoryId,
        body,
      );
    },
  );

  fastify.post("/admin/catalogue/subcategories", async (request, reply) => {
    await getAuthenticatedStaffId(request);
    const body = parseWithSchema(createProductSubcategoryRequestSchema, request.body);
    const subcategory =
      await container.platformAdminService.catalogueService.createSubcategoryAsPlatformAdmin(body);
    reply.code(201);
    return subcategory;
  });

  fastify.patch<{ Params: { subcategoryId: string } }>(
    "/admin/catalogue/subcategories/:subcategoryId",
    async (request) => {
      await getAuthenticatedStaffId(request);
      const body = parseWithSchema(updateProductSubcategoryRequestSchema, request.body);
      return container.platformAdminService.catalogueService.updateSubcategoryAsPlatformAdmin(
        request.params.subcategoryId,
        body,
      );
    },
  );

  fastify.post("/admin/catalogue/products", async (request, reply) => {
    await getAuthenticatedStaffId(request);
    const body = parseWithSchema(createProductRequestSchema, request.body);
    const product = await container.platformAdminService.catalogueService.createProductAsPlatformAdmin(body);
    reply.code(201);
    return product;
  });

  fastify.patch<{ Params: { productId: string } }>(
    "/admin/catalogue/products/:productId",
    async (request) => {
      await getAuthenticatedStaffId(request);
      const body = parseWithSchema(updateProductRequestSchema, request.body);
      return container.platformAdminService.catalogueService.updateProductAsPlatformAdmin(
        request.params.productId,
        body,
      );
    },
  );
}
