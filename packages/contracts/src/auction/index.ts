import { z } from "zod";

export const auctionStatusSchema = z.enum(["scheduled", "live", "closed", "cancelled"]);
export type AuctionStatus = z.infer<typeof auctionStatusSchema>;

// 'ascending' = highest bid wins (legacy "H1", equipment/base-price style).
// 'descending' = lowest bid wins (legacy "L1", service/max-price style).
export const biddingDirectionSchema = z.enum(["ascending", "descending"]);
export type BiddingDirection = z.infer<typeof biddingDirectionSchema>;

export const auctionSchema = z.object({
  id: z.string().uuid(),
  requirementId: z.string().uuid(),
  createdByOrganizationId: z.string().uuid(),
  biddingDirection: biddingDirectionSchema,
  basePrice: z.number().positive(),
  maxBidsPerParticipant: z.number().int().positive().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  status: auctionStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Auction = z.infer<typeof auctionSchema>;

export const createAuctionRequestSchema = z
  .object({
    requirementId: z.string().uuid(),
    biddingDirection: biddingDirectionSchema,
    basePrice: z.number().positive(),
    maxBidsPerParticipant: z.number().int().positive().optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  })
  .refine((data) => new Date(data.endsAt) > new Date(data.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });
export type CreateAuctionRequest = z.infer<typeof createAuctionRequestSchema>;

export const participantStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type ParticipantStatus = z.infer<typeof participantStatusSchema>;

export const auctionParticipantSchema = z.object({
  id: z.string().uuid(),
  auctionId: z.string().uuid(),
  rentalCompanyOrganizationId: z.string().uuid(),
  status: participantStatusSchema,
  createdAt: z.string().datetime(),
});
export type AuctionParticipant = z.infer<typeof auctionParticipantSchema>;

export const reviewParticipantRequestSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});
export type ReviewParticipantRequest = z.infer<typeof reviewParticipantRequestSchema>;

export const auctionBidSchema = z.object({
  id: z.string().uuid(),
  auctionId: z.string().uuid(),
  participantId: z.string().uuid(),
  amount: z.number().positive(),
  createdAt: z.string().datetime(),
});
export type AuctionBid = z.infer<typeof auctionBidSchema>;

export const placeBidRequestSchema = z.object({
  amount: z.number().positive(),
});
export type PlaceBidRequest = z.infer<typeof placeBidRequestSchema>;

export const auctionResultSchema = z.object({
  auctionId: z.string().uuid(),
  winningBidId: z.string().uuid().nullable(),
  winningAmount: z.number().positive().nullable(),
  closedAt: z.string().datetime(),
});
export type AuctionResult = z.infer<typeof auctionResultSchema>;

export const auctionEventSchema = z.object({
  id: z.string().uuid(),
  auctionId: z.string().uuid(),
  eventType: z.string(),
  actorOrganizationId: z.string().uuid().nullable(),
  payload: z.record(z.unknown()).nullable(),
  createdAt: z.string().datetime(),
});
export type AuctionEvent = z.infer<typeof auctionEventSchema>;

// Combined view for the auction detail/bidding screen.
export const auctionDetailSchema = z.object({
  auction: auctionSchema,
  participants: z.array(auctionParticipantSchema),
  bids: z.array(auctionBidSchema),
  result: auctionResultSchema.nullable(),
});
export type AuctionDetail = z.infer<typeof auctionDetailSchema>;
