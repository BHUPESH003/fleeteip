import type {
  CommercialQuotation,
  CreateCommercialQuotationRequest,
  CreateQuotationOfferRequest,
  QuotationOffer,
  UpdateCommercialQuotationTermsRequest,
} from "@fleetip/contracts/quotation";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../../../shared/errors.js";
import type { MachineRepositoryPort } from "../../../equipment/domain/ports.js";
import type { OrganizationRepositoryPort } from "../../../organizations/domain/ports.js";
import { PermissionService } from "../../../permissions/application/permission-service.js";
import type { AuctionRepositoryPort } from "../../auction/domain/ports.js";
import type { RequirementRepositoryPort } from "../../rfq/domain/ports.js";
import type { QuotationResponseRepositoryPort } from "../../quotation-response/domain/ports.js";
import { RentalService } from "../../rental/application/rental-service.js";
import { canTransition } from "../domain/quotation-status.js";
import type {
  CommercialQuotationRecord,
  CommercialQuotationRepositoryPort,
  QuotationOfferRecord,
  QuotationOfferRepositoryPort,
} from "../domain/ports.js";

function toQuotation(record: CommercialQuotationRecord): CommercialQuotation {
  return {
    id: record.id,
    rentalCompanyOrganizationId: record.rental_company_organization_id,
    renterOrganizationId: record.renter_organization_id,
    clientSnapshot: record.client_snapshot,
    requirementId: record.requirement_id,
    quotationResponseId: record.quotation_response_id,
    sourceAuctionId: record.source_auction_id,
    referenceNumber: record.reference_number,
    machineId: record.machine_id,
    startDate: record.start_date,
    endDate: record.end_date,
    rate: record.rate,
    rateUnit: record.rate_unit,
    mobilizationCharge: record.mobilization_charge,
    demobilizationCharge: record.demobilization_charge,
    overtimeRate: record.overtime_rate,
    paymentTerms: record.payment_terms,
    shiftStructure: record.shift_structure,
    sundayCondition: record.sunday_condition,
    fuelNorms: record.fuel_norms,
    dehireTerms: record.dehire_terms,
    operatorScope: record.operator_scope,
    noticePeriodDays: record.notice_period_days,
    validityDate: record.validity_date,
    commercialNotes: record.commercial_notes,
    status: record.status,
    createdAt: new Date(record.created_at).toISOString(),
    updatedAt: new Date(record.updated_at).toISOString(),
  };
}

function toOffer(record: QuotationOfferRecord): QuotationOffer {
  return {
    id: record.id,
    quotationId: record.quotation_id,
    offeredByOrganizationId: record.offered_by_organization_id,
    rate: record.rate,
    rateUnit: record.rate_unit,
    startDate: record.start_date,
    endDate: record.end_date,
    notes: record.notes,
    status: record.status,
    createdAt: new Date(record.created_at).toISOString(),
  };
}

const EDITABLE_STATUSES = new Set(["draft", "sent", "negotiating"]);

export class CommercialQuotationService {
  constructor(
    private readonly quotationRepository: CommercialQuotationRepositoryPort,
    private readonly offerRepository: QuotationOfferRepositoryPort,
    private readonly machineRepository: MachineRepositoryPort,
    private readonly organizationRepository: OrganizationRepositoryPort,
    private readonly requirementRepository: RequirementRepositoryPort,
    private readonly quotationResponseRepository: QuotationResponseRepositoryPort,
    private readonly auctionRepository: AuctionRepositoryPort,
    private readonly rentalService: RentalService,
    private readonly permissionService: PermissionService,
  ) {}

