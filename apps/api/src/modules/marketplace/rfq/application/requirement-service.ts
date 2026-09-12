import type {
  CreateRequirementRequest,
  Requirement,
  RequirementStatus,
  UpdateRequirementRequest,
} from "@fleetip/contracts/rfq";
import { ConflictError, NotFoundError } from "../../../../shared/errors.js";
import type { ProductSubcategoryRepositoryPort } from "../../../catalogue/domain/ports.js";
import { PermissionService } from "../../../permissions/application/permission-service.js";
import { canTransition } from "../domain/requirement-status.js";
import type { RequirementRecord, RequirementRepositoryPort } from "../domain/ports.js";

function toRequirement(record: RequirementRecord): Requirement {
  return {
    id: record.id,
    renterOrganizationId: record.renter_organization_id,
    productSubcategoryId: record.product_subcategory_id,
    capacity: record.capacity,
    capacityUnit: record.capacity_unit,
    quantity: record.quantity,
    projectName: record.project_name,
    projectLocation: record.project_location,
    requestedStartDate: record.requested_start_date,
    expectedDurationValue: record.expected_duration_value,
    expectedDurationUnit: record.expected_duration_unit,
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
  ) {}

  async createRequirement(
    userId: string,
    renterOrganizationId: string,
    input: CreateRequirementRequest,
  ): Promise<Requirement> {
    await this.permissionService.requirePermission(userId, renterOrganizationId, "rfq.manage");

    const subcategory = await this.productSubcategoryRepository.findById(
      input.productSubcategoryId,
    );
    if (!subcategory) {
      throw new NotFoundError("Product subcategory not found");
    }

    const record = await this.requirementRepository.create({
      renterOrganizationId,
      productSubcategoryId: input.productSubcategoryId,
      capacity: input.capacity,
      capacityUnit: input.capacityUnit,
      quantity: input.quantity ?? 1,
      projectName: input.projectName,
      projectLocation: input.projectLocation,
      requestedStartDate: input.requestedStartDate,
      expectedDurationValue: input.expectedDurationValue,
      expectedDurationUnit: input.expectedDurationUnit,
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
