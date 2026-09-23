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
import type {
  ProductRecord,
  ProductRepositoryPort,
} from "../src/modules/catalogue/domain/ports.js";
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
  QuotationScopeItemRecord,
  QuotationScopeItemRepositoryPort,
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
    updateRole: async () => {
      throw new Error("not used in this test");
    },
    findActiveMembership: async (): Promise<ActiveMembershipRecord | undefined> => ({
      id: "membership-1",
      status: "active",
      role_id: OWNER_ROLE_ID,
    }),
    create: async () => {
      throw new Error("not used in this test");
    },
    listWithOrganizationByUserId: async () => [],
    listByOrganization: async () => {
      throw new Error("not used in this test");
    },
  };
  const roleRepository: RoleRepositoryPort = {
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
    create: async () => {
      throw new Error("not used in this test");
    },
    update: async () => {
      throw new Error("not used in this test");
    },
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
    // Notification messages now interpolate the acting org's name — several
    // notify() sites across CommercialQuotationService/RentalService resolve
    // it via this method.
    findById: async (id) => {
      const organizationTypeCode = organizationTypes[id];
      if (!organizationTypeCode) return undefined;
      return {
        id,
        organization_type_id: `type-${organizationTypeCode}`,
        name: "Test Org",
        code: "TESTORG",
        status: "active",
        created_at: new Date(),
      };
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
        status: "active",
        created_at: new Date(),
      };
    },
    listAllForPlatformAdmin: async () => {
      throw new Error("not used in this test");
    },
    updateStatus: async () => {
      throw new Error("not used in this test");
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
          status: "active",
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
    search: async () => {
      throw new Error("not used in this test");
    },
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
    project_id: "project-1",
    product_subcategory_id: "subcategory-1",
    boom_length: null,
    capacity: null,
    capacity_unit: null,
    quantity: 1,
    project_name: null,
    project_location: null,
    requested_start_date: "2026-03-01",
    expected_duration_value: null,
    expected_duration_unit: null,
    shift_pattern: null,
    crew_requirement: null,
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
    search: async () => {
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
      quotation_requested_at: null,
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
    markQuotationRequested: async () => {
      throw new Error("not used in this test");
    },
    listRequestedByRentalCompanyOrganization: async () => {
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
    listAllForPlatformAdmin: async () => {
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
        actual_start_date: null,
        actual_end_date: null,
        actual_dates_verification_status: null,
        actual_dates_dispute_reason: null,
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
    updateStatus: async (id, status, actualDate) => {
      const existing = rentals.get(id);
      if (!existing) throw new Error("not used in this test");
      const updated = {
        ...existing,
        status,
        ...(status === "active" && actualDate !== undefined
          ? { actual_start_date: actualDate, actual_dates_verification_status: "pending" as const }
          : {}),
        ...(status === "off_rent" && actualDate !== undefined
          ? { actual_end_date: actualDate, actual_dates_verification_status: "pending" as const }
          : {}),
        updated_at: new Date(),
      };
      rentals.set(id, updated);
      return updated;
    },
    setActualDatesVerification: async (id, status, disputeReason) => {
      const existing = rentals.get(id);
      if (!existing) throw new Error("not used in this test");
      const updated = {
        ...existing,
        actual_dates_verification_status: status,
        actual_dates_dispute_reason: status === "disputed" ? (disputeReason ?? null) : null,
        updated_at: new Date(),
      };
      rentals.set(id, updated);
      return updated;
    },
    isAvailable: async (machineId, startDate, endDate) => {
      const committed = [...rentals.values()].filter(
        (r) => r.machine_id === machineId && ["confirmed", "active", "off_rent"].includes(r.status),
      );
      return !committed.some((r) => overlaps(startDate, endDate, r.start_date, r.end_date));
    },
    searchByOrganization: async () => {
      throw new Error("not used in this test");
    },
    searchByRenterOrganization: async () => {
      throw new Error("not used in this test");
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
        proposed_alternate_start_date: null,
        proposed_alternate_end_date: null,
        alternate_date_status: "none",
        alternate_date_reason: null,
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
        ...(updates.fuelScope !== undefined && { fuel_scope: updates.fuelScope }),
        ...(updates.dehireTerms !== undefined && { dehire_terms: updates.dehireTerms }),
        ...(updates.operatorScope !== undefined && { operator_scope: updates.operatorScope }),
        ...(updates.accommodationScope !== undefined && {
          accommodation_scope: updates.accommodationScope,
        }),
        ...(updates.workingHours !== undefined && { working_hours: updates.workingHours }),
        ...(updates.workingDaysPerWeek !== undefined && {
          working_days_per_week: updates.workingDaysPerWeek,
        }),
        ...(updates.minimumRentalPeriodValue !== undefined && {
          minimum_rental_period_value: updates.minimumRentalPeriodValue,
        }),
        ...(updates.minimumRentalPeriodUnit !== undefined && {
          minimum_rental_period_unit: updates.minimumRentalPeriodUnit,
        }),
        ...(updates.gstTerms !== undefined && { gst_terms: updates.gstTerms }),
        ...(updates.noticePeriodDays !== undefined && {
          notice_period_days: updates.noticePeriodDays,
        }),
        ...(updates.commercialNotes !== undefined && {
          commercial_notes: updates.commercialNotes,
        }),
        ...(updates.companyTerms !== undefined && { company_terms: updates.companyTerms }),
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
    searchByRentalCompany: async (rentalCompanyOrganizationId, query) =>
      [...quotations.values()].filter(
        (q) =>
          q.rental_company_organization_id === rentalCompanyOrganizationId &&
          (q.reference_number.includes(query) || q.client_snapshot?.name?.includes(query)),
      ),
    searchByRenter: async (renterOrganizationId, query) =>
      [...quotations.values()].filter(
        (q) =>
          q.renter_organization_id === renterOrganizationId &&
          (q.reference_number.includes(query) || q.client_snapshot?.name?.includes(query)),
      ),
    proposeAlternateDates: async (id, input) => {
      const existing = quotations.get(id);
      if (!existing) throw new Error("not used in this test");
      const updated: CommercialQuotationRecord = {
        ...existing,
        proposed_alternate_start_date: input.startDate,
        proposed_alternate_end_date: input.endDate ?? null,
        alternate_date_status: "pending",
        alternate_date_reason: input.reason ?? null,
        updated_at: new Date(),
      };
      quotations.set(id, updated);
      return updated;
    },
    respondToAlternateDates: async (id, decision) => {
      const existing = quotations.get(id);
      if (!existing) throw new Error("not used in this test");
      const updated: CommercialQuotationRecord = {
        ...existing,
        ...(decision === "accepted"
          ? {
              start_date: existing.proposed_alternate_start_date ?? existing.start_date,
              end_date: existing.proposed_alternate_end_date,
            }
          : {}),
        alternate_date_status: "none",
        proposed_alternate_start_date: null,
        proposed_alternate_end_date: null,
        alternate_date_reason: null,
        updated_at: new Date(),
      };
      quotations.set(id, updated);
      return updated;
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
    listByOrganization: async () => {
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
      fakeNotificationService(),
    ),
  };
}

function buildService(machines: MachineRecord[] = [machine()], requirements?: RequirementRecord[]) {
  const { rentalService } = buildRentalService(machines);
  return new CommercialQuotationService(
    fakeCommercialQuotationRepository(),
    fakeQuotationOfferRepository(),
    fakeQuotationScopeItemRepository(),
    fakeMachineRepository(machines),
    fakeProductRepository(),
    fakeOrganizationTypeRepository({ [RENTER_ORG_ID]: "renter", [RC_ORG_ID]: "rental_company" }),
    fakeRequirementRepository(requirements),
    fakeQuotationResponseRepository(),
    fakeAuctionRepository(),
    rentalService,
    { createFromAward: async () => undefined },
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

  it("locks the quotation's rate unit to the requirement's own expectedDurationUnit, ignoring the caller's choice", async () => {
    const service = buildService([machine()], [requirement({ expected_duration_unit: "month" })]);
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
      ...pathBInput,
      clientSnapshot: undefined,
      renterOrganizationId: RENTER_ORG_ID,
      requirementId: OPEN_REQUIREMENT_ID,
      rateUnit: "day",
    });
    expect(quotation.rateUnit).toBe("month");
  });

  it("falls back to the caller's chosen rate unit when the requirement has no expectedDurationUnit", async () => {
    const service = buildService([machine()], [requirement()]);
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
      ...pathBInput,
      clientSnapshot: undefined,
      renterOrganizationId: RENTER_ORG_ID,
      requirementId: OPEN_REQUIREMENT_ID,
      rateUnit: "day",
    });
    expect(quotation.rateUnit).toBe("day");
  });

  it("locks the quotation's dates to the requirement's own requestedStartDate and computed duration, ignoring the caller's choice", async () => {
    const service = buildService(
      [machine()],
      [
        requirement({
          requested_start_date: "2026-05-01",
          expected_duration_value: 2,
          expected_duration_unit: "week",
        }),
      ],
    );
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
      ...pathBInput,
      clientSnapshot: undefined,
      renterOrganizationId: RENTER_ORG_ID,
      requirementId: OPEN_REQUIREMENT_ID,
      startDate: "2099-01-01",
      endDate: "2099-02-01",
    });
    expect(quotation.startDate).toBe("2026-05-01");
    expect(quotation.endDate).toBe("2026-05-15");
  });

  it("locks startDate to the requirement but leaves endDate to the caller when the requirement has no duration", async () => {
    const service = buildService(
      [machine()],
      [requirement({ requested_start_date: "2026-04-01" })],
    );
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
      ...pathBInput,
      clientSnapshot: undefined,
      renterOrganizationId: RENTER_ORG_ID,
      requirementId: OPEN_REQUIREMENT_ID,
      startDate: "2026-03-01",
      endDate: "2026-03-10",
    });
    expect(quotation.startDate).toBe("2026-04-01");
    expect(quotation.endDate).toBe("2026-03-10");
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

  // Regression: acceptQuotation used to just flag the quotation's own
  // (possibly stale) rate field as accepted, ignoring a still-pending
  // counter-offer entirely — a Renter clicking "Accept" while a Rental
  // Company counter-offer sat unresolved would record acceptance against
  // the wrong number, and awardQuotation would create the Rental at that
  // wrong rate. Reported live by the user via a screenshot showing exactly
  // this mismatch (displayed "countered at X" not matching the pending
  // offer in the trail).
  it("acceptQuotation applies a still-pending counter-offer from the Rental Company before recording acceptance", async () => {
    const service = buildService();
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
      ...pathBInput,
      clientSnapshot: undefined,
      renterOrganizationId: RENTER_ORG_ID,
      rate: 4500,
    });
    await service.sendQuotation("user-1", RC_ORG_ID, quotation.id);

    // Renter counters, then the Rental Company counters that — leaving the
    // Rental Company's offer pending, never explicitly accepted via
    // acceptOffer.
    await service.makeOffer("user-2", RENTER_ORG_ID, quotation.id, {
      rate: 4200,
      rateUnit: "day",
      startDate: "2026-03-01",
    });
    const rentalCompanyOffer = await service.makeOffer("user-1", RC_ORG_ID, quotation.id, {
      rate: 4350,
      rateUnit: "day",
      startDate: "2026-03-01",
    });

    const accepted = await service.acceptQuotation("user-2", RENTER_ORG_ID, quotation.id);
    expect(accepted.rate).toBe(4350); // the pending offer's rate, not the original 4500
    expect(accepted.renterAcceptedAt).not.toBeNull();

    const offers = await service.listOffers("user-1", RC_ORG_ID, quotation.id);
    expect(offers.find((o) => o.id === rentalCompanyOffer.id)?.status).toBe("accepted");
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
      fakeNotificationService(),
    );
    const requirementRepository = fakeRequirementRepository();
    const service = new CommercialQuotationService(
      fakeCommercialQuotationRepository(),
      fakeQuotationOfferRepository(),
      fakeQuotationScopeItemRepository(),
      fakeMachineRepository(machines),
      fakeProductRepository(),
      fakeOrganizationTypeRepository({ [RENTER_ORG_ID]: "renter", [RC_ORG_ID]: "rental_company" }),
      requirementRepository,
      fakeQuotationResponseRepository(),
      fakeAuctionRepository(),
      rentalService,
      { createFromAward: async () => undefined },
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

  // Regression: a Path C (auction-sourced) quotation used to be exempt from
  // requiring Renter acceptance, on the reasoning that the earlier auction
  // participant-selection was already consent to whatever terms followed.
  // That let a Rental Company send Path C terms and award them unilaterally
  // with the Renter never seeing an Accept/counter-offer option. Path C now
  // requires acceptance exactly like Path A/B.
  it("requires Renter acceptance for a Path C quotation too — auction selection is not consent to the terms", async () => {
    const service = buildService();
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
      ...pathBInput,
      clientSnapshot: undefined,
      renterOrganizationId: RENTER_ORG_ID,
      sourceAuctionId: WON_AUCTION_ID,
    });
    await service.sendQuotation("user-1", RC_ORG_ID, quotation.id);
    await expect(service.awardQuotation("user-1", RC_ORG_ID, quotation.id)).rejects.toThrow(
      ConflictError,
    );

    await service.acceptQuotation("user-2", RENTER_ORG_ID, quotation.id);
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

  it("hides a draft quotation from the Renter party — not yet a real offer", async () => {
    const service = buildService();
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
      ...pathBInput,
      clientSnapshot: undefined,
      renterOrganizationId: RENTER_ORG_ID,
    });
    expect(quotation.status).toBe("draft");
    await expect(service.getQuotation("user-2", RENTER_ORG_ID, quotation.id)).rejects.toThrow(
      NotFoundError,
    );
    const list = await service.listQuotationsForRenter("user-2", RENTER_ORG_ID);
    expect(list).toHaveLength(0);
    // The drafting Rental Company itself still sees it fine.
    const asRentalCompany = await service.getQuotation("user-1", RC_ORG_ID, quotation.id);
    expect(asRentalCompany.status).toBe("draft");
  });

  it("reveals a quotation to the Renter once it's actually sent", async () => {
    const service = buildService();
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
      ...pathBInput,
      clientSnapshot: undefined,
      renterOrganizationId: RENTER_ORG_ID,
    });
    await service.sendQuotation("user-1", RC_ORG_ID, quotation.id);
    const asRenter = await service.getQuotation("user-2", RENTER_ORG_ID, quotation.id);
    expect(asRenter.status).toBe("sent");
    const list = await service.listQuotationsForRenter("user-2", RENTER_ORG_ID);
    expect(list).toHaveLength(1);
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
    await service.sendQuotation("user-1", RC_ORG_ID, quotation.id);

    const asRenter = await service.getQuotation("user-2", RENTER_ORG_ID, quotation.id);
    expect(asRenter.machineAssetCode).toBe("EXC-001");
    expect(asRenter.productName).toBe("Caterpillar 320");

    const asRentalCompany = await service.getQuotation("user-1", RC_ORG_ID, quotation.id);
    expect(asRentalCompany.machineAssetCode).toBeNull();
    expect(asRentalCompany.productName).toBeNull();
  });

  it("resolves machine info on the Renter's own quotations list", async () => {
    const service = buildService();
    const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
      ...pathBInput,
      clientSnapshot: undefined,
      renterOrganizationId: RENTER_ORG_ID,
    });
    await service.sendQuotation("user-1", RC_ORG_ID, quotation.id);

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

    await expect(service.listRentalCompanyOrganizations("user-1", RC_ORG_ID)).rejects.toThrow(
      ForbiddenError,
    );
  });

  describe("scope items", () => {
    it("lets the drafting Rental Company add a category-specific scope item", async () => {
      const service = buildService();
      const quotation = await service.createQuotation("user-1", RC_ORG_ID, pathBInput);
      const item = await service.addScopeItem("user-1", RC_ORG_ID, quotation.id, {
        item: "Wire rope",
        responsibleParty: "client",
        notes: "Client to arrange for foundation rig work",
      });
      expect(item.responsibleParty).toBe("client");

      const items = await service.listScopeItems("user-1", RC_ORG_ID, quotation.id);
      expect(items).toHaveLength(1);
      expect(items[0]?.item).toBe("Wire rope");
    });

    it("lets the Renter party read scope items too, once the quotation is sent", async () => {
      const service = buildService();
      const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
        ...pathBInput,
        clientSnapshot: undefined,
        renterOrganizationId: RENTER_ORG_ID,
      });
      await service.addScopeItem("user-1", RC_ORG_ID, quotation.id, {
        item: "Ground preparation",
        responsibleParty: "company",
      });
      await service.sendQuotation("user-1", RC_ORG_ID, quotation.id);
      const items = await service.listScopeItems("user-2", RENTER_ORG_ID, quotation.id);
      expect(items).toHaveLength(1);
    });

    it("rejects adding a scope item once the quotation is no longer editable", async () => {
      const service = buildService();
      const quotation = await service.createQuotation("user-1", RC_ORG_ID, pathBInput);
      await service.sendQuotation("user-1", RC_ORG_ID, quotation.id);
      await service.awardQuotation("user-1", RC_ORG_ID, quotation.id);
      await expect(
        service.addScopeItem("user-1", RC_ORG_ID, quotation.id, {
          item: "Support crane",
          responsibleParty: "company",
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("lets the Rental Company remove a scope item it added", async () => {
      const service = buildService();
      const quotation = await service.createQuotation("user-1", RC_ORG_ID, pathBInput);
      const item = await service.addScopeItem("user-1", RC_ORG_ID, quotation.id, {
        item: "Support crane",
        responsibleParty: "company",
      });
      await service.removeScopeItem("user-1", RC_ORG_ID, quotation.id, item.id);
      expect(await service.listScopeItems("user-1", RC_ORG_ID, quotation.id)).toHaveLength(0);
    });

    it("hides a scope item that belongs to a different quotation behind NotFoundError", async () => {
      const service = buildService();
      const quotationA = await service.createQuotation("user-1", RC_ORG_ID, pathBInput);
      const quotationB = await service.createQuotation("user-1", RC_ORG_ID, pathBInput);
      const item = await service.addScopeItem("user-1", RC_ORG_ID, quotationA.id, {
        item: "Wire rope",
        responsibleParty: "client",
      });
      await expect(
        service.removeScopeItem("user-1", RC_ORG_ID, quotationB.id, item.id),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("alternate dates", () => {
    it("lets the Rental Company propose alternate dates on a sent quotation, and the Renter accept them", async () => {
      const service = buildService();
      const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
        ...pathBInput,
        clientSnapshot: undefined,
        renterOrganizationId: RENTER_ORG_ID,
      });
      await service.sendQuotation("user-1", RC_ORG_ID, quotation.id);

      const proposed = await service.proposeAlternateDates("user-1", RC_ORG_ID, quotation.id, {
        startDate: "2026-04-01",
        endDate: "2026-04-10",
        reason: "Machine tied up on another job until April",
      });
      expect(proposed.alternateDateStatus).toBe("pending");
      expect(proposed.proposedAlternateStartDate).toBe("2026-04-01");
      // The quotation's real dates don't move until the Renter accepts.
      expect(proposed.startDate).toBe(pathBInput.startDate);

      const accepted = await service.respondToAlternateDates(
        "user-2",
        RENTER_ORG_ID,
        quotation.id,
        "accepted",
      );
      expect(accepted.alternateDateStatus).toBe("none");
      expect(accepted.startDate).toBe("2026-04-01");
      expect(accepted.endDate).toBe("2026-04-10");
      expect(accepted.proposedAlternateStartDate).toBeNull();
    });

    it("leaves the quotation's dates untouched when the Renter rejects the proposal", async () => {
      const service = buildService();
      const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
        ...pathBInput,
        clientSnapshot: undefined,
        renterOrganizationId: RENTER_ORG_ID,
      });
      await service.sendQuotation("user-1", RC_ORG_ID, quotation.id);
      await service.proposeAlternateDates("user-1", RC_ORG_ID, quotation.id, {
        startDate: "2026-04-01",
      });

      const rejected = await service.respondToAlternateDates(
        "user-2",
        RENTER_ORG_ID,
        quotation.id,
        "rejected",
      );
      expect(rejected.alternateDateStatus).toBe("none");
      expect(rejected.startDate).toBe(pathBInput.startDate);
      expect(rejected.proposedAlternateStartDate).toBeNull();
    });

    it("rejects a second proposal while one is already pending", async () => {
      const service = buildService();
      const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
        ...pathBInput,
        clientSnapshot: undefined,
        renterOrganizationId: RENTER_ORG_ID,
      });
      await service.sendQuotation("user-1", RC_ORG_ID, quotation.id);
      await service.proposeAlternateDates("user-1", RC_ORG_ID, quotation.id, {
        startDate: "2026-04-01",
      });
      await expect(
        service.proposeAlternateDates("user-1", RC_ORG_ID, quotation.id, {
          startDate: "2026-05-01",
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("rejects responding when nothing is pending", async () => {
      const service = buildService();
      const quotation = await service.createQuotation("user-1", RC_ORG_ID, {
        ...pathBInput,
        clientSnapshot: undefined,
        renterOrganizationId: RENTER_ORG_ID,
      });
      await service.sendQuotation("user-1", RC_ORG_ID, quotation.id);
      await expect(
        service.respondToAlternateDates("user-2", RENTER_ORG_ID, quotation.id, "accepted"),
      ).rejects.toThrow(ConflictError);
    });

    it("rejects proposing on a draft quotation — must be sent first", async () => {
      const service = buildService();
      const quotation = await service.createQuotation("user-1", RC_ORG_ID, pathBInput);
      await expect(
        service.proposeAlternateDates("user-1", RC_ORG_ID, quotation.id, {
          startDate: "2026-04-01",
        }),
      ).rejects.toThrow(ConflictError);
    });
  });
});
