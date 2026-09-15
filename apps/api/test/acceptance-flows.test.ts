// Business-flow acceptance tests (Flows A-E) for the auction/post-auction
// correction pass — see docs/marketplace-core-loop-design.md and the
// correction-pass brief. Unlike the per-service unit test files, these wire
// REAL service instances together (fakes only at the repository layer) to
// prove the actual cross-service flows a user experiences, end to end.
import { describe, expect, it } from "vitest";
import type { OrganizationTypeCode } from "@fleetip/contracts/organization";
import { PermissionService } from "../src/modules/permissions/application/permission-service.js";
import type {
  ActiveMembershipRecord,
  MembershipRepositoryPort,
  OrganizationRepositoryPort,
  OrganizationWithTypeRecord,
} from "../src/modules/organizations/domain/ports.js";
import type { RoleRepositoryPort } from "../src/modules/permissions/domain/ports.js";
import type {
  ProductSubcategoryRecord,
  ProductSubcategoryRepositoryPort,
} from "../src/modules/catalogue/domain/ports.js";
import { RequirementService } from "../src/modules/marketplace/rfq/application/requirement-service.js";
import type {
  RequirementRecord,
  RequirementRepositoryPort,
} from "../src/modules/marketplace/rfq/domain/ports.js";
import type { ProjectRecord, ProjectRepositoryPort } from "../src/modules/marketplace/project/domain/ports.js";
import { QuotationResponseService } from "../src/modules/marketplace/quotation-response/application/quotation-response-service.js";
import type {
  QuotationResponseRecord,
  QuotationResponseRepositoryPort,
} from "../src/modules/marketplace/quotation-response/domain/ports.js";
import { CommercialQuotationService } from "../src/modules/marketplace/commercial-quotation/application/commercial-quotation-service.js";
import type {
  CommercialQuotationRecord,
  CommercialQuotationRepositoryPort,
  QuotationOfferRecord,
  QuotationOfferRepositoryPort,
  QuotationScopeItemRecord,
  QuotationScopeItemRepositoryPort,
} from "../src/modules/marketplace/commercial-quotation/domain/ports.js";
import { AuctionService } from "../src/modules/marketplace/auction/application/auction-service.js";
import {
  pickWinningBid,
  isImprovingBid,
} from "../src/modules/marketplace/auction/domain/auction-rules.js";
import type {
  AuctionBidRecord,
  AuctionEventRecord,
  AuctionParticipantRecord,
  AuctionRecord,
  AuctionRepositoryPort,
  AuctionResultRecord,
} from "../src/modules/marketplace/auction/domain/ports.js";
import { RentalService } from "../src/modules/marketplace/rental/application/rental-service.js";
import type {
  RentalRecord,
  RentalRepositoryPort,
} from "../src/modules/marketplace/rental/domain/ports.js";
import type {
  MachineRecord,
  MachineRepositoryPort,
} from "../src/modules/equipment/domain/ports.js";
import type {
  ProductRecord,
  ProductRepositoryPort,
} from "../src/modules/catalogue/domain/ports.js";
import type { MaintenanceRepositoryPort } from "../src/modules/maintenance/domain/ports.js";
import { NotificationService } from "../src/modules/notification/application/notification-service.js";
import type {
  NotificationRecord,
  NotificationRepositoryPort,
} from "../src/modules/notification/domain/ports.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../src/shared/errors.js";

const OWNER_ROLE_ID = "role-owner";
const RENTER_ORG_ID = "org-renter";
const RC_ORG_ID = "org-rc";
const RC2_ORG_ID = "org-rc-2";
const THIRD_PARTY_ORG_ID = "org-third-party";
const SUBCATEGORY_ID = "subcategory-1";
const PROJECT_ID = "project-1";

const ORG_TYPES: Record<string, OrganizationTypeCode> = {
  [RENTER_ORG_ID]: "renter",
  [RC_ORG_ID]: "rental_company",
  [RC2_ORG_ID]: "rental_company",
  [THIRD_PARTY_ORG_ID]: "rental_company",
};
const ORG_NAMES: Record<string, string> = {
  [RENTER_ORG_ID]: "Metro Infra Builders",
  [RC_ORG_ID]: "Apex Equipment Rentals",
  [RC2_ORG_ID]: "Rajasthan Heavy Machinery",
  [THIRD_PARTY_ORG_ID]: "Unrelated Rentals Co",
};

function organizationRecord(id: string): OrganizationWithTypeRecord {
  const type = ORG_TYPES[id] as OrganizationTypeCode;
  return {
    id,
    organization_type_id: `type-${type}`,
    organization_type_code: type,
    name: ORG_NAMES[id] ?? "Test Org",
    code: "TESTORG",
    status: "active",
    created_at: new Date(),
  };
}

function fakeOrganizationRepository(): OrganizationRepositoryPort {
  return {
    findTypeByCode: async () => {
      throw new Error("not used in this test");
    },
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async (id) => (ORG_TYPES[id] ? organizationRecord(id) : undefined),
    findWithTypeById: async (id) => (ORG_TYPES[id] ? organizationRecord(id) : undefined),
    listAllForPlatformAdmin: async () => {
      throw new Error("not used in this test");
    },
    updateStatus: async () => {
      throw new Error("not used in this test");
    },
    codeExists: async () => {
      throw new Error("not used in this test");
    },
    listByType: async (type) =>
      Object.keys(ORG_TYPES)
        .filter((id) => ORG_TYPES[id] === type)
        .map(organizationRecord),
  };
}

function fakeMembershipRepository(): MembershipRepositoryPort {
  return {
    create: async () => {
      throw new Error("not used in this test");
    },
    listWithOrganizationByUserId: async () => [],
    listByOrganization: async () => {
      throw new Error("not used in this test");
    },
    updateRole: async () => {
      throw new Error("not used in this test");
    },
    findActiveMembership: async (): Promise<ActiveMembershipRecord | undefined> => ({
      id: "membership-1",
      status: "active",
      role_id: OWNER_ROLE_ID,
    }),
  };
}

