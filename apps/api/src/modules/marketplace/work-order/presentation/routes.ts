import { updateWorkOrderStatusRequestSchema } from "@fleetip/contracts/work-order";
import type { FastifyInstance } from "fastify";
import { container } from "../../../../infrastructure/container.js";
import { getAuthenticatedUserId } from "../../../../shared/auth.js";
import { parseWithSchema } from "../../../../shared/validate.js";
import { renderWorkOrderDocument } from "./work-order-document.js";

export async function workOrderRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/work-orders",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.workOrderService.listWorkOrders(userId, request.params.organizationId);
    },
  );

  fastify.get<{ Params: { organizationId: string; quotationId: string } }>(
    "/organizations/:organizationId/quotations/:quotationId/work-order",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.workOrderService.getWorkOrderByQuotationId(
        userId,
        request.params.organizationId,
        request.params.quotationId,
      );
    },
  );

  fastify.get<{ Params: { organizationId: string; workOrderId: string } }>(
    "/organizations/:organizationId/work-orders/:workOrderId",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.workOrderService.getWorkOrder(
        userId,
        request.params.organizationId,
        request.params.workOrderId,
      );
    },
  );

  fastify.get<{ Params: { organizationId: string; workOrderId: string } }>(
    "/organizations/:organizationId/work-orders/:workOrderId/scope-items",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.workOrderService.listScopeItems(
        userId,
        request.params.organizationId,
        request.params.workOrderId,
      );
    },
  );

  fastify.patch<{ Params: { organizationId: string; workOrderId: string } }>(
    "/organizations/:organizationId/work-orders/:workOrderId/status",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(updateWorkOrderStatusRequestSchema, request.body);
      return container.workOrderService.updateWorkOrderStatus(
        userId,
        request.params.organizationId,
        request.params.workOrderId,
        body.status,
      );
    },
  );

  fastify.get<{ Params: { organizationId: string; workOrderId: string } }>(
    "/organizations/:organizationId/work-orders/:workOrderId/print",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      const { workOrder, scopeItems, rentalCompanyName, customerName } =
        await container.workOrderService.getPrintableWorkOrder(
          userId,
          request.params.organizationId,
          request.params.workOrderId,
        );
      const html = renderWorkOrderDocument(workOrder, scopeItems, rentalCompanyName, customerName);
      reply.type("text/html").send(html);
    },
  );
}
