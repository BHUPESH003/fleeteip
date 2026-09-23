import type { Organization } from "@fleetip/contracts/organization";
import type {
  CommercialQuotation,
  CreateCommercialQuotationRequest,
  CreateQuotationOfferRequest,
  CreateQuotationScopeItemRequest,
  ProposeAlternateDatesRequest,
  QuotationOffer,
  QuotationScopeItem,
  UpdateCommercialQuotationTermsRequest,
} from "@fleetip/contracts/quotation";
import { addDuration } from "@fleetip/contracts/shared";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../../../shared/errors.js";
import type { ProductRepositoryPort } from "../../../catalogue/domain/ports.js";
import type { MachineRepositoryPort } from "../../../equipment/domain/ports.js";
import type {
  OrganizationRepositoryPort,
  OrganizationWithTypeRecord,
} from "../../../organizations/domain/ports.js";
import { PermissionService } from "../../../permissions/application/permission-service.js";
import type { AuctionRepositoryPort } from "../../auction/domain/ports.js";
import type { RequirementRecord, RequirementRepositoryPort } from "../../rfq/domain/ports.js";
import type { QuotationResponseRepositoryPort } from "../../quotation-response/domain/ports.js";
import { NotificationService } from "../../../notification/application/notification-service.js";
import { RentalService } from "../../rental/application/rental-service.js";
import type { WorkOrderCreationPort } from "../../work-order/domain/ports.js";
import { canTransition } from "../domain/quotation-status.js";
import type {
  CommercialQuotationRecord,
  CommercialQuotationRepositoryPort,
  QuotationOfferRecord,
  QuotationOfferRepositoryPort,
  QuotationScopeItemRecord,
  QuotationScopeItemRepositoryPort,
} from "../domain/ports.js";

function toQuotation(
  record: CommercialQuotationRecord,
  extra?: { machineAssetCode?: string | null; productName?: string | null },
): CommercialQuotation {
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
    fuelScope: record.fuel_scope,
    dehireTerms: record.dehire_terms,
    operatorScope: record.operator_scope,
    accommodationScope: record.accommodation_scope,
    workingHours: record.working_hours,
    workingDaysPerWeek: record.working_days_per_week,
    minimumRentalPeriodValue: record.minimum_rental_period_value,
    minimumRentalPeriodUnit: record.minimum_rental_period_unit,
    gstTerms: record.gst_terms,
    noticePeriodDays: record.notice_period_days,
    validityDate: record.validity_date,
    commercialNotes: record.commercial_notes,
    companyTerms: record.company_terms,
    status: record.status,
    renterAcceptedAt: record.renter_accepted_at
      ? new Date(record.renter_accepted_at).toISOString()
      : null,
    proposedAlternateStartDate: record.proposed_alternate_start_date,
    proposedAlternateEndDate: record.proposed_alternate_end_date,
    alternateDateStatus: record.alternate_date_status,
    alternateDateReason: record.alternate_date_reason,
    createdAt: new Date(record.created_at).toISOString(),
    updatedAt: new Date(record.updated_at).toISOString(),
    machineAssetCode: extra?.machineAssetCode ?? null,
    productName: extra?.productName ?? null,
  };
}

