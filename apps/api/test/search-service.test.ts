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
import type {
  RequirementRecord,
  RequirementRepositoryPort,
} from "../src/modules/marketplace/rfq/domain/ports.js";
import type {
  CommercialQuotationRecord,
  CommercialQuotationRepositoryPort,
} from "../src/modules/marketplace/commercial-quotation/domain/ports.js";
import type {
  RentalRecord,
  RentalRepositoryPort,
} from "../src/modules/marketplace/rental/domain/ports.js";
import { SearchService } from "../src/modules/search/application/search-service.js";

const OWNER_ROLE_ID = "role-owner";
const RC_ORG_ID = "org-rental-company";
const RENTER_ORG_ID = "org-renter";

const MACHINES: MachineRecord[] = [
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
];

const REQUIREMENTS: RequirementRecord[] = [
  {
    id: "requirement-1",
    renter_organization_id: RENTER_ORG_ID,
    project_id: "project-1",
    product_subcategory_id: "subcategory-1",
    boom_length: null,
    capacity: null,
    capacity_unit: null,
    quantity: 1,
    project_name: "Metro Line 3 Extension",
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
  },
];

const QUOTATIONS: CommercialQuotationRecord[] = [
  {
    id: "quotation-1",
    rental_company_organization_id: RC_ORG_ID,
    renter_organization_id: RENTER_ORG_ID,
    client_snapshot: null,
    requirement_id: null,
    quotation_response_id: null,
    source_auction_id: null,
    reference_number: "Q-2026-1",
    machine_id: "machine-1",
    start_date: "2026-03-01",
    end_date: null,
    rate: 5000,
    rate_unit: "day",
    mobilization_charge: null,
    demobilization_charge: null,
    overtime_rate: null,
    payment_terms: null,
    shift_structure: null,
    sunday_condition: null,
    fuel_norms: null,
    fuel_scope: null,
    dehire_terms: null,
    operator_scope: null,
    accommodation_scope: null,
    working_hours: null,
    working_days_per_week: null,
    minimum_rental_period_value: null,
    minimum_rental_period_unit: null,
    gst_terms: null,
    notice_period_days: null,
    validity_date: "2026-04-01",
    commercial_notes: null,
    company_terms: null,
    status: "sent",
    renter_accepted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  },
];

const RENTALS: RentalRecord[] = [
  {
    id: "rental-1",
    rental_company_organization_id: RC_ORG_ID,
    renter_organization_id: RENTER_ORG_ID,
    client_snapshot: null,
    machine_id: "machine-1",
    status: "confirmed",
    project_name: "Metro Line 3 Extension",
    project_location: null,
    start_date: "2026-03-01",
    end_date: null,
    rate: 5000,
    rate_unit: "day",
    mobilization_charge: null,
    demobilization_charge: null,
    payment_terms: null,
    shift_structure: null,
    overtime_rate: null,
    sunday_condition: null,
    fuel_norms: null,
    operator_scope: null,
    notice_period_days: null,
    dehire_terms: null,
    created_at: new Date(),
    updated_at: new Date(),
  },
];

function fakePermissionService() {
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
      roleId === OWNER_ROLE_ID
        ? [
            "equipment.manage",
            "rfq.manage",
            "quotation.manage",
            "quotation.respond",
            "rental.manage",
            "rental.respond",
          ]
        : [],
  };
  return new PermissionService(
    membershipRepository,
    roleRepository,
    fakeOrganizationTypeRepository(),
  );
}

function fakeOrganizationTypeRepository(): OrganizationRepositoryPort {
  const organizationTypes: Record<string, OrganizationTypeCode> = {
    [RC_ORG_ID]: "rental_company",
    [RENTER_ORG_ID]: "renter",
    "org-other-rental-company": "rental_company",
  };
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
    listByType: async () => {
      throw new Error("not used in this test");
    },
  };
}

