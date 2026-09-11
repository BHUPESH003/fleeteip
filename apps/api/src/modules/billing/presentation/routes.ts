import {
  createInvoiceRequestSchema,
  recordPaymentRequestSchema,
  updateInvoiceStatusRequestSchema,
} from "@fleetip/contracts/billing";
import type { FastifyInstance } from "fastify";
import { container } from "../../../infrastructure/container.js";
import { getAuthenticatedUserId } from "../../../shared/auth.js";
import { parseWithSchema } from "../../../shared/validate.js";

export async function billingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/invoices",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(createInvoiceRequestSchema, request.body);
      const invoice = await container.billingService.createInvoice(
        userId,
        request.params.organizationId,
        body,
      );
      reply.code(201);
      return invoice;
    },
  );

  fastify.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/invoices",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.billingService.listInvoices(userId, request.params.organizationId);
    },
  );

  fastify.get<{ Params: { organizationId: string; invoiceId: string } }>(
    "/organizations/:organizationId/invoices/:invoiceId",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.billingService.getInvoiceDetail(
        userId,
        request.params.organizationId,
        request.params.invoiceId,
      );
    },
  );

  fastify.patch<{ Params: { organizationId: string; invoiceId: string } }>(
    "/organizations/:organizationId/invoices/:invoiceId/status",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(updateInvoiceStatusRequestSchema, request.body);
      return container.billingService.updateInvoiceStatus(
        userId,
        request.params.organizationId,
        request.params.invoiceId,
        body.status,
      );
    },
  );

  fastify.post<{ Params: { organizationId: string; invoiceId: string } }>(
    "/organizations/:organizationId/invoices/:invoiceId/payments",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(recordPaymentRequestSchema, request.body);
      const invoice = await container.billingService.recordPayment(
        userId,
        request.params.organizationId,
        request.params.invoiceId,
        body,
      );
      reply.code(201);
      return invoice;
    },
  );
}