function fakeRoleRepository(): RoleRepositoryPort {
  const allPermissions = [
    "rfq.manage",
    "rfq.respond",
    "quotation.manage",
    "quotation.respond",
    "auction.manage",
    "auction.participate",
    "rental.manage",
    "organization.manage",
  ];
  return {
    findByName: async (name) => ({ id: OWNER_ROLE_ID, name, organization_id: null }),
    findById: async () => {
      throw new Error("not used in this test");
    },
    listForOrganization: async () => {
      throw new Error("not used in this test");
    },
    create: async () => {
      throw new Error("not used in this test");
    },
    update: async () => {
      throw new Error("not used in this test");
    },
    delete: async () => {
      throw new Error("not used in this test");
    },
    hasPermission: async (roleId) => roleId === OWNER_ROLE_ID,
    listPermissionCodesByRoleId: async (roleId) => (roleId === OWNER_ROLE_ID ? allPermissions : []),
  };
}

function fakeProductSubcategoryRepository(): ProductSubcategoryRepositoryPort {
  return {
    listByCategory: async () => {
      throw new Error("not used in this test");
    },
    findById: async (id): Promise<ProductSubcategoryRecord | undefined> =>
      id === SUBCATEGORY_ID
        ? {
            id,
            product_category_id: "category-1",
            code: "EXC",
            name: "Excavator",
            created_at: new Date(),
          }
        : undefined,
    create: async () => {
      throw new Error("not used in this test");
    },
    updateName: async () => {
      throw new Error("not used in this test");
    },
    codeExistsInCategory: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeProjectRepository(): ProjectRepositoryPort {
  const project: ProjectRecord = {
    id: PROJECT_ID,
    renter_organization_id: RENTER_ORG_ID,
    project_code: "PRJ-2026-1",
    project_type: "Bridge and Metro",
    project_name: "Metro Bridge Foundation",
    site_location: "Jaipur",
    state: null,
    district: null,
    start_date: "2026-01-01",
    end_date: null,
    status: "active",
    created_at: new Date(),
    updated_at: new Date(),
  };
  return {
    nextReferenceNumber: async () => {
      throw new Error("not used in this test");
    },
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async (id) => (id === PROJECT_ID ? project : undefined),
    listByRenter: async () => [project],
    updateStatus: async () => {
      throw new Error("not used in this test");
    },
    updateFields: async () => {
      throw new Error("not used in this test");
    },
    search: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeRequirementRepository(): RequirementRepositoryPort {
  const requirements = new Map<string, RequirementRecord>();
  let nextId = 1;
  return {
    create: async (input) => {
      const record: RequirementRecord = {
        id: `requirement-${nextId++}`,
        renter_organization_id: input.renterOrganizationId,
        project_id: input.projectId,
        product_subcategory_id: input.productSubcategoryId,
        capacity: input.capacity ?? null,
        capacity_unit: input.capacityUnit ?? null,
        boom_length: input.boomLength ?? null,
        quantity: input.quantity,
        project_name: input.projectName ?? null,
        project_location: input.projectLocation ?? null,
        requested_start_date: input.requestedStartDate,
        expected_duration_value: input.expectedDurationValue ?? null,
        expected_duration_unit: input.expectedDurationUnit ?? null,
        shift_pattern: input.shiftPattern ?? null,
        crew_requirement: input.crewRequirement ?? null,
        shift_requirement: input.shiftRequirement ?? null,
        validity_date: input.validityDate,
        status: "open",
        notes: input.notes ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      requirements.set(record.id, record);
      return record;
    },
    findById: async (id) => requirements.get(id),
    listByRenter: async (renterOrganizationId) =>
      [...requirements.values()].filter((r) => r.renter_organization_id === renterOrganizationId),
    listOpenForDiscovery: async () => [...requirements.values()].filter((r) => r.status === "open"),
    updateStatus: async (id, status) => {
      const existing = requirements.get(id);
      if (!existing) throw new Error("not found");
      const updated = { ...existing, status, updated_at: new Date() };
      requirements.set(id, updated);
      return updated;
    },
    updateFields: async () => {
      throw new Error("not used in this test");
    },
    search: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeQuotationResponseRepository(): QuotationResponseRepositoryPort {
  const responses = new Map<string, QuotationResponseRecord>();
  let nextId = 1;
  return {
    submit: async (input) => {
      const existing = [...responses.values()].find(
        (r) =>
          r.requirement_id === input.requirementId &&
          r.rental_company_organization_id === input.rentalCompanyOrganizationId,
      );
      const record: QuotationResponseRecord = {
        id: existing?.id ?? `response-${nextId++}`,
        requirement_id: input.requirementId,
        rental_company_organization_id: input.rentalCompanyOrganizationId,
        status: input.status,
        indicative_rate: input.indicativeRate ?? null,
        indicative_rate_unit: input.indicativeRateUnit ?? null,
        notes: input.notes ?? null,
        created_at: existing?.created_at ?? new Date(),
        updated_at: new Date(),
      };
      responses.set(record.id, record);
      return record;
    },
    findByRequirementAndOrganization: async (requirementId, rentalCompanyOrganizationId) =>
      [...responses.values()].find(
        (r) =>
          r.requirement_id === requirementId &&
          r.rental_company_organization_id === rentalCompanyOrganizationId,
      ),
    findById: async (id) => responses.get(id),
    listByRequirement: async (requirementId) =>
      [...responses.values()].filter((r) => r.requirement_id === requirementId),
  };
}

function fakeCommercialQuotationRepository(): CommercialQuotationRepositoryPort {
  const quotations = new Map<string, CommercialQuotationRecord>();
  let nextId = 1;
  let nextRef = 1;
  return {
    nextReferenceNumber: async () => `Q-2026-${nextRef++}`,
    create: async (input) => {
      const record: CommercialQuotationRecord = {
        id: `quotation-${nextId++}`,
        rental_company_organization_id: input.rentalCompanyOrganizationId,
        renter_organization_id: input.renterOrganizationId ?? null,
        client_snapshot: input.clientSnapshot ?? null,
        requirement_id: input.requirementId ?? null,
        quotation_response_id: input.quotationResponseId ?? null,
        source_auction_id: input.sourceAuctionId ?? null,
        reference_number: input.referenceNumber,
        machine_id: input.machineId,
        start_date: input.startDate,
        end_date: input.endDate ?? null,
        rate: input.rate,
        rate_unit: input.rateUnit,
        mobilization_charge: input.mobilizationCharge ?? null,
        demobilization_charge: input.demobilizationCharge ?? null,
        overtime_rate: input.overtimeRate ?? null,
        payment_terms: input.paymentTerms ?? null,
        shift_structure: input.shiftStructure ?? null,
        sunday_condition: input.sundayCondition ?? null,
        fuel_norms: input.fuelNorms ?? null,
        fuel_scope: input.fuelScope ?? null,
        dehire_terms: input.dehireTerms ?? null,
        operator_scope: input.operatorScope ?? null,
        accommodation_scope: input.accommodationScope ?? null,
        working_hours: input.workingHours ?? null,
        working_days_per_week: input.workingDaysPerWeek ?? null,
        minimum_rental_period_value: input.minimumRentalPeriodValue ?? null,
        minimum_rental_period_unit: input.minimumRentalPeriodUnit ?? null,
        gst_terms: input.gstTerms ?? null,
        notice_period_days: input.noticePeriodDays ?? null,
        validity_date: input.validityDate,
        commercial_notes: input.commercialNotes ?? null,
        company_terms: input.companyTerms ?? null,
        status: "draft",
        renter_accepted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      quotations.set(record.id, record);
      return record;
    },
    findById: async (id) => quotations.get(id),
    listByRentalCompany: async (rentalCompanyOrganizationId) =>
      [...quotations.values()].filter(
        (q) => q.rental_company_organization_id === rentalCompanyOrganizationId,
      ),
    listByRenter: async (renterOrganizationId) =>
      [...quotations.values()].filter((q) => q.renter_organization_id === renterOrganizationId),
    updateTerms: async () => {
      throw new Error("not used in this test");
    },
    applyAcceptedOffer: async (id, input) => {
      const existing = quotations.get(id);
      if (!existing) throw new Error("not found");
      const updated: CommercialQuotationRecord = {
        ...existing,
        rate: input.rate,
        rate_unit: input.rateUnit,
        start_date: input.startDate,
        end_date: input.endDate,
        renter_accepted_at: null,
        updated_at: new Date(),
      };
      quotations.set(id, updated);
      return updated;
    },
    updateStatus: async (id, status) => {
      const existing = quotations.get(id);
      if (!existing) throw new Error("not found");
      const updated = { ...existing, status, updated_at: new Date() };
      quotations.set(id, updated);
      return updated;
    },
    setRenterAccepted: async (id, accepted) => {
      const existing = quotations.get(id);
      if (!existing) throw new Error("not found");
      const updated: CommercialQuotationRecord = {
        ...existing,
        renter_accepted_at: accepted ? new Date() : null,
        updated_at: new Date(),
      };
      quotations.set(id, updated);
      return updated;
    },
    // Validity dates in these flows are always far in the future — never due.
    expireIfDue: async (id) => quotations.get(id),
    searchByRentalCompany: async () => {
      throw new Error("not used in this test");
    },
    searchByRenter: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeQuotationScopeItemRepository(): QuotationScopeItemRepositoryPort {
  const items = new Map<string, QuotationScopeItemRecord>();
  let nextId = 1;
  return {
    create: async (input) => {
      const record: QuotationScopeItemRecord = {
        id: `scope-item-${nextId++}`,
        quotation_id: input.quotationId,
        item: input.item,
        responsible_party: input.responsibleParty,
        notes: input.notes ?? null,
        created_at: new Date(),
      };
      items.set(record.id, record);
      return record;
    },
    findById: async (id) => items.get(id),
    listByQuotation: async (quotationId) =>
      [...items.values()].filter((i) => i.quotation_id === quotationId),
    delete: async (id) => {
      items.delete(id);
    },
  };
}

function fakeQuotationOfferRepository(): QuotationOfferRepositoryPort {
  const offers = new Map<string, QuotationOfferRecord>();
  let nextId = 1;
  return {
    create: async (input) => {
      const record: QuotationOfferRecord = {
        id: `offer-${nextId++}`,
        quotation_id: input.quotationId,
        offered_by_organization_id: input.offeredByOrganizationId,
        rate: input.rate,
        rate_unit: input.rateUnit,
        start_date: input.startDate,
        end_date: input.endDate ?? null,
        notes: input.notes ?? null,
        status: "pending",
        created_at: new Date(),
      };
      offers.set(record.id, record);
      return record;
    },
    findById: async (id) => offers.get(id),
    listByQuotation: async (quotationId) =>
      [...offers.values()].filter((o) => o.quotation_id === quotationId),
    supersedePending: async (quotationId) => {
      for (const [id, offer] of offers) {
        if (offer.quotation_id === quotationId && offer.status === "pending") {
          offers.set(id, { ...offer, status: "superseded" });
        }
      }
    },
    updateStatus: async (id, status) => {
      const existing = offers.get(id);
      if (!existing) throw new Error("not found");
      const updated = { ...existing, status };
      offers.set(id, updated);
      return updated;
    },
  };
}

// A reasonably faithful in-memory stand-in for the real Postgres-backed
// repository — reuses the same pure domain functions (pickWinningBid,
// isImprovingBid) the real repository does, so bid-ranking/validation
// behavior isn't duplicated or reimplemented here.
function fakeAuctionRepository(): AuctionRepositoryPort {
  const auctions = new Map<string, AuctionRecord>();
  const participants = new Map<string, AuctionParticipantRecord>();
  const bids = new Map<string, AuctionBidRecord>();
  const results = new Map<string, AuctionResultRecord>();
  const events: AuctionEventRecord[] = [];
  let nextAuctionId = 1;
  let nextParticipantId = 1;
  let nextBidId = 1;
  let nextEventId = 1;

  function closeOne(auction: AuctionRecord): AuctionRecord {
    const auctionBids = [...bids.values()].filter((b) => b.auction_id === auction.id);
    const winner = pickWinningBid(auctionBids, auction.bidding_direction);
    results.set(auction.id, {
      auction_id: auction.id,
      winning_bid_id: winner?.id ?? null,
      winning_amount: winner?.amount ?? null,
      closed_at: new Date(),
    });
    events.push({
      id: `event-${nextEventId++}`,
      auction_id: auction.id,
      event_type: "closed",
      actor_organization_id: null,
      payload: null,
      created_at: new Date(),
    });
    const closed: AuctionRecord = { ...auction, status: "closed", updated_at: new Date() };
    auctions.set(auction.id, closed);
    return closed;
  }

  function syncOne(id: string): AuctionRecord | undefined {
    const auction = auctions.get(id);
    if (!auction) return undefined;
    const now = new Date();
    if (auction.status === "scheduled" && now >= new Date(auction.starts_at)) {
      if (now >= new Date(auction.ends_at)) return closeOne(auction);
      const live: AuctionRecord = { ...auction, status: "live", updated_at: now };
      auctions.set(id, live);
      return live;
    }
    if (auction.status === "live" && now >= new Date(auction.ends_at)) return closeOne(auction);
    return auction;
  }

  return {
    create: async (input) => {
      const record: AuctionRecord = {
        id: `auction-${nextAuctionId++}`,
        requirement_id: input.requirementId,
        created_by_organization_id: input.createdByOrganizationId,
        bidding_direction: input.biddingDirection,
        base_price: input.basePrice,
        max_bids_per_participant: input.maxBidsPerParticipant ?? null,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        status: "scheduled",
        created_at: new Date(),
        updated_at: new Date(),
      };
      auctions.set(record.id, record);
      return record;
    },
    findById: async (id) => auctions.get(id),
    listByRequirement: async (requirementId) =>
      [...auctions.values()].filter((a) => a.requirement_id === requirementId),
    syncStatus: async (id) => syncOne(id),
    closeNow: async (id) => {
      const auction = auctions.get(id);
      if (!auction) throw new Error("not found");
      if (auction.status !== "live" && auction.status !== "scheduled") {
        throw new ConflictError("Auction is not running");
      }
      return closeOne(auction);
    },
    cancel: async (id) => {
      const auction = auctions.get(id);
      if (!auction) throw new Error("not found");
      const updated: AuctionRecord = { ...auction, status: "cancelled", updated_at: new Date() };
      auctions.set(id, updated);
      return updated;
    },
    addParticipant: async (auctionId, rentalCompanyOrganizationId) => {
      const record: AuctionParticipantRecord = {
        id: `participant-${nextParticipantId++}`,
        auction_id: auctionId,
        rental_company_organization_id: rentalCompanyOrganizationId,
        status: "pending",
        created_at: new Date(),
      };
      participants.set(record.id, record);
      return record;
    },
    findParticipantByOrganization: async (auctionId, rentalCompanyOrganizationId) =>
      [...participants.values()].find(
        (p) =>
          p.auction_id === auctionId &&
          p.rental_company_organization_id === rentalCompanyOrganizationId,
      ),
    findParticipantById: async (id) => participants.get(id),
    listParticipants: async (auctionId) =>
      [...participants.values()].filter((p) => p.auction_id === auctionId),
    updateParticipantStatus: async (participantId, status) => {
      const existing = participants.get(participantId);
      if (!existing) throw new Error("not found");
      const updated = { ...existing, status };
      participants.set(participantId, updated);
      return updated;
    },
    placeBid: async (auctionId, participantId, amount) => {
      const synced = syncOne(auctionId);
      if (!synced) throw new ConflictError("Auction not found");
      if (synced.status !== "live") {
        throw new ConflictError(
          synced.status === "scheduled"
            ? "Auction has not started yet"
            : `Auction is ${synced.status}`,
        );
      }
      const auctionBids = [...bids.values()].filter((b) => b.auction_id === auctionId);
      if (synced.max_bids_per_participant !== null) {
        const count = auctionBids.filter((b) => b.participant_id === participantId).length;
        if (count >= synced.max_bids_per_participant) {
          throw new ConflictError("Bid limit reached for this participant");
        }
      }
      const leader = pickWinningBid(auctionBids, synced.bidding_direction);
      if (!isImprovingBid(amount, synced.base_price, leader, synced.bidding_direction)) {
        throw new ValidationError("Bid does not improve on the current standing bid");
      }
      const record: AuctionBidRecord = {
        id: `bid-${nextBidId++}`,
        auction_id: auctionId,
        participant_id: participantId,
        amount,
        created_at: new Date(),
      };
      bids.set(record.id, record);
      return record;
    },
    listBids: async (auctionId) =>
      [...bids.values()]
        .filter((b) => b.auction_id === auctionId)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    findResult: async (auctionId) => results.get(auctionId),
    listEvents: async (auctionId) => events.filter((e) => e.auction_id === auctionId),
    listByOwnerOrganization: async () => {
      throw new Error("not used in this test");
    },
    listAllForPlatformAdmin: async () => {
      throw new Error("not used in this test");
    },
    listByParticipantOrganization: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeMachineRepository(): MachineRepositoryPort {
  const machines = new Map<string, MachineRecord>([
    [
      "machine-1",
      {
        id: "machine-1",
        organization_id: RC_ORG_ID,
        product_id: "product-1",
        asset_code: "EXC-001",
        chassis_number: null,
        registration_number: "RJ01AB1234",
        year_of_manufacture: null,
        status: "active",
        created_at: new Date(),
      },
    ],
    [
      "machine-2",
      {
        id: "machine-2",
        organization_id: RC2_ORG_ID,
        product_id: "product-1",
        asset_code: "EXC-002",
        chassis_number: null,
        registration_number: "RJ01AB5678",
        year_of_manufacture: null,
        status: "active",
        created_at: new Date(),
      },
    ],
  ]);
  return {
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async (id) => machines.get(id),
    listByOrganization: async (organizationId) =>
      [...machines.values()].filter((m) => m.organization_id === organizationId),
    search: async () => {
      throw new Error("not used in this test");
    },
    updateStatus: async () => {
      throw new Error("not used in this test");
    },
    updateDetails: async () => {
      throw new Error("not used in this test");
    },
    assetCodeExists: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeProductRepository(): ProductRepositoryPort {
  const product: ProductRecord = {
    id: "product-1",
    product_subcategory_id: "subcategory-1",
    manufacturer: "Caterpillar",
    name: "320",
    capacity: 20,
    capacity_unit: "Ton",
    specifications: null,
    created_at: new Date(),
  };
  return {
    listAll: async () => [product],
    findById: async (id) => (id === product.id ? product : undefined),
    create: async () => {
      throw new Error("not used in this test");
    },
    update: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeMaintenanceRepository(): MaintenanceRepositoryPort {
  return {
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async () => {
      throw new Error("not used in this test");
    },
    listByMachine: async () => {
      throw new Error("not used in this test");
    },
    listByOrganization: async () => {
      throw new Error("not used in this test");
    },
    updateStatus: async () => {
      throw new Error("not used in this test");
    },
    hasOverlappingMaintenance: async () => false,
  };
}

function fakeRentalRepository(): RentalRepositoryPort {
  const rentals = new Map<string, RentalRecord>();
  let nextId = 1;
  return {
    create: async (input) => {
      const record: RentalRecord = {
        id: `rental-${nextId++}`,
        rental_company_organization_id: input.rentalCompanyOrganizationId,
        renter_organization_id: input.renterOrganizationId ?? null,
        client_snapshot: input.clientSnapshot ?? null,
        machine_id: input.machineId,
        status: input.status,
        project_name: input.projectName ?? null,
        project_location: input.projectLocation ?? null,
        start_date: input.startDate,
        end_date: input.endDate ?? null,
        rate: input.rate,
        rate_unit: input.rateUnit,
        mobilization_charge: input.mobilizationCharge ?? null,
        demobilization_charge: input.demobilizationCharge ?? null,
        payment_terms: input.paymentTerms ?? null,
        shift_structure: input.shiftStructure ?? null,
        overtime_rate: input.overtimeRate ?? null,
        sunday_condition: input.sundayCondition ?? null,
        fuel_norms: input.fuelNorms ?? null,
        operator_scope: input.operatorScope ?? null,
        notice_period_days: input.noticePeriodDays ?? null,
        dehire_terms: input.dehireTerms ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      rentals.set(record.id, record);
      return record;
    },
    findById: async (id) => rentals.get(id),
    listByOrganization: async (rentalCompanyOrganizationId) =>
      [...rentals.values()].filter(
        (r) => r.rental_company_organization_id === rentalCompanyOrganizationId,
      ),
    listByRenterOrganization: async (renterOrganizationId) =>
      [...rentals.values()].filter((r) => r.renter_organization_id === renterOrganizationId),
    updateTerms: async () => {
      throw new Error("not used in this test");
    },
    updateStatus: async (id, status) => {
      const existing = rentals.get(id);
      if (!existing) throw new Error("not found");
      const updated = { ...existing, status, updated_at: new Date() };
      rentals.set(id, updated);
      return updated;
    },
    isAvailable: async () => true,
    searchByOrganization: async () => {
      throw new Error("not used in this test");
    },
    searchByRenterOrganization: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeNotificationRepository(): NotificationRepositoryPort {
  const notifications = new Map<string, NotificationRecord>();
  let nextId = 1;
  return {
    create: async (input) => {
      const record: NotificationRecord = {
        id: `notification-${nextId++}`,
        recipient_organization_id: input.recipientOrganizationId,
        type: input.type,
        title: input.title,
        message: input.message,
        related_resource_type: input.relatedResourceType ?? null,
        related_resource_id: input.relatedResourceId ?? null,
        read_at: null,
        created_at: new Date(),
      };
      notifications.set(record.id, record);
      return record;
    },
    listByOrganization: async (organizationId) =>
      [...notifications.values()]
        .filter((n) => n.recipient_organization_id === organizationId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    countUnread: async (organizationId) =>
      [...notifications.values()].filter(
        (n) => n.recipient_organization_id === organizationId && n.read_at === null,
      ).length,
    markRead: async (id, organizationId) => {
      const existing = notifications.get(id);
      if (!existing || existing.recipient_organization_id !== organizationId) return undefined;
      const updated = { ...existing, read_at: new Date() };
      notifications.set(id, updated);
      return updated;
    },
    markAllRead: async (organizationId) => {
      for (const [id, n] of notifications) {
        if (n.recipient_organization_id === organizationId && n.read_at === null) {
          notifications.set(id, { ...n, read_at: new Date() });
        }
      }
    },
  };
}

function buildHarness() {
  const permissionService = new PermissionService(
    fakeMembershipRepository(),
    fakeRoleRepository(),
    fakeOrganizationRepository(),
  );
  const organizationRepository = fakeOrganizationRepository();
  const requirementRepository = fakeRequirementRepository();
  const quotationResponseRepository = fakeQuotationResponseRepository();
  const commercialQuotationRepository = fakeCommercialQuotationRepository();
  const quotationOfferRepository = fakeQuotationOfferRepository();
  const auctionRepository = fakeAuctionRepository();
  const machineRepository = fakeMachineRepository();
  const maintenanceRepository = fakeMaintenanceRepository();
  const rentalRepository = fakeRentalRepository();
  const notificationRepository = fakeNotificationRepository();
  const productSubcategoryRepository = fakeProductSubcategoryRepository();

  const notificationService = new NotificationService(notificationRepository, permissionService);
  const requirementService = new RequirementService(
    requirementRepository,
    productSubcategoryRepository,
    permissionService,
    fakeProjectRepository(),
  );
  const quotationResponseService = new QuotationResponseService(
    quotationResponseRepository,
    requirementRepository,
    permissionService,
    notificationService,
  );
  const rentalService = new RentalService(
    rentalRepository,
    machineRepository,
    organizationRepository,
    permissionService,
    maintenanceRepository,
    notificationService,
  );
  const auctionService = new AuctionService(
    auctionRepository,
    requirementRepository,
    permissionService,
    organizationRepository,
    notificationService,
  );
  const commercialQuotationService = new CommercialQuotationService(
    commercialQuotationRepository,
    quotationOfferRepository,
    fakeQuotationScopeItemRepository(),
    machineRepository,
    fakeProductRepository(),
    organizationRepository,
    requirementRepository,
    quotationResponseRepository,
    auctionRepository,
    rentalService,
    { createFromAward: async () => undefined },
    permissionService,
    notificationService,
  );

  return {
    requirementService,
    quotationResponseService,
    rentalService,
    auctionService,
    commercialQuotationService,
    notificationService,
    rentalRepository,
  };
}

const FAR_FUTURE_VALIDITY = "2099-12-31";

async function postRequirement(h: ReturnType<typeof buildHarness>) {
  return h.requirementService.createRequirement("user-renter", RENTER_ORG_ID, {
    projectId: PROJECT_ID,
    productSubcategoryId: SUBCATEGORY_ID,
    quantity: 1,
    requestedStartDate: "2026-10-01",
    validityDate: FAR_FUTURE_VALIDITY,
  });
}

async function runningAuction(h: ReturnType<typeof buildHarness>, requirementId: string) {
  return h.auctionService.createAuction("user-renter", RENTER_ORG_ID, {
    requirementId,
    biddingDirection: "ascending",
    basePrice: 1000,
    startsAt: new Date(Date.now() - 60_000).toISOString(),
    endsAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
}

describe("Flow A: Normal RFQ (Requirement -> Response -> Quotation -> Negotiation -> Award -> Rental)", () => {
  it("runs the full flow and closes the Requirement on award", async () => {
    const h = buildHarness();
    const requirement = await postRequirement(h);

    await h.quotationResponseService.submitResponse("user-rc", RC_ORG_ID, requirement.id, {
      status: "interested",
      indicativeRate: 5000,
      indicativeRateUnit: "day",
    });
    const myResponse = await h.quotationResponseService.getMyResponse(
      "user-rc",
      RC_ORG_ID,
      requirement.id,
    );

    const quotation = await h.commercialQuotationService.createQuotation("user-rc", RC_ORG_ID, {
      machineId: "machine-1",
      renterOrganizationId: RENTER_ORG_ID,
      requirementId: requirement.id,
      quotationResponseId: myResponse.id,
      startDate: "2026-10-01",
      rate: 5000,
      rateUnit: "day",
      validityDate: FAR_FUTURE_VALIDITY,
    });
    await h.commercialQuotationService.sendQuotation("user-rc", RC_ORG_ID, quotation.id);

    await h.commercialQuotationService.makeOffer("user-renter", RENTER_ORG_ID, quotation.id, {
      rate: 4700,
      rateUnit: "day",
      startDate: "2026-10-01",
    });
    const offers = await h.commercialQuotationService.listOffers(
      "user-rc",
      RC_ORG_ID,
      quotation.id,
    );
    const counterOffer = offers.find((o) => o.status === "pending")!;
    const accepted = await h.commercialQuotationService.acceptOffer(
      "user-rc",
      RC_ORG_ID,
      quotation.id,
      counterOffer.id,
    );
    expect(accepted.rate).toBe(4700);

    await h.commercialQuotationService.acceptQuotation("user-renter", RENTER_ORG_ID, quotation.id);
    const awarded = await h.commercialQuotationService.awardQuotation(
      "user-rc",
      RC_ORG_ID,
      quotation.id,
    );
    expect(awarded.status).toBe("awarded");

    const rentals = await h.rentalRepository.listByOrganization(RC_ORG_ID);
    expect(rentals).toHaveLength(1);
    expect(rentals[0]?.rate).toBe(4700);

    const closedRequirement = await h.requirementService.getRequirement(
      "user-renter",
      RENTER_ORG_ID,
      requirement.id,
    );
    expect(closedRequirement.status).toBe("closed");
  });
});

describe("Flow B: Auction (Requirement -> Auction -> bids -> close -> select -> negotiate -> award -> Rental)", () => {
  it("lets the owner select a participant independent of the bid-computed leader", async () => {
    const h = buildHarness();
    const requirement = await postRequirement(h);
    const auction = await runningAuction(h, requirement.id);

    const p1 = await h.auctionService.requestToJoin("user-rc1", RC_ORG_ID, auction.id);
    const p2 = await h.auctionService.requestToJoin("user-rc2", RC2_ORG_ID, auction.id);
    await h.auctionService.reviewParticipant(
      "user-renter",
      RENTER_ORG_ID,
      auction.id,
      p1.id,
      "approved",
    );
    await h.auctionService.reviewParticipant(
      "user-renter",
      RENTER_ORG_ID,
      auction.id,
      p2.id,
      "approved",
    );

    await h.auctionService.placeBid("user-rc1", RC_ORG_ID, auction.id, 1200);
    await h.auctionService.placeBid("user-rc2", RC2_ORG_ID, auction.id, 1300);

    const closed = await h.auctionService.closeAuctionEarly(
      "user-renter",
      RENTER_ORG_ID,
      auction.id,
    );
    expect(closed.status).toBe("closed");

    const detail = await h.auctionService.getAuctionDetail(
      "user-renter",
      RENTER_ORG_ID,
      auction.id,
    );
    expect(detail.bids).toHaveLength(2);
    const leadingBid = detail.bids.find((b) => b.isLeading);
    expect(leadingBid?.amount).toBe(1300); // RC2 is the mathematical bid leader...

    // ...but the owner deliberately selects RC1 instead — proving selection
    // is a genuine, independent decision, not automatically the bid winner.
    const selected = await h.auctionService.selectParticipant(
      "user-renter",
      RENTER_ORG_ID,
      auction.id,
      p1.id,
    );
    expect(selected.status).toBe("selected");
    expect(selected.rentalCompanyOrganizationId).toBe(RC_ORG_ID);

    const quotation = await h.commercialQuotationService.createQuotation("user-rc1", RC_ORG_ID, {
      machineId: "machine-1",
      requirementId: requirement.id,
      sourceAuctionId: auction.id,
      renterOrganizationId: RENTER_ORG_ID,
      startDate: "2026-10-01",
      rate: 1200,
      rateUnit: "day",
      validityDate: FAR_FUTURE_VALIDITY,
    });
    await h.commercialQuotationService.sendQuotation("user-rc1", RC_ORG_ID, quotation.id);

    await h.commercialQuotationService.makeOffer("user-renter", RENTER_ORG_ID, quotation.id, {
      rate: 1150,
      rateUnit: "day",
      startDate: "2026-10-01",
    });
    const offers = await h.commercialQuotationService.listOffers(
      "user-rc1",
      RC_ORG_ID,
      quotation.id,
    );
    const pending = offers.find((o) => o.status === "pending")!;
    await h.commercialQuotationService.acceptOffer("user-rc1", RC_ORG_ID, quotation.id, pending.id);

    // acceptOffer settles the negotiated rate but is not itself the Renter's
    // award-gating acceptance (Path C is no longer exempt from it either —
    // see the reverted "auction selection is consent" bug).
    await h.commercialQuotationService.acceptQuotation("user-renter", RENTER_ORG_ID, quotation.id);

    const awarded = await h.commercialQuotationService.awardQuotation(
      "user-rc1",
      RC_ORG_ID,
      quotation.id,
    );
    expect(awarded.status).toBe("awarded");

    const rentals = await h.rentalRepository.listByOrganization(RC_ORG_ID);
    expect(rentals).toHaveLength(1);
    expect(rentals[0]?.rate).toBe(1150);
  });
});

describe("Flow C: Auction security", () => {
  async function setupAuctionWithTwoBidders() {
    const h = buildHarness();
    const requirement = await postRequirement(h);
    const auction = await runningAuction(h, requirement.id);
    const p1 = await h.auctionService.requestToJoin("user-rc1", RC_ORG_ID, auction.id);
    const p2 = await h.auctionService.requestToJoin("user-rc2", RC2_ORG_ID, auction.id);
    await h.auctionService.reviewParticipant(
      "user-renter",
      RENTER_ORG_ID,
      auction.id,
      p1.id,
      "approved",
    );
    await h.auctionService.reviewParticipant(
      "user-renter",
      RENTER_ORG_ID,
      auction.id,
      p2.id,
      "approved",
    );
    await h.auctionService.placeBid("user-rc1", RC_ORG_ID, auction.id, 1200);
    await h.auctionService.placeBid("user-rc2", RC2_ORG_ID, auction.id, 1300);
    return { h, requirement, auction, p1, p2 };
  }

  it("hides the auction entirely from an organization that never joined it", async () => {
    const { h, auction } = await setupAuctionWithTwoBidders();
    await expect(
      h.auctionService.getAuctionDetail("user-third", THIRD_PARTY_ORG_ID, auction.id),
    ).rejects.toThrow(NotFoundError);
  });

  it("hides competitor identity from a bidder's own view, even for the visible leading bid", async () => {
    const { h, auction } = await setupAuctionWithTwoBidders();
    const view = await h.auctionService.getAuctionDetail("user-rc1", RC_ORG_ID, auction.id);
    expect(view.participants).toHaveLength(1);
    expect(view.participants[0]?.rentalCompanyOrganizationId).toBe(RC_ORG_ID);
    const leaderBid = view.bids.find((b) => b.isLeading);
    expect(leaderBid?.amount).toBe(1300); // RC2's bid is visible as the leader...
    expect(leaderBid?.rentalCompanyOrganizationName).toBeNull(); // ...but anonymous
  });

  it("rejects a Rental Company attempting to select a participant (owner-only action)", async () => {
    const { h, auction, p1 } = await setupAuctionWithTwoBidders();
    await h.auctionService.closeAuctionEarly("user-renter", RENTER_ORG_ID, auction.id);
    await expect(
      h.auctionService.selectParticipant("user-rc1", RC_ORG_ID, auction.id, p1.id),
    ).rejects.toThrow(ForbiddenError);
  });

  it("rejects the leading bidder from formalizing a quotation without being selected (closes the award-to-self loophole)", async () => {
    const { h, requirement, auction } = await setupAuctionWithTwoBidders();
    await h.auctionService.closeAuctionEarly("user-renter", RENTER_ORG_ID, auction.id);
    // RC2 holds the leading bid (1300) but the owner never selected anyone.
    await expect(
      h.commercialQuotationService.createQuotation("user-rc2", RC2_ORG_ID, {
        machineId: "machine-2",
        requirementId: requirement.id,
        sourceAuctionId: auction.id,
        renterOrganizationId: RENTER_ORG_ID,
        startDate: "2026-10-01",
        rate: 1300,
        rateUnit: "day",
        validityDate: FAR_FUTURE_VALIDITY,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects bids placed after the auction has closed", async () => {
    const { h, auction } = await setupAuctionWithTwoBidders();
    await h.auctionService.closeAuctionEarly("user-renter", RENTER_ORG_ID, auction.id);
    await expect(
      h.auctionService.placeBid("user-rc1", RC_ORG_ID, auction.id, 1400),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects a bid that doesn't improve on the current leader", async () => {
    const { h, auction } = await setupAuctionWithTwoBidders();
    await expect(
      h.auctionService.placeBid("user-rc1", RC_ORG_ID, auction.id, 1250),
    ).rejects.toThrow(ValidationError);
  });
});

describe("Flow D: Notifications", () => {
  it("creates notifications for negotiation, counter-offer, selection, and auction completion; supports mark-as-read; links to the right resource", async () => {
    const h = buildHarness();
    const requirement = await postRequirement(h);
    const auction = await runningAuction(h, requirement.id);
    const p1 = await h.auctionService.requestToJoin("user-rc1", RC_ORG_ID, auction.id);
    await h.auctionService.reviewParticipant(
      "user-renter",
      RENTER_ORG_ID,
      auction.id,
      p1.id,
      "approved",
    );
    await h.auctionService.placeBid("user-rc1", RC_ORG_ID, auction.id, 1200);
    await h.auctionService.closeAuctionEarly("user-renter", RENTER_ORG_ID, auction.id);

    const renterAfterClose = await h.notificationService.list("user-renter", RENTER_ORG_ID);
    expect(renterAfterClose.notifications.some((n) => n.type === "auction.ended")).toBe(true);

    await h.auctionService.selectParticipant("user-renter", RENTER_ORG_ID, auction.id, p1.id);
    const rcAfterSelection = await h.notificationService.list("user-rc1", RC_ORG_ID);
    const selectionNotification = rcAfterSelection.notifications.find(
      (n) => n.type === "auction.participant_selected",
    );
    expect(selectionNotification).toBeDefined();
    expect(selectionNotification?.relatedResourceId).toBe(auction.id);

    const quotation = await h.commercialQuotationService.createQuotation("user-rc1", RC_ORG_ID, {
      machineId: "machine-1",
      requirementId: requirement.id,
      sourceAuctionId: auction.id,
      renterOrganizationId: RENTER_ORG_ID,
      startDate: "2026-10-01",
      rate: 1200,
      rateUnit: "day",
      validityDate: FAR_FUTURE_VALIDITY,
    });
    await h.commercialQuotationService.sendQuotation("user-rc1", RC_ORG_ID, quotation.id);
    const renterAfterSend = await h.notificationService.list("user-renter", RENTER_ORG_ID);
    expect(
      renterAfterSend.notifications.some(
        (n) => n.type === "quotation.sent" && n.relatedResourceId === quotation.id,
      ),
    ).toBe(true);

    await h.commercialQuotationService.makeOffer("user-renter", RENTER_ORG_ID, quotation.id, {
      rate: 1150,
      rateUnit: "day",
      startDate: "2026-10-01",
    });
    const rcAfterFirstOffer = await h.notificationService.list("user-rc1", RC_ORG_ID);
    const negotiationStarted = rcAfterFirstOffer.notifications.find(
      (n) => n.type === "quotation.negotiation_offer",
    );
    expect(negotiationStarted?.title).toBe("Negotiation started");

    await h.commercialQuotationService.makeOffer("user-rc1", RC_ORG_ID, quotation.id, {
      rate: 1180,
      rateUnit: "day",
      startDate: "2026-10-01",
    });
    const renterAfterCounter = await h.notificationService.list("user-renter", RENTER_ORG_ID);
    const counterOfferNotification = renterAfterCounter.notifications.find(
      (n) => n.title === "New counter-offer",
    );
    expect(counterOfferNotification).toBeDefined();
    expect(counterOfferNotification?.readAt).toBeNull();

    await h.notificationService.markRead(
      "user-renter",
      RENTER_ORG_ID,
      counterOfferNotification!.id,
    );
    const renterAfterRead = await h.notificationService.list("user-renter", RENTER_ORG_ID);
    const reRead = renterAfterRead.notifications.find((n) => n.id === counterOfferNotification!.id);
    expect(reRead?.readAt).not.toBeNull();
  });
});

describe("Flow E: Negotiated price reaches the Rental", () => {
  it("the Rental's rate is the accepted negotiated price, not the original auction bid or original quotation rate", async () => {
    const h = buildHarness();
    const requirement = await postRequirement(h);
    const auction = await runningAuction(h, requirement.id);
    const p1 = await h.auctionService.requestToJoin("user-rc1", RC_ORG_ID, auction.id);
    await h.auctionService.reviewParticipant(
      "user-renter",
      RENTER_ORG_ID,
      auction.id,
      p1.id,
      "approved",
    );

    const originalBid = 1200;
    await h.auctionService.placeBid("user-rc1", RC_ORG_ID, auction.id, originalBid);
    await h.auctionService.closeAuctionEarly("user-renter", RENTER_ORG_ID, auction.id);
    await h.auctionService.selectParticipant("user-renter", RENTER_ORG_ID, auction.id, p1.id);

    const originalQuotationRate = originalBid;
    const quotation = await h.commercialQuotationService.createQuotation("user-rc1", RC_ORG_ID, {
      machineId: "machine-1",
      requirementId: requirement.id,
      sourceAuctionId: auction.id,
      renterOrganizationId: RENTER_ORG_ID,
      startDate: "2026-10-01",
      rate: originalQuotationRate,
      rateUnit: "day",
      validityDate: FAR_FUTURE_VALIDITY,
    });
    await h.commercialQuotationService.sendQuotation("user-rc1", RC_ORG_ID, quotation.id);

    const negotiatedFinalRate = 1050;
    await h.commercialQuotationService.makeOffer("user-renter", RENTER_ORG_ID, quotation.id, {
      rate: negotiatedFinalRate,
      rateUnit: "day",
      startDate: "2026-10-01",
    });
    const offers = await h.commercialQuotationService.listOffers(
      "user-rc1",
      RC_ORG_ID,
      quotation.id,
    );
    const pendingOffer = offers.find((o) => o.status === "pending")!;
    const accepted = await h.commercialQuotationService.acceptOffer(
      "user-rc1",
      RC_ORG_ID,
      quotation.id,
      pendingOffer.id,
    );
    expect(accepted.rate).toBe(negotiatedFinalRate);
    expect(accepted.rate).not.toBe(originalBid);

    // acceptOffer settles the negotiated rate but is not itself the Renter's
    // award-gating acceptance (Path C is no longer exempt from it either —
    // see the reverted "auction selection is consent" bug).
    await h.commercialQuotationService.acceptQuotation("user-renter", RENTER_ORG_ID, quotation.id);

    await h.commercialQuotationService.awardQuotation("user-rc1", RC_ORG_ID, quotation.id);
    const rentals = await h.rentalRepository.listByOrganization(RC_ORG_ID);
    expect(rentals).toHaveLength(1);
    expect(rentals[0]?.rate).toBe(negotiatedFinalRate);
    expect(rentals[0]?.rate).not.toBe(originalBid);
    expect(rentals[0]?.rate).not.toBe(originalQuotationRate);
  });
});
