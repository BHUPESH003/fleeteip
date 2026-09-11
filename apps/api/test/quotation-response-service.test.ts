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
  RequirementRecord,
  RequirementRepositoryPort,
} from "../src/modules/marketplace/rfq/domain/ports.js";
import type {
  QuotationResponseRecord,
  QuotationResponseRepositoryPort,
  SubmitQuotationResponseInput,
} from "../src/modules/marketplace/quotation-response/domain/ports.js";
import { QuotationResponseService } from "../src/modules/marketplace/quotation-response/application/quotation-response-service.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../src/shared/errors.js";

const OWNER_ROLE_ID = "role-owner";
const RENTER_ORG_ID = "org-renter";
const OTHER_RENTER_ORG_ID = "org-other-renter";
const RC_ORG_ID = "org-rental-company";
const OPEN_REQUIREMENT_ID = "requirement-open";
const CLOSED_REQUIREMENT_ID = "requirement-closed";

function fakePermissionService(organizationTypeCode: OrganizationTypeCode = "rental_company") {
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
      roleId === OWNER_ROLE_ID ? ["rfq.manage", "rfq.respond"] : [],
  };
  return new PermissionService(
    membershipRepository,
    roleRepository,
    fakeOrganizationTypeRepository({
      [RC_ORG_ID]: organizationTypeCode,
      [RENTER_ORG_ID]: "renter",
      [OTHER_RENTER_ORG_ID]: "renter",
    }),
  );
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

function fakeRequirementRepository(requirements: RequirementRecord[] = [requirement()]) {
  const port: RequirementRepositoryPort = {
    create: async () => {
      throw new Error("not used in this test");
    },
    findById: async (id) => requirements.find((r) => r.id === id),
    listByRenter: async () => {
      throw new Error("not used in this test");
    },
    listOpenForDiscovery: async () => {
      throw new Error("not used in this test");
    },
    updateStatus: async () => {
      throw new Error("not used in this test");
    },
  };
  return port;
}

function fakeQuotationResponseRepository(): QuotationResponseRepositoryPort {
  const responses = new Map<string, QuotationResponseRecord>();
  let nextId = 1;

  return {
    submit: async (input: SubmitQuotationResponseInput) => {
      const key = `${input.requirementId}:${input.rentalCompanyOrganizationId}`;
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
      responses.set(key, record);
      return record;
    },
    findByRequirementAndOrganization: async (requirementId, rentalCompanyOrganizationId) =>
      responses.get(`${requirementId}:${rentalCompanyOrganizationId}`),
    findById: async (id) => [...responses.values()].find((r) => r.id === id),
    listByRequirement: async (requirementId) =>
      [...responses.values()].filter((r) => r.requirement_id === requirementId),
  };
}

function buildService(requirements?: RequirementRecord[]) {
  return new QuotationResponseService(
    fakeQuotationResponseRepository(),
    fakeRequirementRepository(requirements),
    fakePermissionService(),
  );
}

describe("QuotationResponseService", () => {
  it("rejects responding to an unknown requirement", async () => {
    const service = buildService();
    await expect(
      service.submitResponse("user-1", RC_ORG_ID, "unknown-requirement", {
        status: "interested",
        indicativeRate: 1000,
        indicativeRateUnit: "day",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects responding to a requirement that is not open", async () => {
    const service = buildService([requirement({ id: CLOSED_REQUIREMENT_ID, status: "closed" })]);
    await expect(
      service.submitResponse("user-1", RC_ORG_ID, CLOSED_REQUIREMENT_ID, {
        status: "interested",
        indicativeRate: 1000,
        indicativeRateUnit: "day",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects response submission for a Renter organization", async () => {
    const service = new QuotationResponseService(
      fakeQuotationResponseRepository(),
      fakeRequirementRepository(),
      fakePermissionService("renter"),
    );
    await expect(
      service.submitResponse("user-1", RC_ORG_ID, OPEN_REQUIREMENT_ID, {
        status: "interested",
        indicativeRate: 1000,
        indicativeRateUnit: "day",
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("submits an interested response with an indicative rate", async () => {
    const service = buildService();
    const response = await service.submitResponse("user-1", RC_ORG_ID, OPEN_REQUIREMENT_ID, {
      status: "interested",
      indicativeRate: 1200,
      indicativeRateUnit: "day",
    });
    expect(response.status).toBe("interested");
    expect(response.indicativeRate).toBe(1200);
  });

  it("upserts on resubmission instead of creating a duplicate", async () => {
    const responseRepository = fakeQuotationResponseRepository();
    const service = new QuotationResponseService(
      responseRepository,
      fakeRequirementRepository(),
      fakePermissionService(),
    );
    const first = await service.submitResponse("user-1", RC_ORG_ID, OPEN_REQUIREMENT_ID, {
      status: "interested",
      indicativeRate: 1200,
      indicativeRateUnit: "day",
    });
    const second = await service.submitResponse("user-1", RC_ORG_ID, OPEN_REQUIREMENT_ID, {
      status: "not_interested",
    });
    expect(second.id).toBe(first.id);
    expect(second.status).toBe("not_interested");

    const all = await responseRepository.listByRequirement(OPEN_REQUIREMENT_ID);
    expect(all).toHaveLength(1);
  });

  it("returns NotFoundError when no response has been submitted yet", async () => {
    const service = buildService();
    await expect(service.getMyResponse("user-1", RC_ORG_ID, OPEN_REQUIREMENT_ID)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("lets a Renter list every response to its own requirement", async () => {
    const responseRepository = fakeQuotationResponseRepository();
    const requirementRepository = fakeRequirementRepository();
    const rcService = new QuotationResponseService(
      responseRepository,
      requirementRepository,
      fakePermissionService(),
    );
    await rcService.submitResponse("user-1", RC_ORG_ID, OPEN_REQUIREMENT_ID, {
      status: "interested",
      indicativeRate: 1200,
      indicativeRateUnit: "day",
    });

    const renterService = new QuotationResponseService(
      responseRepository,
      requirementRepository,
      fakePermissionService("renter"),
    );
    const responses = await renterService.listResponsesForRequirement(
      "user-2",
      RENTER_ORG_ID,
      OPEN_REQUIREMENT_ID,
    );
    expect(responses).toHaveLength(1);
  });

  it("hides another Renter's requirement responses behind NotFoundError", async () => {
    const service = new QuotationResponseService(
      fakeQuotationResponseRepository(),
      fakeRequirementRepository(),
      fakePermissionService("renter"),
    );
    await expect(
      service.listResponsesForRequirement("user-1", OTHER_RENTER_ORG_ID, OPEN_REQUIREMENT_ID),
    ).rejects.toThrow(NotFoundError);
  });
});
