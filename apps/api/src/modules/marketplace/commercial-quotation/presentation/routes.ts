import {
  createCommercialQuotationRequestSchema,
  createQuotationOfferRequestSchema,
  updateCommercialQuotationTermsRequestSchema,
} from "@fleetip/contracts/quotation";
import type { FastifyInstance } from "fastify";
import { container } from "../../../../infrastructure/container.js";
import { getAuthenticatedUserId } from "../../../../shared/auth.js";
import { parseWithSchema } from "../../../../shared/validate.js";

export async function commercialQuotationRoutes(fastify: FastifyInstance): Promise<void> {
  // Feeds the "known Renter" picker on the create-quotation form — see
  // CommercialQuotationService.listRenterOrganizations.
  fastify.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/renter-organizations",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.commercialQuotationService.listRenterOrganizations(
        userId,
        request.params.organizationId,
      );
    },
  );

  // Mirrors the route above for the Renter side — see
  // CommercialQuotationService.listRentalCompanyOrganizations.
  fastify.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/rental-company-organizations",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.commercialQuotationService.listRentalCompanyOrganizations(
        userId,
        request.params.organizationId,
      );
    },
  );

  fastify.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/quotations",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(createCommercialQuotationRequestSchema, request.body);
      const quotation = await container.commercialQuotationService.createQuotation(
        userId,
        request.params.organizationId,
        body,
      );
      reply.code(201);
      return quotation;
    },
  );

  fastify.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/quotations",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.commercialQuotationService.listQuotations(
        userId,
        request.params.organizationId,
      );
    },
  );

  fastify.get<{ Params: { organizationId: string; quotationId: string } }>(
    "/organizations/:organizationId/quotations/:quotationId",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.commercialQuotationService.getQuotation(
        userId,
        request.params.organizationId,
        request.params.quotationId,
      );
    },
  );

  fastify.patch<{ Params: { organizationId: string; quotationId: string } }>(
    "/organizations/:organizationId/quotations/:quotationId/terms",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(updateCommercialQuotationTermsRequestSchema, request.body);
      return container.commercialQuotationService.updateTerms(
        userId,
        request.params.organizationId,
        request.params.quotationId,
        body,
      );
    },
  );

  fastify.post<{ Params: { organizationId: string; quotationId: string } }>(
    "/organizations/:organizationId/quotations/:quotationId/send",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.commercialQuotationService.sendQuotation(
        userId,
        request.params.organizationId,
        request.params.quotationId,
      );
    },
  );

  fastify.post<{ Params: { organizationId: string; quotationId: string } }>(
    "/organizations/:organizationId/quotations/:quotationId/withdraw",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.commercialQuotationService.withdrawQuotation(
        userId,
        request.params.organizationId,
        request.params.quotationId,
      );
    },
  );

  fastify.post<{ Params: { organizationId: string; quotationId: string } }>(
    "/organizations/:organizationId/quotations/:quotationId/accept",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.commercialQuotationService.acceptQuotation(
        userId,
        request.params.organizationId,
        request.params.quotationId,
      );
    },
  );

  fastify.post<{ Params: { organizationId: string; quotationId: string } }>(
    "/organizations/:organizationId/quotations/:quotationId/reject",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.commercialQuotationService.rejectQuotation(
        userId,
        request.params.organizationId,
        request.params.quotationId,
      );
    },
  );

  fastify.post<{ Params: { organizationId: string; quotationId: string } }>(
    "/organizations/:organizationId/quotations/:quotationId/award",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.commercialQuotationService.awardQuotation(
        userId,
        request.params.organizationId,
        request.params.quotationId,
      );
    },
  );

  fastify.get<{ Params: { organizationId: string; quotationId: string } }>(
    "/organizations/:organizationId/quotations/:quotationId/offers",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.commercialQuotationService.listOffers(
        userId,
        request.params.organizationId,
        request.params.quotationId,
      );
    },
  );

  fastify.post<{ Params: { organizationId: string; quotationId: string } }>(
    "/organizations/:organizationId/quotations/:quotationId/offers",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(createQuotationOfferRequestSchema, request.body);
      const offer = await container.commercialQuotationService.makeOffer(
        userId,
        request.params.organizationId,
        request.params.quotationId,
        body,
      );
      reply.code(201);
      return offer;
    },
  );

  fastify.post<{ Params: { organizationId: string; quotationId: string; offerId: string } }>(
    "/organizations/:organizationId/quotations/:quotationId/offers/:offerId/accept",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.commercialQuotationService.acceptOffer(
        userId,
        request.params.organizationId,
        request.params.quotationId,
        request.params.offerId,
      );
    },
  );
}
