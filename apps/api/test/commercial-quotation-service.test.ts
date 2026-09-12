import { describe, expect, it } from "vitest";
import type { OrganizationTypeCode } from "@fleetip/contracts/organization";
import type {
  ActiveMembershipRecord,
  MembershipRepositoryPort,
  OrganizationRepositoryPort,
} from "../src/modules/organizations/domain/ports.js";
import type { RoleRepositoryPort } from "../src/modules/permissions/domain/ports.js";
import { PermissionService } from "../src/modules/permissions/application/permission-service.js";
import type {
  MachineRecord,
  MachineRepositoryPort,
} from "../src/modules/equipment/domain/ports.js";
import type { MaintenanceRepositoryPort } from "../src/modules/maintenance/domain/ports.js";
import type { ProductRecord, ProductRepositoryPort } from "../src/modules/catalogue/domain/ports.js";
import type {
  RequirementRecord,
  RequirementRepositoryPort,
} from "../src/modules/marketplace/rfq/domain/ports.js";
import type {
  QuotationResponseRecord,
  QuotationResponseRepositoryPort,
} from "../src/modules/marketplace/quotation-response/domain/ports.js";
import type {
  AuctionBidRecord,
  AuctionParticipantRecord,
  AuctionRecord,
  AuctionRepositoryPort,
  AuctionResultRecord,
} from "../src/modules/marketplace/auction/domain/ports.js";
import type {
  CreateRentalInput,
  RentalRecord,
  RentalRepositoryPort,
  UpdateRentalTermsInput,
} from "../src/modules/marketplace/rental/domain/ports.js";
import { RentalService } from "../src/modules/marketplace/rental/application/rental-service.js";
import type {
  ApplyAcceptedOfferInput,
  CommercialQuotationRecord,
  CommercialQuotationRepositoryPort,
  CreateCommercialQuotationInput,
  CreateQuotationOfferInput,
  QuotationOfferRecord,
  QuotationOfferRepositoryPort,
  UpdateCommercialQuotationTermsInput,
} from "../src/modules/marketplace/commercial-quotation/domain/ports.js";
import { CommercialQuotationService } from "../src/modules/marketplace/commercial-quotation/application/commercial-quotation-service.js";
import type { NotificationRepositoryPort } from "../src/modules/notification/domain/ports.js";
import { NotificationService } from "../src/modules/notification/application/notification-service.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../src/shared/errors.js";

const OWNER_ROLE_ID = "role-owner";
const RC_ORG_ID = "org-rental-company";
const OTHER_RC_ORG_ID = "org-other-rental-company";
const RENTER_ORG_ID = "org-renter";
const MACHINE_ID = "machine-1";
const RETIRED_MACHINE_ID = "machine-retired";
const OPEN_REQUIREMENT_ID = "requirement-open";
const CLOSED_REQUIREMENT_ID = "requirement-closed";
const RESPONSE_ID = "response-1";
const WON_AUCTION_ID = "auction-won";
const LOST_AUCTION_ID = "auction-lost";
const OPEN_AUCTION_ID = "auction-open";
const UNSELECTED_LEADING_AUCTION_ID = "auction-unselected-leader";

function fakePermissionService(rcOrgType: OrganizationTypeCode = "rental_company") {
  const membershipRepository: MembershipRepositoryPort = {
    findActiveMembership: async (): Promise<ActiveMembershipRecord | undefined> => ({
      id: "membership-1",
      status: "active",
      role_id: OWNER_ROLE_ID,
    }),
    create: async () => {
      throw new Error("not used in this test");
    },
    listWithOrganizationByUserId: async () => [],
  };
  const roleRepository: RoleRepositoryPort = {
    findByName: async (name) => ({ id: OWNER_ROLE_ID, name }),
    hasPermission: async (roleId) => roleId === OWNER_ROLE_ID,
    listPermissionCodesByRoleId: async (roleId) =>
      roleId === OWNER_ROLE_ID ? ["quotation.manage", "quotation.respond", "rental.manage"] : [],
  };
  return new PermissionService(
    membershipRepository,
    roleRepository,
    fakeOrganizationTypeRepository({
      [RC_ORG_ID]: rcOrgType,
      [OTHER_RC_ORG_ID]: "rental_company",
      [RENTER_ORG_ID]: "renter",
    }),
  );
}