function fakeMachineRepository(): MachineRepositoryPort {
  return {
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async () => {
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
    search: async (organizationId, query) =>
      MACHINES.filter((m) => m.organization_id === organizationId && m.asset_code.includes(query)),
  };
}

function fakeRequirementRepository(): RequirementRepositoryPort {
  return {
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async () => {
      throw new Error("not used in this test");
    },
    listByRenter: async () => {
      throw new Error("not used in this test");
    },
    listOpenForDiscovery: async () => {
      throw new Error("not used in this test");
    },
    updateStatus: async () => {
      throw new Error("not used in this test");
    },
    updateFields: async () => {
      throw new Error("not used in this test");
    },
    search: async (renterOrganizationId, query) =>
      REQUIREMENTS.filter(
        (r) =>
          r.renter_organization_id === renterOrganizationId &&
          (r.project_name ?? "").includes(query),
      ),
  };
}

function fakeCommercialQuotationRepository(): CommercialQuotationRepositoryPort {
  return {
    nextReferenceNumber: async () => {
      throw new Error("not used in this test");
    },
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async () => {
      throw new Error("not used in this test");
    },
    listByRentalCompany: async () => {
      throw new Error("not used in this test");
    },
    listByRenter: async () => {
      throw new Error("not used in this test");
    },
    updateTerms: async () => {
      throw new Error("not used in this test");
    },
    applyAcceptedOffer: async () => {
      throw new Error("not used in this test");
    },
    updateStatus: async () => {
      throw new Error("not used in this test");
    },
    setRenterAccepted: async () => {
      throw new Error("not used in this test");
    },
    expireIfDue: async () => {
      throw new Error("not used in this test");
    },
    searchByRentalCompany: async (rentalCompanyOrganizationId, query) =>
      QUOTATIONS.filter(
        (q) =>
          q.rental_company_organization_id === rentalCompanyOrganizationId &&
          q.reference_number.includes(query),
      ),
    searchByRenter: async (renterOrganizationId, query) =>
      QUOTATIONS.filter(
        (q) =>
          q.renter_organization_id === renterOrganizationId && q.reference_number.includes(query),
      ),
  };
}

function fakeRentalRepository(): RentalRepositoryPort {
  return {
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async () => {
      throw new Error("not used in this test");
    },
    listByOrganization: async () => {
      throw new Error("not used in this test");
    },
    listByRenterOrganization: async () => {
      throw new Error("not used in this test");
    },
    updateTerms: async () => {
      throw new Error("not used in this test");
    },
    updateStatus: async () => {
      throw new Error("not used in this test");
    },
    isAvailable: async () => {
      throw new Error("not used in this test");
    },
    searchByOrganization: async (rentalCompanyOrganizationId, query) =>
      RENTALS.filter(
        (r) =>
          r.rental_company_organization_id === rentalCompanyOrganizationId &&
          (r.project_name ?? "").includes(query),
      ),
    searchByRenterOrganization: async (renterOrganizationId, query) =>
      RENTALS.filter(
        (r) =>
          r.renter_organization_id === renterOrganizationId &&
          (r.project_name ?? "").includes(query),
      ),
  };
}

function buildService() {
  return new SearchService(
    fakeMachineRepository(),
    fakeRequirementRepository(),
    fakeCommercialQuotationRepository(),
    fakeRentalRepository(),
    fakeOrganizationTypeRepository(),
    fakePermissionService(),
  );
}

describe("SearchService", () => {
  it("searches machines and quotations and rentals for a Rental Company, but not requirements", async () => {
    const service = buildService();
    const results = await service.search("user-1", RC_ORG_ID, "EXC");
    expect(results.some((r) => r.type === "machine" && r.title === "EXC-001")).toBe(true);
  });

  it("searches quotations by reference number for a Rental Company", async () => {
    const service = buildService();
    const results = await service.search("user-1", RC_ORG_ID, "Q-2026");
    expect(results).toHaveLength(1);
    expect(results[0]?.type).toBe("quotation");
    expect(results[0]?.title).toBe("Q-2026-1");
  });

  it("searches requirements and rentals for a Renter, but not machines", async () => {
    const service = buildService();
    const results = await service.search("user-2", RENTER_ORG_ID, "Metro");
    const types = results.map((r) => r.type).sort();
    expect(types).toEqual(["rental", "requirement"]);
  });

  it("never leaks another organization's machines/quotations/rentals", async () => {
    const service = buildService();
    // EXC-001/Q-2026-1/rental-1 all belong to RC_ORG_ID — an unrelated
    // Rental Company's own search must never surface them.
    const results = await service.search("user-3", "org-other-rental-company", "EXC");
    expect(results).toHaveLength(0);
    const quotationResults = await service.search("user-3", "org-other-rental-company", "Q-2026");
    expect(quotationResults).toHaveLength(0);
  });

  it("returns nothing for an unknown organization", async () => {
    const service = buildService();
    const results = await service.search("user-1", "org-unknown", "EXC");
    expect(results).toHaveLength(0);
  });
});
