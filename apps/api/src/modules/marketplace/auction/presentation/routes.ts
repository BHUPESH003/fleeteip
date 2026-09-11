import {
  createAuctionRequestSchema,
  placeBidRequestSchema,
  reviewParticipantRequestSchema,
} from "@fleetip/contracts/auction";
import type { FastifyInstance } from "fastify";
import { container } from "../../../../infrastructure/container.js";
import { getAuthenticatedUserId } from "../../../../shared/auth.js";
import { parseWithSchema } from "../../../../shared/validate.js";

export async function auctionRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { organizationId: string; requirementId: string } }>(
    "/organizations/:organizationId/requirements/:requirementId/auctions",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(createAuctionRequestSchema, {
        ...(typeof request.body === "object" && request.body !== null ? request.body : {}),
        requirementId: request.params.requirementId,
      });
      const auction = await container.auctionService.createAuction(
        userId,
        request.params.organizationId,
        body,
      );
      reply.code(201);
      return auction;
    },
  );

  fastify.get<{ Params: { organizationId: string; requirementId: string } }>(
    "/organizations/:organizationId/requirements/:requirementId/auctions",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.auctionService.listAuctionsForRequirement(
        userId,
        request.params.organizationId,
        request.params.requirementId,
      );
    },
  );

  // A Rental Company locating the auction for a Requirement it discovered.
  fastify.get<{ Params: { organizationId: string; requirementId: string } }>(
    "/organizations/:organizationId/requirement-discovery/:requirementId/auction",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.auctionService.getActiveAuctionForRequirement(
        userId,
        request.params.organizationId,
        request.params.requirementId,
      );
    },
  );

  fastify.get<{ Params: { organizationId: string; auctionId: string } }>(
    "/organizations/:organizationId/auctions/:auctionId",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.auctionService.getAuctionDetail(
        userId,
        request.params.organizationId,
        request.params.auctionId,
      );
    },
  );

  fastify.get<{ Params: { organizationId: string; auctionId: string } }>(
    "/organizations/:organizationId/auctions/:auctionId/events",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.auctionService.listEvents(
        userId,
        request.params.organizationId,
        request.params.auctionId,
      );
    },
  );

  fastify.post<{ Params: { organizationId: string; auctionId: string } }>(
    "/organizations/:organizationId/auctions/:auctionId/participants",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      const participant = await container.auctionService.requestToJoin(
        userId,
        request.params.organizationId,
        request.params.auctionId,
      );
      reply.code(201);
      return participant;
    },
  );

  fastify.patch<{ Params: { organizationId: string; auctionId: string; participantId: string } }>(
    "/organizations/:organizationId/auctions/:auctionId/participants/:participantId",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(reviewParticipantRequestSchema, request.body);
      return container.auctionService.reviewParticipant(
        userId,
        request.params.organizationId,
        request.params.auctionId,
        request.params.participantId,
        body.status,
      );
    },
  );

  // Deliberately a separate route from the PATCH review endpoint above —
  // pre-close approval-to-bid and post-close selection-of-the-winner are
  // distinct lifecycles. See AuctionService.selectParticipant.
  fastify.post<{ Params: { organizationId: string; auctionId: string; participantId: string } }>(
    "/organizations/:organizationId/auctions/:auctionId/participants/:participantId/select",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.auctionService.selectParticipant(
        userId,
        request.params.organizationId,
        request.params.auctionId,
        request.params.participantId,
      );
    },
  );

  fastify.post<{ Params: { organizationId: string; auctionId: string } }>(
    "/organizations/:organizationId/auctions/:auctionId/bids",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      const body = parseWithSchema(placeBidRequestSchema, request.body);
      const bid = await container.auctionService.placeBid(
        userId,
        request.params.organizationId,
        request.params.auctionId,
        body.amount,
      );
      reply.code(201);
      return bid;
    },
  );

  fastify.post<{ Params: { organizationId: string; auctionId: string } }>(
    "/organizations/:organizationId/auctions/:auctionId/close",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.auctionService.closeAuctionEarly(
        userId,
        request.params.organizationId,
        request.params.auctionId,
      );
    },
  );

  fastify.post<{ Params: { organizationId: string; auctionId: string } }>(
    "/organizations/:organizationId/auctions/:auctionId/cancel",
    async (request) => {
      const userId = await getAuthenticatedUserId(request);
      return container.auctionService.cancelAuction(
        userId,
        request.params.organizationId,
        request.params.auctionId,
      );
    },
  );
}