// Every caller swallows notification failures (best-effort side effect), so
// a throwing fake is sufficient — this file isn't testing notification
// behavior itself.
function fakeNotificationService(): NotificationService {
  const throwingRepo: NotificationRepositoryPort = {
    create: async () => {
      throw new Error("not used in this test");
    },
    listByOrganization: async () => {
      throw new Error("not used in this test");
    },
    countUnread: async () => {
      throw new Error("not used in this test");
    },
    markRead: async () => {
      throw new Error("not used in this test");
    },
    markAllRead: async () => {
      throw new Error("not used in this test");
    },
  };
  return new NotificationService(throwingRepo, fakePermissionService());
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
  };
}

function fakeOrganizationTypeRepository(
  organizationTypes: Record<string, OrganizationTypeCode>,
): OrganizationRepositoryPort {
  return {
    findTypeByCode: async () => {
      throw new Error("not used in this test");
    },
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async () => {
      throw new Error("not used in this test");
    },
    findWithTypeById: async (id) => {
      const organizationTypeCode = organizationTypes[id];
      if (!organizationTypeCode) return undefined;
      return {
        id,
        organization_type_id: `type-${organizationTypeCode}`,
        organization_type_code: organizationTypeCode,
        name: "Test Org",
        code: "TESTORG",
        created_at: new Date(),
      };
    },
    codeExists: async () => {
      throw new Error("not used in this test");
    },
    listByType: async (organizationTypeCode) =>
      Object.entries(organizationTypes)
        .filter(([, code]) => code === organizationTypeCode)
        .map(([id, code]) => ({
          id,
          organization_type_id: `type-${code}`,
          organization_type_code: code,
          name: `Test Org (${id})`,
          code: "TESTORG",
          created_at: new Date(),
        })),
  };
}

function machine(overrides: Partial<MachineRecord> = {}): MachineRecord {
  return {
    id: MACHINE_ID,
    organization_id: RC_ORG_ID,
    product_id: "product-1",
    asset_code: "EXC-001",
    chassis_number: null,
    registration_number: "RJ01AB1234",
    year_of_manufacture: null,
    status: "active",
    created_at: new Date(),
    ...overrides,
  };
}