  async createQuotation(
    userId: string,
    rentalCompanyOrganizationId: string,
    input: CreateCommercialQuotationRequest,
  ): Promise<CommercialQuotation> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "quotation.manage",
    );

    const machine = await this.machineRepository.findById(input.machineId);
    if (!machine || machine.organization_id !== rentalCompanyOrganizationId) {
      throw new NotFoundError("Machine not found in this organization");
    }
    if (machine.status === "retired") {
      throw new ConflictError("Machine is retired and cannot be quoted");
    }

    if (input.renterOrganizationId) {
      const renterOrganization = await this.organizationRepository.findWithTypeById(
        input.renterOrganizationId,
      );
      if (!renterOrganization || renterOrganization.organization_type_code !== "renter") {
        throw new ValidationError("renterOrganizationId must reference a Renter organization");
      }
    }

    if (input.requirementId) {
      const requirement = await this.requirementRepository.findById(input.requirementId);
      if (!requirement) throw new NotFoundError("Requirement not found");
      if (requirement.status !== "open") {
        throw new ConflictError("Cannot quote against a requirement that is not open");
      }
    }

    if (input.quotationResponseId) {
      const response = await this.quotationResponseRepository.findById(input.quotationResponseId);
      if (!response || response.rental_company_organization_id !== rentalCompanyOrganizationId) {
        throw new NotFoundError("Quotation response not found");
      }
      if (input.requirementId && response.requirement_id !== input.requirementId) {
        throw new ValidationError("quotationResponseId does not belong to the given requirement");
      }
    }

    if (input.sourceAuctionId) {
      await this.assertWonAuction(input.sourceAuctionId, rentalCompanyOrganizationId);
    }

    const referenceNumber = await this.quotationRepository.nextReferenceNumber(
      rentalCompanyOrganizationId,
    );

    const record = await this.quotationRepository.create({
      rentalCompanyOrganizationId,
      renterOrganizationId: input.renterOrganizationId,
      clientSnapshot: input.clientSnapshot,
      requirementId: input.requirementId,
      quotationResponseId: input.quotationResponseId,
      sourceAuctionId: input.sourceAuctionId,
      referenceNumber,
      machineId: input.machineId,
      startDate: input.startDate,
      endDate: input.endDate,
      rate: input.rate,
      rateUnit: input.rateUnit,
      mobilizationCharge: input.mobilizationCharge,
      demobilizationCharge: input.demobilizationCharge,
      overtimeRate: input.overtimeRate,
      paymentTerms: input.paymentTerms,
      shiftStructure: input.shiftStructure,
      sundayCondition: input.sundayCondition,
      fuelNorms: input.fuelNorms,
      dehireTerms: input.dehireTerms,
      operatorScope: input.operatorScope,
      noticePeriodDays: input.noticePeriodDays,
      validityDate: input.validityDate,
      commercialNotes: input.commercialNotes,
    });
    return toQuotation(record);
  }

  // Only the auction's actual winning bidder may formalize the win into a
  // quotation. See docs/marketplace-core-loop-design.md §8 "From
  // AuctionResult to Award".
  private async assertWonAuction(
    sourceAuctionId: string,
    rentalCompanyOrganizationId: string,
  ): Promise<void> {
    const auction = await this.auctionRepository.findById(sourceAuctionId);
    if (!auction) throw new NotFoundError("Auction not found");
    if (auction.status !== "closed") {
      throw new ConflictError("Auction has not closed yet");
    }
    const result = await this.auctionRepository.findResult(sourceAuctionId);
    const bids = result?.winning_bid_id
      ? await this.auctionRepository.listBids(sourceAuctionId)
      : [];
    const winningBid = bids.find((bid) => bid.id === result?.winning_bid_id);
    const winningParticipant = winningBid
      ? await this.auctionRepository.findParticipantById(winningBid.participant_id)
      : undefined;
    if (
      !winningParticipant ||
      winningParticipant.rental_company_organization_id !== rentalCompanyOrganizationId
    ) {
      throw new ValidationError(
        "Only the auction's winning Rental Company may formalize this quotation",
      );
    }
  }

  async getQuotation(
    userId: string,
    organizationId: string,
    quotationId: string,
  ): Promise<CommercialQuotation> {
    await this.requireQuotationPermission(userId, organizationId);
    const record = await this.loadAsParty(organizationId, quotationId);
    return toQuotation(record);
  }

  // A single list endpoint serves both sides — whichever permission the
  // caller's own organization type actually holds decides which query runs.
  async listQuotations(userId: string, organizationId: string): Promise<CommercialQuotation[]> {
    const canManage = await this.permissionService.hasPermission(
      userId,
      organizationId,
      "quotation.manage",
    );
    if (canManage) return this.listQuotationsForRentalCompany(userId, organizationId);
    const canRespond = await this.permissionService.hasPermission(
      userId,
      organizationId,
      "quotation.respond",
    );
    if (canRespond) return this.listQuotationsForRenter(userId, organizationId);
    throw new ForbiddenError();
  }

  async listQuotationsForRentalCompany(
    userId: string,
    rentalCompanyOrganizationId: string,
  ): Promise<CommercialQuotation[]> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "quotation.manage",
    );
    const records = await this.quotationRepository.listByRentalCompany(rentalCompanyOrganizationId);
    return records.map(toQuotation);
  }

  async listQuotationsForRenter(
    userId: string,
    renterOrganizationId: string,
  ): Promise<CommercialQuotation[]> {
    await this.permissionService.requirePermission(
      userId,
      renterOrganizationId,
      "quotation.respond",
    );
    const records = await this.quotationRepository.listByRenter(renterOrganizationId);
    return records.map(toQuotation);
  }

  async updateTerms(
    userId: string,
    rentalCompanyOrganizationId: string,
    quotationId: string,
    updates: UpdateCommercialQuotationTermsRequest,
  ): Promise<CommercialQuotation> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "quotation.manage",
    );
    const existing = await this.loadOwnedByRentalCompany(rentalCompanyOrganizationId, quotationId);
    if (!EDITABLE_STATUSES.has(existing.status)) {
      throw new ConflictError("Terms can only be edited before the quotation is closed out");
    }
    const record = await this.quotationRepository.updateTerms(quotationId, updates);
    return toQuotation(record);
  }

  async sendQuotation(
    userId: string,
    rentalCompanyOrganizationId: string,
    quotationId: string,
  ): Promise<CommercialQuotation> {
    return this.transitionAsRentalCompany(userId, rentalCompanyOrganizationId, quotationId, "sent");
  }

  async withdrawQuotation(
    userId: string,
    rentalCompanyOrganizationId: string,
    quotationId: string,
  ): Promise<CommercialQuotation> {
    return this.transitionAsRentalCompany(
      userId,
      rentalCompanyOrganizationId,
      quotationId,
      "withdrawn",
    );
  }

  async rejectQuotation(
    userId: string,
    renterOrganizationId: string,
    quotationId: string,
  ): Promise<CommercialQuotation> {
    await this.permissionService.requirePermission(
      userId,
      renterOrganizationId,
      "quotation.respond",
    );
    const existing = await this.quotationRepository.findById(quotationId);
    if (!existing || existing.renter_organization_id !== renterOrganizationId) {
      throw new NotFoundError("Quotation not found in this organization");
    }
    if (!canTransition(existing.status, "rejected")) {
      throw new ConflictError(`Cannot reject a quotation that is ${existing.status}`);
    }
    const record = await this.quotationRepository.updateStatus(quotationId, "rejected");
    return toQuotation(record);
  }

  private async transitionAsRentalCompany(
    userId: string,
    rentalCompanyOrganizationId: string,
    quotationId: string,
    status: "sent" | "withdrawn",
  ): Promise<CommercialQuotation> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "quotation.manage",
    );
    const existing = await this.loadOwnedByRentalCompany(rentalCompanyOrganizationId, quotationId);
    if (!canTransition(existing.status, status)) {
      throw new ConflictError(`Cannot transition quotation from ${existing.status} to ${status}`);
    }
    const record = await this.quotationRepository.updateStatus(quotationId, status);
    return toQuotation(record);
  }

  async makeOffer(
    userId: string,
    organizationId: string,
    quotationId: string,
    input: CreateQuotationOfferRequest,
  ): Promise<QuotationOffer> {
    await this.requireQuotationPermission(userId, organizationId);
    const existing = await this.loadAsParty(organizationId, quotationId);
    if (existing.status !== "sent" && existing.status !== "negotiating") {
      throw new ConflictError("A quotation must be sent before it can be negotiated");
    }

    await this.offerRepository.supersedePending(quotationId);
    const offer = await this.offerRepository.create({
      quotationId,
      offeredByOrganizationId: organizationId,
      rate: input.rate,
      rateUnit: input.rateUnit,
      startDate: input.startDate,
      endDate: input.endDate,
      notes: input.notes,
    });
    if (existing.status === "sent") {
      await this.quotationRepository.updateStatus(quotationId, "negotiating");
    }
    return toOffer(offer);
  }

  async listOffers(
    userId: string,
    organizationId: string,
    quotationId: string,
  ): Promise<QuotationOffer[]> {
    await this.requireQuotationPermission(userId, organizationId);
    await this.loadAsParty(organizationId, quotationId);
    const records = await this.offerRepository.listByQuotation(quotationId);
    return records.map(toOffer);
  }

  async acceptOffer(
    userId: string,
    organizationId: string,
    quotationId: string,
    offerId: string,
  ): Promise<CommercialQuotation> {
    await this.requireQuotationPermission(userId, organizationId);
    await this.loadAsParty(organizationId, quotationId);

    const offer = await this.offerRepository.findById(offerId);
    if (!offer || offer.quotation_id !== quotationId) {
      throw new NotFoundError("Offer not found on this quotation");
    }
    if (offer.status !== "pending") {
      throw new ConflictError("Offer is no longer pending");
    }
    if (offer.offered_by_organization_id === organizationId) {
      throw new ForbiddenError("Cannot accept your own offer");
    }

    const accepted = await this.offerRepository.updateStatus(offerId, "accepted");
    const record = await this.quotationRepository.applyAcceptedOffer(quotationId, {
      rate: accepted.rate,
      rateUnit: accepted.rate_unit,
      startDate: accepted.start_date,
      endDate: accepted.end_date,
    });
    return toQuotation(record);
  }

  // Awarding is always the Rental Company's action in this MVP — Rental
  // creation requires rental.manage, which only a Rental Company holds. See
  // docs/marketplace-core-loop-design.md §2/§6.
  async awardQuotation(
    userId: string,
    rentalCompanyOrganizationId: string,
    quotationId: string,
  ): Promise<CommercialQuotation> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "quotation.manage",
    );
    const existing = await this.loadOwnedByRentalCompany(rentalCompanyOrganizationId, quotationId);
    if (!canTransition(existing.status, "awarded")) {
      throw new ConflictError(`Cannot award a quotation that is ${existing.status}`);
    }

    await this.rentalService.createRental(userId, rentalCompanyOrganizationId, {
      machineId: existing.machine_id,
      renterOrganizationId: existing.renter_organization_id ?? undefined,
      clientSnapshot: existing.client_snapshot ?? undefined,
      startDate: existing.start_date,
      endDate: existing.end_date ?? undefined,
      rate: existing.rate,
      rateUnit: existing.rate_unit,
      mobilizationCharge: existing.mobilization_charge ?? undefined,
      demobilizationCharge: existing.demobilization_charge ?? undefined,
      overtimeRate: existing.overtime_rate ?? undefined,
      paymentTerms: existing.payment_terms ?? undefined,
      shiftStructure: existing.shift_structure ?? undefined,
      sundayCondition: existing.sunday_condition ?? undefined,
      fuelNorms: existing.fuel_norms ?? undefined,
      dehireTerms: existing.dehire_terms ?? undefined,
      operatorScope: existing.operator_scope ?? undefined,
      noticePeriodDays: existing.notice_period_days ?? undefined,
    });

    if (existing.requirement_id) {
      const requirement = await this.requirementRepository.findById(existing.requirement_id);
      if (requirement?.status === "open") {
        await this.requirementRepository.updateStatus(existing.requirement_id, "closed");
      }
    }

    const record = await this.quotationRepository.updateStatus(quotationId, "awarded");
    return toQuotation(record);
  }

  private async requireQuotationPermission(userId: string, organizationId: string): Promise<void> {
    const canManage = await this.permissionService.hasPermission(
      userId,
      organizationId,
      "quotation.manage",
    );
    const canRespond =
      !canManage &&
      (await this.permissionService.hasPermission(userId, organizationId, "quotation.respond"));
    if (!canManage && !canRespond) throw new ForbiddenError();
  }

  private async loadAsParty(
    organizationId: string,
    quotationId: string,
  ): Promise<CommercialQuotationRecord> {
    const existing = await this.quotationRepository.findById(quotationId);
    if (!existing) throw new NotFoundError("Quotation not found");
    const isParty =
      existing.rental_company_organization_id === organizationId ||
      existing.renter_organization_id === organizationId;
    if (!isParty) throw new NotFoundError("Quotation not found");
    return (await this.quotationRepository.expireIfDue(quotationId)) ?? existing;
  }

  private async loadOwnedByRentalCompany(
    rentalCompanyOrganizationId: string,
    quotationId: string,
  ): Promise<CommercialQuotationRecord> {
    const existing = await this.quotationRepository.findById(quotationId);
    if (!existing || existing.rental_company_organization_id !== rentalCompanyOrganizationId) {
      throw new NotFoundError("Quotation not found in this organization");
    }
    return (await this.quotationRepository.expireIfDue(quotationId)) ?? existing;
  }
}
