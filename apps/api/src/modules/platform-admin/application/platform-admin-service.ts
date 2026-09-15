import type { Requirement } from "@fleetip/contracts/rfq";
import type { Auction } from "@fleetip/contracts/auction";
import { NotFoundError } from "../../../shared/errors.js";
import type { CatalogueService } from "../../catalogue/application/catalogue-service.js";
import type {
  OrganizationRepositoryPort,
  OrganizationWithTypeRecord,
} from "../../organizations/domain/ports.js";
import type { PublicUserRecord, UserRepositoryPort } from "../../identity/domain/ports.js";
import type { RequirementRepositoryPort } from "../../marketplace/rfq/domain/ports.js";
import { toRequirement } from "../../marketplace/rfq/application/requirement-service.js";
import type { AuctionRepositoryPort, AuctionRecord } from "../../marketplace/auction/domain/ports.js";

// Platform Admin's own view of a tenant organization/user — deliberately
// not the tenant contract types (Organization/User), which never carry
// `status`; Platform Admin is the one caller that needs to see and change it.
export interface PlatformOrganization {
  id: string;
  organizationTypeCode: string;
  name: string;
  code: string;
  status: string;
  createdAt: string;
}

export interface PlatformUser {
  id: string;
  email: string;
  displayName: string;
  status: string;
  createdAt: string;
}

export interface PlatformDashboardCounts {
  organizations: number;
  users: number;
  openRequirements: number;
  liveAuctions: number;
}

function toPlatformOrganization(record: OrganizationWithTypeRecord): PlatformOrganization {
  return {
    id: record.id,
    organizationTypeCode: record.organization_type_code,
    name: record.name,
    code: record.code,
    status: record.status,
    createdAt: new Date(record.created_at).toISOString(),
  };
}

function toPlatformUser(record: PublicUserRecord): PlatformUser {
  return {
    id: record.id,
    email: record.email,
    displayName: record.display_name,
    status: record.status,
    createdAt: new Date(record.created_at).toISOString(),
  };
}

/**
 * Every operation here is reachable only via a `/admin/*` route already
 * gated by getAuthenticatedStaffId — a valid staff session is the entire
 * authorization check (one fixed staff role for now, see the staff
 * module). Scope is deliberately narrow, per this phase's brief: catalogue/
 * reference-data management, list/suspend organizations & users, and
 * read-only cross-tenant visibility into requirements/auctions. Never
 * creates/edits/cancels a tenant's own business records.
 */
export class PlatformAdminService {
  constructor(
    public readonly catalogueService: CatalogueService,
    private readonly organizationRepository: OrganizationRepositoryPort,
    private readonly userRepository: UserRepositoryPort,
    private readonly requirementRepository: RequirementRepositoryPort,
    private readonly auctionRepository: AuctionRepositoryPort,
  ) {}

  async listOrganizations(): Promise<PlatformOrganization[]> {
    const records = await this.organizationRepository.listAllForPlatformAdmin();
    return records.map(toPlatformOrganization);
  }

  async setOrganizationStatus(
    organizationId: string,
    status: "active" | "suspended",
  ): Promise<PlatformOrganization> {
    const existing = await this.organizationRepository.findById(organizationId);
    if (!existing) throw new NotFoundError("Organization not found");
    const record = await this.organizationRepository.updateStatus(organizationId, status);
    const withType = await this.organizationRepository.findWithTypeById(record.id);
    return toPlatformOrganization(withType!);
  }

  async listUsers(): Promise<PlatformUser[]> {
    const records = await this.userRepository.listAllForPlatformAdmin();
    return records.map(toPlatformUser);
  }

  async setUserStatus(userId: string, status: "active" | "suspended"): Promise<PlatformUser> {
    const existing = await this.userRepository.findById(userId);
    if (!existing) throw new NotFoundError("User not found");
    const record = await this.userRepository.updateStatus(userId, status);
    return toPlatformUser(record);
  }

  // Read-only oversight — every open, not-yet-expired Requirement across
  // every Renter. This is the same broadcast set a Rental Company already
  // discovers (RequirementService.discoverRequirements); Platform Admin
  // just gets the same visibility without needing rfq.respond on any
  // particular organization.
  async listOpenRequirements(): Promise<Requirement[]> {
    const records = await this.requirementRepository.listOpenForDiscovery();
    return records.map(toRequirement);
  }

  async listAuctions(): Promise<Auction[]> {
    const records = await this.auctionRepository.listAllForPlatformAdmin();
    return records.map(toAuction);
  }

  async getDashboardCounts(): Promise<PlatformDashboardCounts> {
    const [organizations, users, openRequirements, auctions] = await Promise.all([
      this.organizationRepository.listAllForPlatformAdmin(),
      this.userRepository.listAllForPlatformAdmin(),
      this.requirementRepository.listOpenForDiscovery(),
      this.auctionRepository.listAllForPlatformAdmin(),
    ]);
    return {
      organizations: organizations.length,
      users: users.length,
      openRequirements: openRequirements.length,
      liveAuctions: auctions.filter((a) => a.status === "live" || a.status === "scheduled").length,
    };
  }
}

function toAuction(record: AuctionRecord): Auction {
  return {
    id: record.id,
    requirementId: record.requirement_id,
    createdByOrganizationId: record.created_by_organization_id,
    biddingDirection: record.bidding_direction,
    basePrice: record.base_price,
    maxBidsPerParticipant: record.max_bids_per_participant,
    startsAt: new Date(record.starts_at).toISOString(),
    endsAt: new Date(record.ends_at).toISOString(),
    status: record.status,
    createdAt: new Date(record.created_at).toISOString(),
    updatedAt: new Date(record.updated_at).toISOString(),
  };
}
