import type {
  CreateRequirementRequest,
  Requirement,
  RequirementStatus,
  UpdateRequirementRequest,
} from "@fleetip/contracts/rfq";
import { ConflictError, NotFoundError, ValidationError } from "../../../../shared/errors.js";
import type { ProductSubcategoryRepositoryPort } from "../../../catalogue/domain/ports.js";
import type { ProjectRepositoryPort } from "../../project/domain/ports.js";
import { PermissionService } from "../../../permissions/application/permission-service.js";
import { canTransition } from "../domain/requirement-status.js";
import type { RequirementRecord, RequirementRepositoryPort } from "../domain/ports.js";

// Exported for PlatformAdminService's read-only cross-tenant requirement
// visibility (brief §13) — same mapping, no reason to duplicate it.
export function toRequirement(record: RequirementRecord): Requirement {
  return {
    id: record.id,
    renterOrganizationId: record.renter_organization_id,
    projectId: record.project_id,
    productSubcategoryId: record.product_subcategory_id,
    capacity: record.capacity,
    capacityUnit: record.capacity_unit,
    boomLength: record.boom_length,
    quantity: record.quantity,
    projectName: record.project_name,
    projectLocation: record.project_location,
    requestedStartDate: record.requested_start_date,
    expectedDurationValue: record.expected_duration_value,
    expectedDurationUnit: record.expected_duration_unit,
    shiftPattern: record.shift_pattern,
    crewRequirement: record.crew_requirement,
    shiftRequirement: record.shift_requirement,
    validityDate: record.validity_date,
    status: record.status,
    notes: record.notes,
    createdAt: new Date(record.created_at).toISOString(),
    updatedAt: new Date(record.updated_at).toISOString(),
  };
}

export class RequirementService {
  constructor(
    private readonly requirementRepository: RequirementRepositoryPort,
    private readonly productSubcategoryRepository: ProductSubcategoryRepositoryPort,
    private readonly permissionService: PermissionService,
    private readonly projectRepository: ProjectRepositoryPort,
  ) {}

  async createRequirement(
    userId: string,
    renterOrganizationId: string,
    input: CreateRequirementRequest,
  ): Promise<Requirement> {
    await this.permissionService.requirePermission(userId, renterOrganizationId, "rfq.manage");

    const project = await this.projectRepository.findById(input.projectId);
    if (!project || project.renter_organization_id !== renterOrganizationId) {
      throw new NotFoundError("Project not found in this organization");
    }
    if (project.status !== "active") {
      throw new ValidationError("Cannot post a requirement against a project that is not active");
    }

    const subcategory = await this.productSubcategoryRepository.findById(
      input.productSubcategoryId,
    );
    if (!subcategory) {
      throw new NotFoundError("Product subcategory not found");
    }

    const record = await this.requirementRepository.create({
      renterOrganizationId,
      projectId: input.projectId,
      productSubcategoryId: input.productSubcategoryId,
      capacity: input.capacity,
      capacityUnit: input.capacityUnit,
      boomLength: input.boomLength,
      quantity: input.quantity ?? 1,
      // Snapshotted from the already-resolved Project, never the caller's
      // own free text — projectId is the single source of truth for a
      // requirement's project (see docs/decisions.md). This denormalized
      // copy still matters: it's how a Rental Company sees project context
      // in the cross-tenant Open Market view, which has no access to the
      // Renter's own Project records (tenant isolation).
      projectName: project.project_name,
      projectLocation: project.site_location,
      requestedStartDate: input.requestedStartDate,
      expectedDurationValue: input.expectedDurationValue,
      expectedDurationUnit: input.expectedDurationUnit,
      shiftPattern: input.shiftPattern,
      crewRequirement: input.crewRequirement,
      shiftRequirement: input.shiftRequirement,
      validityDate: input.validityDate,
      notes: input.notes,
    });
    return toRequirement(record);
  }

  async getRequirement(
    userId: string,
    renterOrganizationId: string,
    requirementId: string,
  ): Promise<Requirement> {
    await this.permissionService.requirePermission(userId, renterOrganizationId, "rfq.manage");
    const record = await this.requirementRepository.findById(requirementId);
    if (!record || record.renter_organization_id !== renterOrganizationId) {
      throw new NotFoundError("Requirement not found in this organization");
    }
    return toRequirement(record);
  }

  async listRequirements(userId: string, renterOrganizationId: string): Promise<Requirement[]> {
    await this.permissionService.requirePermission(userId, renterOrganizationId, "rfq.manage");
    const records = await this.requirementRepository.listByRenter(renterOrganizationId);
    return records.map(toRequirement);
  }

  // Restricted to status === "open" — once a Rental Company has responded,
  // an auction has been created, or the Requirement is otherwise closed,
  // changing its commercial meaning (capacity, quantity, dates, ...) out
  // from under those in-flight actions is unsafe. Mirrors
  // RentalService.updateRentalTerms's "only while confirmed" gate.
  async updateRequirement(
    userId: string,
    renterOrganizationId: string,
    requirementId: string,
    updates: UpdateRequirementRequest,
  ): Promise<Requirement> {
    await this.permissionService.requirePermission(userId, renterOrganizationId, "rfq.manage");
    const existing = await this.requirementRepository.findById(requirementId);
    if (!existing || existing.renter_organization_id !== renterOrganizationId) {
      throw new NotFoundError("Requirement not found in this organization");
    }
    if (existing.status !== "open") {
      throw new ConflictError("Requirement fields can only be edited while it is open");
    }
    // Cross-field ordering can't be a schema-level refine here — a partial
    // update may carry only one of the two dates — so it's checked against
    // the merged final values instead.
    const finalStartDate = updates.requestedStartDate ?? existing.requested_start_date;
    const finalValidityDate = updates.validityDate ?? existing.validity_date;
    if (finalValidityDate > finalStartDate) {
      throw new ValidationError("Validity date cannot be after the requested start date");
    }
    const record = await this.requirementRepository.updateFields(requirementId, updates);
    return toRequirement(record);
  }

  async updateRequirementStatus(
    userId: string,
    renterOrganizationId: string,
    requirementId: string,
    newStatus: RequirementStatus,
  ): Promise<Requirement> {
    await this.permissionService.requirePermission(userId, renterOrganizationId, "rfq.manage");
    const existing = await this.requirementRepository.findById(requirementId);
    if (!existing || existing.renter_organization_id !== renterOrganizationId) {
      throw new NotFoundError("Requirement not found in this organization");
    }
    if (!canTransition(existing.status, newStatus)) {
      throw new ConflictError(
        `Cannot transition requirement from ${existing.status} to ${newStatus}`,
      );
    }
    const record = await this.requirementRepository.updateStatus(requirementId, newStatus);
    return toRequirement(record);
  }

  // Discovery: any Rental Company may browse every open, not-yet-expired
  // Requirement — this is a broadcast, not tenant-private data. See
  // docs/marketplace-core-loop-design.md §4.
  async discoverRequirements(
    userId: string,
    rentalCompanyOrganizationId: string,
  ): Promise<Requirement[]> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "rfq.respond",
    );
    const records = await this.requirementRepository.listOpenForDiscovery();
    return records.map(toRequirement);
  }

  async getRequirementForDiscovery(
    userId: string,
    rentalCompanyOrganizationId: string,
    requirementId: string,
  ): Promise<Requirement> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "rfq.respond",
    );
    const record = await this.requirementRepository.findById(requirementId);
    if (!record) {
      throw new NotFoundError("Requirement not found");
    }
    return toRequirement(record);
  }
}