function fakeMachineRepository(machines: MachineRecord[]): MachineRepositoryPort {
  return {
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async (id) => machines.find((m) => m.id === id),
    listByOrganization: async () => {
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

function requirement(overrides: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: OPEN_REQUIREMENT_ID,
    renter_organization_id: RENTER_ORG_ID,
    product_subcategory_id: "subcategory-1",
    capacity: null,
    capacity_unit: null,
    quantity: 1,
    project_name: null,
    project_location: null,
    requested_start_date: "2026-03-01",
    expected_duration_value: null,
    expected_duration_unit: null,
    shift_requirement: null,
    validity_date: "2026-02-15",
    status: "open",
    notes: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function fakeRequirementRepository(
  requirements: RequirementRecord[] = [
    requirement(),
    requirement({ id: CLOSED_REQUIREMENT_ID, status: "closed" }),
  ],
): RequirementRepositoryPort {
  const store = new Map(requirements.map((r) => [r.id, r]));
  return {
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async (id) => store.get(id),
    listByRenter: async () => {
      throw new Error("not used in this test");
    },
    listOpenForDiscovery: async () => {
      throw new Error("not used in this test");
    },
    updateStatus: async (id, status) => {
      const existing = store.get(id);
      if (!existing) throw new Error("not used in this test");
      const updated = { ...existing, status, updated_at: new Date() };
      store.set(id, updated);
      return updated;
    },
    updateFields: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeQuotationResponseRepository(
  responses: QuotationResponseRecord[] = [
    {
      id: RESPONSE_ID,
      requirement_id: OPEN_REQUIREMENT_ID,
      rental_company_organization_id: RC_ORG_ID,
      status: "interested",
      indicative_rate: 1200,
      indicative_rate_unit: "day",
      notes: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ],
): QuotationResponseRepositoryPort {
  return {
    submit: async () => {
      throw new Error("not used in this test");
    },
    findByRequirementAndOrganization: async () => {
      throw new Error("not used in this test");
    },
    findById: async (id) => responses.find((r) => r.id === id),
    listByRequirement: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeAuctionRepository(): AuctionRepositoryPort {
  const auctions: Record<string, AuctionRecord> = {
    [WON_AUCTION_ID]: {
      id: WON_AUCTION_ID,
      requirement_id: OPEN_REQUIREMENT_ID,
      created_by_organization_id: RENTER_ORG_ID,
      bidding_direction: "ascending",
      base_price: 1000,
      max_bids_per_participant: null,
      starts_at: new Date(),
      ends_at: new Date(),
      status: "closed",
      created_at: new Date(),
      updated_at: new Date(),
    },
    [LOST_AUCTION_ID]: {
      id: LOST_AUCTION_ID,
      requirement_id: OPEN_REQUIREMENT_ID,
      created_by_organization_id: RENTER_ORG_ID,
      bidding_direction: "ascending",
      base_price: 1000,
      max_bids_per_participant: null,
      starts_at: new Date(),
      ends_at: new Date(),
      status: "closed",
      created_at: new Date(),
      updated_at: new Date(),
    },
    [OPEN_AUCTION_ID]: {
      id: OPEN_AUCTION_ID,
      requirement_id: OPEN_REQUIREMENT_ID,
      created_by_organization_id: RENTER_ORG_ID,
      bidding_direction: "ascending",
      base_price: 1000,
      max_bids_per_participant: null,
      starts_at: new Date(),
      ends_at: new Date(),
      status: "live",
      created_at: new Date(),
      updated_at: new Date(),
    },
    [UNSELECTED_LEADING_AUCTION_ID]: {
      id: UNSELECTED_LEADING_AUCTION_ID,
      requirement_id: OPEN_REQUIREMENT_ID,
      created_by_organization_id: RENTER_ORG_ID,
      bidding_direction: "ascending",
      base_price: 1000,
      max_bids_per_participant: null,
      starts_at: new Date(),
      ends_at: new Date(),
      status: "closed",
      created_at: new Date(),
      updated_at: new Date(),
    },
  };
  const results: Record<string, AuctionResultRecord> = {
    [WON_AUCTION_ID]: {
      auction_id: WON_AUCTION_ID,
      winning_bid_id: "bid-rc",
      winning_amount: 1500,
      closed_at: new Date(),
    },
    [LOST_AUCTION_ID]: {
      auction_id: LOST_AUCTION_ID,
      winning_bid_id: "bid-other",
      winning_amount: 1400,
      closed_at: new Date(),
    },
  };
  const bids: AuctionBidRecord[] = [
    {
      id: "bid-rc",
      auction_id: WON_AUCTION_ID,
      participant_id: "participant-rc",
      amount: 1500,
      created_at: new Date(),
    },
    {
      id: "bid-other",
      auction_id: LOST_AUCTION_ID,
      participant_id: "participant-other",
      amount: 1400,
      created_at: new Date(),
    },
    {
      id: "bid-rc-unselected",
      auction_id: UNSELECTED_LEADING_AUCTION_ID,
      participant_id: "participant-rc-unselected",
      amount: 1600,
      created_at: new Date(),
    },
  ];
  const participants: Record<string, AuctionParticipantRecord> = {
    // The auction owner has already selected this participant — the only
    // state that lets it formalize the win into a quotation.
    "participant-rc": {
      id: "participant-rc",
      auction_id: WON_AUCTION_ID,
      rental_company_organization_id: RC_ORG_ID,
      status: "selected",
      created_at: new Date(),
    },
    "participant-other": {
      id: "participant-other",
      auction_id: LOST_AUCTION_ID,
      rental_company_organization_id: OTHER_RC_ORG_ID,
      status: "selected",
      created_at: new Date(),
    },
    // Holds the leading bid but was never selected by the auction owner —
    // proves bid rank alone is not enough (see the regression test below).
    "participant-rc-unselected": {
      id: "participant-rc-unselected",
      auction_id: UNSELECTED_LEADING_AUCTION_ID,
      rental_company_organization_id: RC_ORG_ID,
      status: "approved",
      created_at: new Date(),
    },
  };

  return {
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async (id) => auctions[id],
    listByRequirement: async () => {
      throw new Error("not used in this test");
    },
    syncStatus: async () => {
      throw new Error("not used in this test");
    },
    closeNow: async () => {
      throw new Error("not used in this test");
    },
    cancel: async () => {
      throw new Error("not used in this test");
    },
    addParticipant: async () => {
      throw new Error("not used in this test");
    },
    findParticipantByOrganization: async (auctionId, organizationId) =>
      Object.values(participants).find(
        (p) => p.auction_id === auctionId && p.rental_company_organization_id === organizationId,
      ),
    findParticipantById: async (id) => participants[id],
    listParticipants: async () => {
      throw new Error("not used in this test");
    },
    updateParticipantStatus: async () => {
      throw new Error("not used in this test");
    },
    placeBid: async () => {
      throw new Error("not used in this test");
    },
    listBids: async (auctionId) => bids.filter((b) => b.auction_id === auctionId),
    findResult: async (auctionId) => results[auctionId],
    listEvents: async () => {
      throw new Error("not used in this test");
    },
    listByOwnerOrganization: async () => {
      throw new Error("not used in this test");
    },
    listByParticipantOrganization: async () => {
      throw new Error("not used in this test");
    },
  };
}

// Mirrors RentalRepository's in-memory test double from rental-service.test.ts.
function overlaps(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null,
): boolean {
  const aEndBound = aEnd ?? "9999-12-31";
  const bEndBound = bEnd ?? "9999-12-31";
  return aStart <= bEndBound && bStart <= aEndBound;
}

function fakeRentalRepository(): RentalRepositoryPort {
  const rentals = new Map<string, RentalRecord>();
  let nextId = 1;
  return {
    create: async (input: CreateRentalInput) => {
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
    listByOrganization: async (organizationId) =>
      [...rentals.values()].filter((r) => r.rental_company_organization_id === organizationId),
    listByRenterOrganization: async (renterOrganizationId) =>
      [...rentals.values()].filter((r) => r.renter_organization_id === renterOrganizationId),
    updateTerms: async (id: string, updates: UpdateRentalTermsInput) => {
      const existing = rentals.get(id);
      if (!existing) throw new Error("not used in this test");
      const updated = { ...existing, ...updates, updated_at: new Date() };
      rentals.set(id, updated);
      return updated;
    },
    updateStatus: async (id, status) => {
      const existing = rentals.get(id);
      if (!existing) throw new Error("not used in this test");
      const updated = { ...existing, status, updated_at: new Date() };
      rentals.set(id, updated);
      return updated;
    },
    isAvailable: async (machineId, startDate, endDate) => {
      const committed = [...rentals.values()].filter(
        (r) => r.machine_id === machineId && ["confirmed", "active", "off_rent"].includes(r.status),
      );
      return !committed.some((r) => overlaps(startDate, endDate, r.start_date, r.end_date));
    },
  };
}

function fakeCommercialQuotationRepository(): CommercialQuotationRepositoryPort {
  const quotations = new Map<string, CommercialQuotationRecord>();
  let nextId = 1;
  let sequence = 1;

  return {
    nextReferenceNumber: async () => `Q-2026-${sequence++}`,
    create: async (input: CreateCommercialQuotationInput) => {
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
        dehire_terms: input.dehireTerms ?? null,
        operator_scope: input.operatorScope ?? null,
        notice_period_days: input.noticePeriodDays ?? null,
        validity_date: input.validityDate,
        commercial_notes: input.commercialNotes ?? null,
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
    updateTerms: async (id: string, updates: UpdateCommercialQuotationTermsInput) => {
      const existing = quotations.get(id);
      if (!existing) throw new Error("not used in this test");
      const updated: CommercialQuotationRecord = {
        ...existing,
        ...(updates.mobilizationCharge !== undefined && {
          mobilization_charge: updates.mobilizationCharge,
        }),
        ...(updates.demobilizationCharge !== undefined && {
          demobilization_charge: updates.demobilizationCharge,
        }),
        ...(updates.overtimeRate !== undefined && { overtime_rate: updates.overtimeRate }),
        ...(updates.paymentTerms !== undefined && { payment_terms: updates.paymentTerms }),
        ...(updates.shiftStructure !== undefined && { shift_structure: updates.shiftStructure }),
        ...(updates.sundayCondition !== undefined && {
          sunday_condition: updates.sundayCondition,
        }),
        ...(updates.fuelNorms !== undefined && { fuel_norms: updates.fuelNorms }),
        ...(updates.dehireTerms !== undefined && { dehire_terms: updates.dehireTerms }),
        ...(updates.operatorScope !== undefined && { operator_scope: updates.operatorScope }),
        ...(updates.noticePeriodDays !== undefined && {
          notice_period_days: updates.noticePeriodDays,
        }),
        ...(updates.commercialNotes !== undefined && {
          commercial_notes: updates.commercialNotes,
        }),
        renter_accepted_at: null,
        updated_at: new Date(),
      };
      quotations.set(id, updated);
      return updated;
    },
    applyAcceptedOffer: async (id: string, input: ApplyAcceptedOfferInput) => {
      const existing = quotations.get(id);
      if (!existing) throw new Error("not used in this test");
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
      if (!existing) throw new Error("not used in this test");
      const updated = { ...existing, status, updated_at: new Date() };
      quotations.set(id, updated);
      return updated;
    },
    setRenterAccepted: async (id, accepted) => {
      const existing = quotations.get(id);
      if (!existing) throw new Error("not used in this test");
      const updated: CommercialQuotationRecord = {
        ...existing,
        renter_accepted_at: accepted ? new Date() : null,
        updated_at: new Date(),
      };
      quotations.set(id, updated);
      return updated;
    },
    expireIfDue: async (id) => {
      const existing = quotations.get(id);
      if (!existing) return undefined;
      const isExpirable = existing.status === "sent" || existing.status === "negotiating";
      const isPastValidity = existing.validity_date < new Date().toISOString().slice(0, 10);
      if (isExpirable && isPastValidity) {
        const updated: CommercialQuotationRecord = {
          ...existing,
          status: "expired",
          updated_at: new Date(),
        };
        quotations.set(id, updated);
        return updated;
      }
      return existing;
    },
  };
}

function fakeQuotationOfferRepository(): QuotationOfferRepositoryPort {
  const offers = new Map<string, QuotationOfferRecord>();
  let nextId = 1;
  return {
    create: async (input: CreateQuotationOfferInput) => {
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
      if (!existing) throw new Error("not used in this test");
      const updated = { ...existing, status };
      offers.set(id, updated);
      return updated;
    },
  };
}

// No test in this file exercises the Maintenance/Rental cross-check —
// award() only needs createRental to succeed.
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
    updateStatus: async () => {
      throw new Error("not used in this test");
    },
    hasOverlappingMaintenance: async () => false,
  };
}

function buildRentalService(machines: MachineRecord[] = [machine()]) {
  return {
    rentalService: new RentalService(
      fakeRentalRepository(),
      fakeMachineRepository(machines),
      fakeOrganizationTypeRepository({ [RENTER_ORG_ID]: "renter", [RC_ORG_ID]: "rental_company" }),
      fakePermissionService(),
      fakeMaintenanceRepository(),
    ),
  };
}

function buildService(machines: MachineRecord[] = [machine()]) {
  const { rentalService } = buildRentalService(machines);
  return new CommercialQuotationService(
    fakeCommercialQuotationRepository(),
    fakeQuotationOfferRepository(),
    fakeMachineRepository(machines),
    fakeProductRepository(),
    fakeOrganizationTypeRepository({ [RENTER_ORG_ID]: "renter", [RC_ORG_ID]: "rental_company" }),
    fakeRequirementRepository(),
    fakeQuotationResponseRepository(),
    fakeAuctionRepository(),
    rentalService,
    fakePermissionService(),
    fakeNotificationService(),
  );
}

const pathBInput = {
  clientSnapshot: { name: "Acme Construction" },
  machineId: MACHINE_ID,
  startDate: "2026-03-01",
  endDate: "2026-03-10",
  rate: 5000,
  rateUnit: "day" as const,
  validityDate: "2026-12-31",
};

describe("CommercialQuotationService", () => {
  it("rejects creating a quotation against an unknown machine", async () => {
    const service = buildService();
    await expect(
      service.createQuotation("user-1", RC_ORG_ID, { ...pathBInput, machineId: "unknown" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects quotation management for a Renter organization", async () => {
    const service = buildService();
    await expect(service.createQuotation("user-1", RENTER_ORG_ID, pathBInput)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("creates a Path B quotation for a known external client, no requirement", async () => {
    const service = buildService();
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, pathBInput);
    expect(quotation.status).toBe("draft");
    expect(quotation.referenceNumber).toMatch(/^Q-\d{4}-\d+$/);
    expect(quotation.requirementId).toBeNull();
  });

  it("creates a Path A quotation formalizing a response to an open requirement", async () => {
    const service = buildService();
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
      ...pathBInput,
      clientSnapshot: undefined,
      renterOrganizationId: RENTER_ORG_ID,
      requirementId: OPEN_REQUIREMENT_ID,
      quotationResponseId: RESPONSE_ID,
    });
    expect(quotation.requirementId).toBe(OPEN_REQUIREMENT_ID);
    expect(quotation.quotationResponseId).toBe(RESPONSE_ID);
  });

  it("rejects quoting against a requirement that is not open", async () => {
    const service = buildService();
    await expect(
      service.createQuotation("user-1", RC_ORG_ID, {
        ...pathBInput,
        clientSnapshot: undefined,
        renterOrganizationId: RENTER_ORG_ID,
        requirementId: CLOSED_REQUIREMENT_ID,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects formalizing an auction win for an organization that didn't win it", async () => {
    const service = buildService();
    await expect(
      service.createQuotation("user-1", RC_ORG_ID, {
        ...pathBInput,
        sourceAuctionId: LOST_AUCTION_ID,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects formalizing an auction that hasn't closed yet", async () => {
    const service = buildService();
    await expect(
      service.createQuotation("user-1", RC_ORG_ID, {
        ...pathBInput,
        sourceAuctionId: OPEN_AUCTION_ID,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("creates a Path C quotation formalizing a real auction win", async () => {
    const service = buildService();
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
      ...pathBInput,
      sourceAuctionId: WON_AUCTION_ID,
    });
    expect(quotation.sourceAuctionId).toBe(WON_AUCTION_ID);
  });

  // Regression: holding the leading bid is not, on its own, authorization —
  // only the auction owner's explicit selection is. Without this gate a
  // Rental Company could award itself with zero Renter action.
  it("rejects formalizing a quotation for the leading bidder when the owner never selected it", async () => {
    const service = buildService();
    await expect(
      service.createQuotation("user-1", RC_ORG_ID, {
        ...pathBInput,
        sourceAuctionId: UNSELECTED_LEADING_AUCTION_ID,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("allows editing terms while draft, rejects once withdrawn", async () => {
    const service = buildService();
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, pathBInput);
    const updated = await service.updateTerms("user-1", RC_ORG_ID, quotation.id, {
      commercialNotes: "Updated note",
    });
    expect(updated.commercialNotes).toBe("Updated note");

    await service.withdrawQuotation("user-1", RC_ORG_ID, quotation.id);
    await expect(
      service.updateTerms("user-1", RC_ORG_ID, quotation.id, { commercialNotes: "too late" }),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects sending a quotation twice", async () => {
    const service = buildService();
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, pathBInput);
    await service.sendQuotation("user-1", RC_ORG_ID, quotation.id);
    await expect(service.sendQuotation("user-1", RC_ORG_ID, quotation.id)).rejects.toThrow(
      ConflictError,
    );
  });

  it("runs a full negotiation round: offer, supersede, accept", async () => {
    const service = buildService();
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
      ...pathBInput,
      clientSnapshot: undefined,
      renterOrganizationId: RENTER_ORG_ID,
    });
    await service.sendQuotation("user-1", RC_ORG_ID, quotation.id);

    await expect(
      service.makeOffer("user-2", RENTER_ORG_ID, "unknown-quotation", {
        rate: 4500,
        rateUnit: "day",
        startDate: "2026-03-01",
      }),
    ).rejects.toThrow(NotFoundError);

    const firstOffer = await service.makeOffer("user-2", RENTER_ORG_ID, quotation.id, {
      rate: 4500,
      rateUnit: "day",
      startDate: "2026-03-01",
    });
    const secondOffer = await service.makeOffer("user-1", RC_ORG_ID, quotation.id, {
      rate: 4800,
      rateUnit: "day",
      startDate: "2026-03-01",
    });

    const offers = await service.listOffers("user-1", RC_ORG_ID, quotation.id);
    expect(offers.find((o) => o.id === firstOffer.id)?.status).toBe("superseded");
    expect(offers.find((o) => o.id === secondOffer.id)?.status).toBe("pending");

    await expect(
      service.acceptOffer("user-1", RC_ORG_ID, quotation.id, secondOffer.id),
    ).rejects.toThrow(ForbiddenError);

    const accepted = await service.acceptOffer(
      "user-2",
      RENTER_ORG_ID,
      quotation.id,
      secondOffer.id,
    );
    expect(accepted.rate).toBe(4800);
    expect(accepted.status).toBe("negotiating");
  });

  it("rejects making an offer before the quotation has been sent", async () => {
    const service = buildService();
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, pathBInput);
    await expect(
      service.makeOffer("user-1", RC_ORG_ID, quotation.id, {
        rate: 4500,
        rateUnit: "day",
        startDate: "2026-03-01",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("awards a sent quotation, creating a real Rental and closing its Requirement", async () => {
    const machines = [machine()];
    const rentalRepository = fakeRentalRepository();
    const rentalService = new RentalService(
      rentalRepository,
      fakeMachineRepository(machines),
      fakeOrganizationTypeRepository({ [RENTER_ORG_ID]: "renter", [RC_ORG_ID]: "rental_company" }),
      fakePermissionService(),
      fakeMaintenanceRepository(),
    );
    const requirementRepository = fakeRequirementRepository();
    const service = new CommercialQuotationService(
      fakeCommercialQuotationRepository(),
      fakeQuotationOfferRepository(),
      fakeMachineRepository(machines),
      fakeProductRepository(),
      fakeOrganizationTypeRepository({ [RENTER_ORG_ID]: "renter", [RC_ORG_ID]: "rental_company" }),
      requirementRepository,
      fakeQuotationResponseRepository(),
      fakeAuctionRepository(),
      rentalService,
      fakePermissionService(),
      fakeNotificationService(),
    );

    const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
      ...pathBInput,
      clientSnapshot: undefined,
      renterOrganizationId: RENTER_ORG_ID,
      requirementId: OPEN_REQUIREMENT_ID,
      quotationResponseId: RESPONSE_ID,
    });
    await service.sendQuotation("user-1", RC_ORG_ID, quotation.id);
    await service.acceptQuotation("user-2", RENTER_ORG_ID, quotation.id);

    const awarded = await service.awardQuotation("user-1", RC_ORG_ID, quotation.id);
    expect(awarded.status).toBe("awarded");

    const rentals = await rentalRepository.listByOrganization(RC_ORG_ID);
    expect(rentals).toHaveLength(1);
    expect(rentals[0]?.status).toBe("confirmed");

    const requirement = await requirementRepository.findById(OPEN_REQUIREMENT_ID);
    expect(requirement?.status).toBe("closed");

    await expect(service.awardQuotation("user-1", RC_ORG_ID, quotation.id)).rejects.toThrow(
      ConflictError,
    );
  });

  // Regression: a Rental Company could previously send a Path A/B quotation
  // to a real in-app Renter and award it with zero Renter action — the same
  // "award to self" shape already closed for the auction path.
  it("rejects awarding a Path A quotation to a real Renter who has not accepted it", async () => {
    const service = buildService();
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
      ...pathBInput,
      clientSnapshot: undefined,
      renterOrganizationId: RENTER_ORG_ID,
      requirementId: OPEN_REQUIREMENT_ID,
      quotationResponseId: RESPONSE_ID,
    });
    await service.sendQuotation("user-1", RC_ORG_ID, quotation.id);
    await expect(service.awardQuotation("user-1", RC_ORG_ID, quotation.id)).rejects.toThrow(
      ConflictError,
    );
  });

  it("does not require Renter acceptance for a Path C quotation — the auction selection is that consent", async () => {
    const service = buildService();
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
      ...pathBInput,
      clientSnapshot: undefined,
      renterOrganizationId: RENTER_ORG_ID,
      sourceAuctionId: WON_AUCTION_ID,
    });
    await service.sendQuotation("user-1", RC_ORG_ID, quotation.id);
    const awarded = await service.awardQuotation("user-1", RC_ORG_ID, quotation.id);
    expect(awarded.status).toBe("awarded");
  });

  it("does not require Renter acceptance for an external client quotation — there is no in-app Renter to click Accept", async () => {
    const service = buildService();
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, pathBInput);
    await service.sendQuotation("user-1", RC_ORG_ID, quotation.id);
    const awarded = await service.awardQuotation("user-1", RC_ORG_ID, quotation.id);
    expect(awarded.status).toBe("awarded");
  });

  it("clears a prior Renter acceptance when the Rental Company edits terms directly, requiring re-acceptance", async () => {
    const service = buildService();
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
      ...pathBInput,
      clientSnapshot: undefined,
      renterOrganizationId: RENTER_ORG_ID,
    });
    await service.sendQuotation("user-1", RC_ORG_ID, quotation.id);
    await service.acceptQuotation("user-2", RENTER_ORG_ID, quotation.id);
    await service.updateTerms("user-1", RC_ORG_ID, quotation.id, { paymentTerms: "Net 15" });
    await expect(service.awardQuotation("user-1", RC_ORG_ID, quotation.id)).rejects.toThrow(
      ConflictError,
    );
  });

  it("rejects a Rental Company accepting its own quotation on the Renter's behalf", async () => {
    const service = buildService();
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
      ...pathBInput,
      clientSnapshot: undefined,
      renterOrganizationId: RENTER_ORG_ID,
    });
    await service.sendQuotation("user-1", RC_ORG_ID, quotation.id);
    await expect(service.acceptQuotation("user-1", RC_ORG_ID, quotation.id)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("rejects a Renter rejecting a quotation that isn't theirs (hides client-snapshot quotations)", async () => {
    const service = buildService();
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, pathBInput);
    await service.sendQuotation("user-1", RC_ORG_ID, quotation.id);
    await expect(service.rejectQuotation("user-2", RENTER_ORG_ID, quotation.id)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("lets the real Renter party reject a sent quotation", async () => {
    const service = buildService();
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
      ...pathBInput,
      clientSnapshot: undefined,
      renterOrganizationId: RENTER_ORG_ID,
    });
    await service.sendQuotation("user-1", RC_ORG_ID, quotation.id);
    const rejected = await service.rejectQuotation("user-2", RENTER_ORG_ID, quotation.id);
    expect(rejected.status).toBe("rejected");
  });

  it("hides a quotation from an organization that isn't a party to it", async () => {
    const service = buildService();
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, pathBInput);
    await expect(service.getQuotation("user-3", OTHER_RC_ORG_ID, quotation.id)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("resolves machine asset code/product name for the Renter party, not the Rental Company", async () => {
    const service = buildService();
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
      ...pathBInput,
      clientSnapshot: undefined,
      renterOrganizationId: RENTER_ORG_ID,
    });

    const asRenter = await service.getQuotation("user-2", RENTER_ORG_ID, quotation.id);
    expect(asRenter.machineAssetCode).toBe("EXC-001");
    expect(asRenter.productName).toBe("Caterpillar 320");

    const asRentalCompany = await service.getQuotation("user-1", RC_ORG_ID, quotation.id);
    expect(asRentalCompany.machineAssetCode).toBeNull();
    expect(asRentalCompany.productName).toBeNull();
  });

  it("resolves machine info on the Renter's own quotations list", async () => {
    const service = buildService();
    await service.createQuotation("user-1", RC_ORG_ID, {
      ...pathBInput,
      clientSnapshot: undefined,
      renterOrganizationId: RENTER_ORG_ID,
    });

    const list = await service.listQuotationsForRenter("user-2", RENTER_ORG_ID);
    expect(list).toHaveLength(1);
    expect(list[0]?.machineAssetCode).toBe("EXC-001");
  });

  it("lazily expires a sent quotation once its validity date has passed", async () => {
    const service = buildService();
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
      ...pathBInput,
      validityDate: "2020-01-01",
    });
    await service.sendQuotation("user-1", RC_ORG_ID, quotation.id);
    const fetched = await service.getQuotation("user-1", RC_ORG_ID, quotation.id);
    expect(fetched.status).toBe("expired");
  });

  it("rejects retired-machine quotations", async () => {
    const service = buildService([machine({ id: RETIRED_MACHINE_ID, status: "retired" })]);
    await expect(
      service.createQuotation("user-1", RC_ORG_ID, {
        ...pathBInput,
        machineId: RETIRED_MACHINE_ID,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects a renterOrganizationId that doesn't match the given requirement's own renter", async () => {
    const service = buildService();
    await expect(
      service.createQuotation("user-1", RC_ORG_ID, {
        ...pathBInput,
        clientSnapshot: undefined,
        renterOrganizationId: OTHER_RC_ORG_ID,
        requirementId: OPEN_REQUIREMENT_ID,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("lists Renter organizations for the counterparty picker, gated by quotation.manage", async () => {
    const service = buildService();
    const renters = await service.listRenterOrganizations("user-1", RC_ORG_ID);
    expect(renters).toHaveLength(1);
    expect(renters[0]?.id).toBe(RENTER_ORG_ID);
    expect(renters[0]?.organizationTypeCode).toBe("renter");

    await expect(service.listRenterOrganizations("user-1", RENTER_ORG_ID)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("lists Rental Company organizations for a Renter's own quotations list, gated by quotation.respond", async () => {
    const service = buildService();
    const rentalCompanies = await service.listRentalCompanyOrganizations("user-1", RENTER_ORG_ID);
    expect(rentalCompanies).toHaveLength(1);
    expect(rentalCompanies[0]?.id).toBe(RC_ORG_ID);
    expect(rentalCompanies[0]?.organizationTypeCode).toBe("rental_company");

    await expect(
      service.listRentalCompanyOrganizations("user-1", RC_ORG_ID),
    ).rejects.toThrow(ForbiddenError);
  });
});
