import type { FastifyInstance, FastifyReply } from "fastify";
import { container } from "../../infrastructure/container.js";
import { getAuthenticatedUserId } from "../../shared/auth.js";
import type { GeneratedDocument } from "./document-service.js";

function send(reply: FastifyReply, document: GeneratedDocument) {
  reply
    .type("application/pdf")
    .header("Content-Disposition", `attachment; filename="${document.filename}"`)
    .header("Cache-Control", "no-store")
    .send(document.buffer);
}

export async function documentRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { organizationId: string; quotationId: string } }>(
    "/organizations/:organizationId/quotations/:quotationId/pdf",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      send(reply, await container.documentService.quotationPdf(userId, request.params.organizationId, request.params.quotationId));
    },
  );

  fastify.get<{ Params: { organizationId: string; workOrderId: string } }>(
    "/organizations/:organizationId/work-orders/:workOrderId/pdf",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      send(reply, await container.documentService.workOrderPdf(userId, request.params.organizationId, request.params.workOrderId));
    },
  );

  fastify.get<{ Params: { organizationId: string; rentalId: string }; Querystring: { month?: string } }>(
    "/organizations/:organizationId/rentals/:rentalId/timesheet.pdf",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      const month = request.query.month ?? new Date().toISOString().slice(0, 7);
      send(reply, await container.documentService.timesheetPdf(userId, request.params.organizationId, request.params.rentalId, month));
    },
  );

  fastify.get<{ Params: { organizationId: string; invoiceId: string } }>(
    "/organizations/:organizationId/invoices/:invoiceId/pdf",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      send(reply, await container.documentService.invoicePdf(userId, request.params.organizationId, request.params.invoiceId));
    },
  );
}