function toOrganization(record: OrganizationWithTypeRecord): Organization {
  return {
    id: record.id,
    organizationTypeCode: record.organization_type_code as "rental_company" | "renter",
    name: record.name,
    code: record.code,
    createdAt: new Date(record.created_at).toISOString(),
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

function toScopeItem(record: QuotationScopeItemRecord): QuotationScopeItem {
  return {
    id: record.id,
    quotationId: record.quotation_id,
    item: record.item,
    responsibleParty: record.responsible_party,
    notes: record.notes,
    createdAt: new Date(record.created_at).toISOString(),
  };
}

const EDITABLE_STATUSES = new Set(["draft", "sent", "negotiating"]);

export class CommercialQuotationService {
  constructor(
    private readonly quotationRepository: CommercialQuotationRepositoryPort,
    private readonly offerRepository: QuotationOfferRepositoryPort,
    private readonly scopeItemRepository: QuotationScopeItemRepositoryPort,
    private readonly machineRepository: MachineRepositoryPort,
    private readonly productRepository: ProductRepositoryPort,
    private readonly organizationRepository: OrganizationRepositoryPort,
    private readonly requirementRepository: RequirementRepositoryPort,
    private readonly quotationResponseRepository: QuotationResponseRepositoryPort,
    private readonly auctionRepository: AuctionRepositoryPort,
    private readonly rentalService: RentalService,
    private readonly workOrderService: WorkOrderCreationPort,
    private readonly permissionService: PermissionService,
    private readonly notificationService: NotificationService,
  ) {}

  // Notification failures must never block the real business action they're
  // attached to — this is a best-effort side effect, not part of the
  // transaction.
  private async notify(input: Parameters<NotificationService["notify"]>[0]): Promise<void> {
    try {
      await this.notificationService.notify(input);
    } catch {
      // swallow — see comment above.
    }
  }

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

    let requirement: RequirementRecord | undefined;
    if (input.requirementId) {
      requirement = await this.requirementRepository.findById(input.requirementId);
      if (!requirement) throw new NotFoundError("Requirement not found");
      if (requirement.status !== "open") {
        throw new ConflictError("Cannot quote against a requirement that is not open");
      }
      // A quotation created against a Requirement must stay tied to that
      // Requirement's own renter — otherwise a client could send a
      // requirementId from one Renter alongside a renterOrganizationId for
      // another and the two would silently diverge.
      if (
        input.renterOrganizationId &&
        input.renterOrganizationId !== requirement.renter_organization_id
      ) {
        throw new ValidationError(
          "renterOrganizationId must match the Requirement's renter organization",
        );
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
      await this.assertSelectedParticipant(input.sourceAuctionId, rentalCompanyOrganizationId);
    }

    const referenceNumber = await this.quotationRepository.nextReferenceNumber(
      rentalCompanyOrganizationId,
    );

    // Locked to the requirement's own requestedStartDate/duration, never
    // trusting the caller for them once a requirement is attached — same
    // reasoning as the rateUnit lock just below. A requirement with no
    // expectedDurationValue leaves endDate as the caller's own choice
    // (open-ended is a legitimate answer there).
    const startDate = requirement?.requested_start_date ?? input.startDate;
    const endDate =
      requirement?.expected_duration_value && requirement.expected_duration_unit
        ? addDuration(
            startDate,
            requirement.expected_duration_value,
            requirement.expected_duration_unit,
          )
        : input.endDate;

    const record = await this.quotationRepository.create({
      rentalCompanyOrganizationId,
      renterOrganizationId: input.renterOrganizationId,
      clientSnapshot: input.clientSnapshot,
      requirementId: input.requirementId,
      quotationResponseId: input.quotationResponseId,
      sourceAuctionId: input.sourceAuctionId,
      referenceNumber,
      machineId: input.machineId,
      startDate,
      endDate,
      rate: input.rate,
      // Locked to the requirement's own expectedDurationUnit when it has
      // one, never trusting the caller for it — same reasoning as
      // QuotationResponseService.submitResponse's indicativeRateUnit: a
      // formal quotation quoted in a different unit than the requirement
      // asked for defeats the point of asking for one at all.
      rateUnit: requirement?.expected_duration_unit ?? input.rateUnit,
      mobilizationCharge: input.mobilizationCharge,
      demobilizationCharge: input.demobilizationCharge,
      overtimeRate: input.overtimeRate,
      paymentTerms: input.paymentTerms,
      shiftStructure: input.shiftStructure,
      sundayCondition: input.sundayCondition,
      fuelNorms: input.fuelNorms,
      fuelScope: input.fuelScope,
      dehireTerms: input.dehireTerms,
      operatorScope: input.operatorScope,
      accommodationScope: input.accommodationScope,
      workingHours: input.workingHours,
      workingDaysPerWeek: input.workingDaysPerWeek,
      minimumRentalPeriodValue: input.minimumRentalPeriodValue,
      minimumRentalPeriodUnit: input.minimumRentalPeriodUnit,
      gstTerms: input.gstTerms,
      noticePeriodDays: input.noticePeriodDays,
      validityDate: input.validityDate,
      commercialNotes: input.commercialNotes,
      companyTerms: input.companyTerms,
    });
    return toQuotation(record);
  }

  // Only the participant the auction owner explicitly selected (post-close)
  // may formalize the win into a quotation — deliberately NOT "whoever had
  // the leading bid". The bid-computed leader is only ever a suggestion;
  // without this gate a Rental Company could award itself with zero Renter
  // action once it happened to be ranked first. See
  // docs/marketplace-core-loop-design.md §8 and AuctionService.selectParticipant.
  private async assertSelectedParticipant(
    sourceAuctionId: string,
    rentalCompanyOrganizationId: string,
  ): Promise<void> {
    const auction = await this.auctionRepository.findById(sourceAuctionId);
    if (!auction) throw new NotFoundError("Auction not found");
    if (auction.status !== "closed") {
      throw new ConflictError("Auction has not closed yet");
    }
    const participant = await this.auctionRepository.findParticipantByOrganization(
      sourceAuctionId,
      rentalCompanyOrganizationId,
    );
    if (!participant || participant.status !== "selected") {
      throw new ValidationError(
        "Only the participant selected by the auction owner may formalize this quotation",
      );
    }
  }

  // Feeds the "known Renter" picker on the create-quotation form — a name
  // lookup for the counterparty selector, not a general org directory.
  async listRenterOrganizations(
    userId: string,
    rentalCompanyOrganizationId: string,
  ): Promise<Organization[]> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "quotation.manage",
    );
    const records = await this.organizationRepository.listByType("renter");
    return records.map(toOrganization);
  }

  // Mirrors listRenterOrganizations for the other side — lets a Renter
  // resolve which Rental Company sent it a quotation, instead of showing a
  // raw organization id in its own quotations list.
  async listRentalCompanyOrganizations(
    userId: string,
    renterOrganizationId: string,
  ): Promise<Organization[]> {
    await this.permissionService.requirePermission(
      userId,
      renterOrganizationId,
      "quotation.respond",
    );
    const records = await this.organizationRepository.listByType("rental_company");
    return records.map(toOrganization);
  }

  // A Renter has no equipment.manage permission on the Rental Company's org,
  // so it can never resolve the machine/product itself the way the Rental
  // Company's own quotation view does — resolve it here instead. Same "look
  // up server-side, don't grant the underlying permission" shape as
  // RentalService.listRentals's machineAssetCode/rentalCompanyOrganizationName.
  // Two lookups per quotation is the same order of cost as that existing
  // precedent, not a new N+1 pattern — fine at this app's per-Renter
  // quotation-count scale.
  private async resolveMachineInfoForRenter(
    record: CommercialQuotationRecord,
  ): Promise<{ machineAssetCode: string | null; productName: string | null }> {
    const machine = await this.machineRepository.findById(record.machine_id);
    if (!machine) return { machineAssetCode: null, productName: null };
    const product = await this.productRepository.findById(machine.product_id);
    return {
      machineAssetCode: machine.asset_code,
      productName: product ? `${product.manufacturer} ${product.name}` : null,
    };
  }

  async getQuotation(
    userId: string,
    organizationId: string,
    quotationId: string,
  ): Promise<CommercialQuotation> {
    await this.requireQuotationPermission(userId, organizationId);
    const record = await this.loadAsParty(organizationId, quotationId);
    if (record.renter_organization_id === organizationId) {
      return toQuotation(record, await this.resolveMachineInfoForRenter(record));
    }
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
    return records.map((record) => toQuotation(record));
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
    // A draft is the Rental Company still drafting terms — not yet a real
    // offer, so the Renter never sees it until it's actually sent.
    return Promise.all(
      records
        .filter((record) => record.status !== "draft")
        .map(async (record) => toQuotation(record, await this.resolveMachineInfoForRenter(record))),
    );
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

  // Category/equipment-specific responsibilities (wire rope scope, ground
  // preparation, support crane, ...) — a structured collection rather than
  // an ever-growing set of *Scope columns. Only the drafting Rental Company
  // adds/removes items, same editable-status gate as updateTerms; either
  // party may read the list (same visibility as offers/terms).
  async addScopeItem(
    userId: string,
    rentalCompanyOrganizationId: string,
    quotationId: string,
    input: CreateQuotationScopeItemRequest,
  ): Promise<QuotationScopeItem> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "quotation.manage",
    );
    const existing = await this.loadOwnedByRentalCompany(rentalCompanyOrganizationId, quotationId);
    if (!EDITABLE_STATUSES.has(existing.status)) {
      throw new ConflictError("Scope items can only be edited before the quotation is closed out");
    }
    const record = await this.scopeItemRepository.create({
      quotationId,
      item: input.item,
      responsibleParty: input.responsibleParty,
      notes: input.notes,
    });
    return toScopeItem(record);
  }

  async listScopeItems(
    userId: string,
    organizationId: string,
    quotationId: string,
  ): Promise<QuotationScopeItem[]> {
    await this.requireQuotationPermission(userId, organizationId);
    await this.loadAsParty(organizationId, quotationId);
    const records = await this.scopeItemRepository.listByQuotation(quotationId);
    return records.map(toScopeItem);
  }

  async removeScopeItem(
    userId: string,
    rentalCompanyOrganizationId: string,
    quotationId: string,
    scopeItemId: string,
  ): Promise<void> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "quotation.manage",
    );
    const existing = await this.loadOwnedByRentalCompany(rentalCompanyOrganizationId, quotationId);
    if (!EDITABLE_STATUSES.has(existing.status)) {
      throw new ConflictError("Scope items can only be edited before the quotation is closed out");
    }
    const item = await this.scopeItemRepository.findById(scopeItemId);
    if (!item || item.quotation_id !== quotationId) {
      throw new NotFoundError("Scope item not found on this quotation");
    }
    await this.scopeItemRepository.delete(scopeItemId);
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

  // The Renter's explicit consent gate awardQuotation checks — see the
  // comment above that method.
  //
  // "Accept" must accept whatever is actually on the table, not whatever
  // rate happens to be stored on the quotation row — that field is only
  // ever updated by applyAcceptedOffer/updateTerms, so while a counter-offer
  // from the Rental Company is still pending (not yet accepted by anyone),
  // it's stale. If the Rental Company's own offer is the one still pending,
  // apply it first so acceptance actually attaches to those terms — don't
  // rely on the caller to have called acceptOffer first (defense in depth;
  // the frontend also sequences this correctly, but the server must hold
  // regardless of which client calls this). A pending offer that is the
  // *Renter's own* (not yet responded to) is left alone — nothing to apply.
  async acceptQuotation(
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
    if (existing.status !== "sent" && existing.status !== "negotiating") {
      throw new ConflictError(`Cannot accept a quotation that is ${existing.status}`);
    }
    const offers = await this.offerRepository.listByQuotation(quotationId);
    const pendingOffer = offers.find((offer) => offer.status === "pending");
    if (pendingOffer && pendingOffer.offered_by_organization_id !== renterOrganizationId) {
      await this.offerRepository.updateStatus(pendingOffer.id, "accepted");
      await this.quotationRepository.applyAcceptedOffer(quotationId, {
        rate: pendingOffer.rate,
        rateUnit: pendingOffer.rate_unit,
        startDate: pendingOffer.start_date,
        endDate: pendingOffer.end_date,
      });
    }
    const record = await this.quotationRepository.setRenterAccepted(quotationId, true);
    const renter = await this.organizationRepository.findById(renterOrganizationId);
    await this.notify({
      recipientOrganizationId: record.rental_company_organization_id,
      type: "quotation.accepted",
      title: "Quotation accepted",
      message: `${renter?.name ?? "The Renter"} accepted your quotation (${record.reference_number}) — you can now award it.`,
      relatedResourceType: "quotation",
      relatedResourceId: record.id,
    });
    return toQuotation(record);
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
    const renter = await this.organizationRepository.findById(renterOrganizationId);
    await this.notify({
      recipientOrganizationId: record.rental_company_organization_id,
      type: "quotation.rejected",
      title: "Quotation rejected",
      message: `Your quotation (${record.reference_number}) was rejected by ${renter?.name ?? "the Renter"}.`,
      relatedResourceType: "quotation",
      relatedResourceId: record.id,
    });
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
    if (status === "sent" && record.renter_organization_id) {
      const rentalCompany = await this.organizationRepository.findById(rentalCompanyOrganizationId);
      await this.notify({
        recipientOrganizationId: record.renter_organization_id,
        type: "quotation.sent",
        title: "Quotation received",
        message: `${rentalCompany?.name ?? "A Rental Company"} sent you a quotation (${record.reference_number}).`,
        relatedResourceType: "quotation",
        relatedResourceId: record.id,
      });
    }
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
      // Dates are no longer a negotiable field via counter-offer — once
      // locked at creation (or changed via the explicit alternate-dates
      // request/approval flow), the quotation's own current dates carry
      // forward unchanged. Ignoring the caller here rather than validating
      // and rejecting keeps the existing counter-offer UI (which still only
      // ever sends the quotation's current dates back) working with no
      // frontend change required.
      startDate: existing.start_date,
      endDate: existing.end_date ?? undefined,
      notes: input.notes,
    });
    const isFirstOffer = existing.status === "sent";
    if (isFirstOffer) {
      await this.quotationRepository.updateStatus(quotationId, "negotiating");
    }
    const recipientOrganizationId =
      organizationId === existing.rental_company_organization_id
        ? existing.renter_organization_id
        : existing.rental_company_organization_id;
    if (recipientOrganizationId) {
      const actingOrg = await this.organizationRepository.findById(organizationId);
      await this.notify({
        recipientOrganizationId,
        type: "quotation.negotiation_offer",
        title: isFirstOffer ? "Negotiation started" : "New counter-offer",
        message: `${actingOrg?.name ?? "A counterparty"} made a counter-offer of ${input.rate}/${input.rateUnit} on quotation ${existing.reference_number}.`,
        relatedResourceType: "quotation",
        relatedResourceId: quotationId,
      });
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
    const accepter = await this.organizationRepository.findById(organizationId);
    await this.notify({
      recipientOrganizationId: accepted.offered_by_organization_id,
      type: "quotation.offer_accepted",
      title: "Offer accepted",
      message: `${accepter?.name ?? "The counterparty"} accepted your offer of ${accepted.rate}/${accepted.rate_unit} on quotation ${record.reference_number}.`,
      relatedResourceType: "quotation",
      relatedResourceId: quotationId,
    });
    return toQuotation(record);
  }

  // Awarding always converts the quotation into a Rental via the Rental
  // Company's own action (Rental creation requires rental.manage, which only
  // a Rental Company holds — see docs/marketplace-core-loop-design.md §2/§6).
  // But the Rental Company can no longer award unilaterally: whenever a real
  // in-app Renter is on the other end, the Renter must have explicitly
  // accepted first (acceptQuotation, below) — closes the same "award to
  // self" gap already closed for the auction path (selectParticipant/
  // assertSelectedParticipant). An external client (clientSnapshot, no
  // renterOrganizationId) has no user account to click Accept, so that
  // sub-case is unchanged.
  //
  // A Path C (sourceAuctionId) quotation used to be exempt too, on the
  // reasoning that the Renter's earlier auction participant selection was
  // already that consent. That was wrong and has been reverted: selecting a
  // participant only picks WHO gets to quote, not an agreement to whatever
  // rate/terms that participant later sets in the CommercialQuotation — the
  // Rental Company could (and did) send Path C terms and award them
  // unilaterally, with the Renter never seeing an Accept/counter-offer
  // option at all. Path C is now held to exactly the same rule as Path A/B.
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
    if (existing.renter_organization_id && !existing.renter_accepted_at) {
      throw new ConflictError("The Renter has not accepted this quotation yet");
    }

    const rental = await this.rentalService.createRental(userId, rentalCompanyOrganizationId, {
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

    let projectId: string | undefined;
    if (existing.requirement_id) {
      const requirement = await this.requirementRepository.findById(existing.requirement_id);
      if (requirement?.status === "open") {
        await this.requirementRepository.updateStatus(existing.requirement_id, "closed");
      }
      projectId = requirement?.project_id;
    }

    const record = await this.quotationRepository.updateStatus(quotationId, "awarded");

    // The Work Order is the finalized commercial order — created here,
    // automatically, from the same terms just awarded, never hand-entered.
    // See docs for this phase's brief §10.
    const scopeItems = await this.scopeItemRepository.listByQuotation(quotationId);
    await this.workOrderService.createFromAward(
      {
        quotationId: record.id,
        rentalId: rental.id,
        rentalCompanyOrganizationId,
        renterOrganizationId: record.renter_organization_id ?? undefined,
        clientSnapshot: record.client_snapshot ?? undefined,
        projectId,
        machineId: record.machine_id,
        startDate: record.start_date,
        endDate: record.end_date ?? undefined,
        rate: record.rate,
        rateUnit: record.rate_unit,
        mobilizationCharge: record.mobilization_charge ?? undefined,
        demobilizationCharge: record.demobilization_charge ?? undefined,
        overtimeRate: record.overtime_rate ?? undefined,
        paymentTerms: record.payment_terms ?? undefined,
        shiftStructure: record.shift_structure ?? undefined,
        sundayCondition: record.sunday_condition ?? undefined,
        fuelNorms: record.fuel_norms ?? undefined,
        fuelScope: record.fuel_scope ?? undefined,
        dehireTerms: record.dehire_terms ?? undefined,
        operatorScope: record.operator_scope ?? undefined,
        accommodationScope: record.accommodation_scope ?? undefined,
        workingHours: record.working_hours ?? undefined,
        workingDaysPerWeek: record.working_days_per_week ?? undefined,
        minimumRentalPeriodValue: record.minimum_rental_period_value ?? undefined,
        minimumRentalPeriodUnit: record.minimum_rental_period_unit ?? undefined,
        gstTerms: record.gst_terms ?? undefined,
        noticePeriodDays: record.notice_period_days ?? undefined,
        commercialNotes: record.commercial_notes ?? undefined,
        companyTerms: record.company_terms ?? undefined,
      },
      scopeItems.map((item) => ({
        item: item.item,
        responsibleParty: item.responsible_party,
        notes: item.notes,
      })),
    );

    if (record.renter_organization_id) {
      const rentalCompany = await this.organizationRepository.findById(rentalCompanyOrganizationId);
      await this.notify({
        recipientOrganizationId: record.renter_organization_id,
        type: "quotation.awarded",
        title: "Quotation awarded",
        message: `${rentalCompany?.name ?? "The Rental Company"} awarded quotation ${record.reference_number} — a Rental has been created.`,
        relatedResourceType: "quotation",
        relatedResourceId: record.id,
      });
    }
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
    // A draft is the Rental Company still drafting terms — hidden from the
    // Renter side entirely (list, detail, scope items, offers, ...) until
    // it's actually sent, same as any other "not yours" case. Centralized
    // here rather than in each caller since every Renter-facing lookup on
    // a single quotation already routes through this method.
    if (existing.renter_organization_id === organizationId && existing.status === "draft") {
      throw new NotFoundError("Quotation not found");
    }
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

  // The Rental Company's side of the one sanctioned post-creation
  // date-change channel — see commercialQuotationSchema.alternateDateStatus.
  async proposeAlternateDates(
    userId: string,
    rentalCompanyOrganizationId: string,
    quotationId: string,
    input: ProposeAlternateDatesRequest,
  ): Promise<CommercialQuotation> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "quotation.manage",
    );
    const existing = await this.loadOwnedByRentalCompany(rentalCompanyOrganizationId, quotationId);
    if (existing.status !== "sent" && existing.status !== "negotiating") {
      throw new ConflictError("Alternate dates can only be proposed on a sent/negotiating quotation");
    }
    if (existing.alternate_date_status === "pending") {
      throw new ConflictError("An alternate-date request is already pending on this quotation");
    }
    const record = await this.quotationRepository.proposeAlternateDates(quotationId, input);
    if (record.renter_organization_id) {
      const rentalCompany = await this.organizationRepository.findById(rentalCompanyOrganizationId);
      await this.notify({
        recipientOrganizationId: record.renter_organization_id,
        type: "quotation.alternate_dates_proposed",
        title: "Alternate dates proposed",
        message: `${rentalCompany?.name ?? "The Rental Company"} proposed alternate dates for quotation ${record.reference_number}.`,
        relatedResourceType: "quotation",
        relatedResourceId: record.id,
      });
    }
    return toQuotation(record);
  }

  // The Renter's side — must explicitly accept or reject before the
  // proposal takes effect.
  async respondToAlternateDates(
    userId: string,
    renterOrganizationId: string,
    quotationId: string,
    decision: "accepted" | "rejected",
  ): Promise<CommercialQuotation> {
    await this.permissionService.requirePermission(
      userId,
      renterOrganizationId,
      "quotation.respond",
    );
    const existing = await this.loadAsParty(renterOrganizationId, quotationId);
    if (existing.renter_organization_id !== renterOrganizationId) {
      throw new NotFoundError("Quotation not found in this organization");
    }
    if (existing.alternate_date_status !== "pending") {
      throw new ConflictError("No alternate-date request is pending on this quotation");
    }
    const record = await this.quotationRepository.respondToAlternateDates(quotationId, decision);
    const renter = await this.organizationRepository.findById(renterOrganizationId);
    await this.notify({
      recipientOrganizationId: record.rental_company_organization_id,
      type: "quotation.alternate_dates_responded",
      title: decision === "accepted" ? "Alternate dates accepted" : "Alternate dates rejected",
      message: `${renter?.name ?? "The Renter"} ${decision} the proposed alternate dates on quotation ${record.reference_number}.`,
      relatedResourceType: "quotation",
      relatedResourceId: record.id,
    });
    return toQuotation(record);
  }
}
