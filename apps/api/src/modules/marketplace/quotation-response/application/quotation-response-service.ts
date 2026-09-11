import type {
  QuotationResponse,
  SubmitQuotationResponseRequest,
} from "@fleetip/contracts/quotation";
import { ConflictError, NotFoundError } from "../../../../shared/errors.js";
import type { RequirementRepositoryPort } from "../../rfq/domain/ports.js";
import { PermissionService } from "../../../permissions/application/permission-service.js";
import type { QuotationResponseRecord, QuotationResponseRepositoryPort } from "../domain/ports.js";

function toQuotationResponse(record: QuotationResponseRecord): QuotationResponse {
  return {
    id: record.id,
    requirementId: record.requirement_id,
    rentalCompanyOrganizationId: record.rental_company_organization_id,
    status: record.status,
    indicativeRate: record.indicative_rate,
    indicativeRateUnit: record.indicative_rate_unit,
    notes: record.notes,
    createdAt: new Date(record.created_at).toISOString(),
    updatedAt: new Date(record.updated_at).toISOString(),
  };
}

export class QuotationResponseService {
  constructor(
    private readonly quotationResponseRepository: QuotationResponseRepositoryPort,
    private readonly requirementRepository: RequirementRepositoryPort,
    private readonly permissionService: PermissionService,
  ) {}

  async submitResponse(
    userId: string,
    rentalCompanyOrganizationId: string,
    requirementId: string,
    input: SubmitQuotationResponseRequest,
  ): Promise<QuotationResponse> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "rfq.respond",
    );

    const requirement = await this.requirementRepository.findById(requirementId);
    if (!requirement) {
      throw new NotFoundError("Requirement not found");
    }
    if (requirement.status !== "open") {
      throw new ConflictError("Cannot respond to a requirement that is not open");
    }

    const record = await this.quotationResponseRepository.submit({
      requirementId,
      rentalCompanyOrganizationId,
      status: input.status,
      indicativeRate: input.indicativeRate,
      indicativeRateUnit: input.indicativeRateUnit,
      notes: input.notes,
    });
    return toQuotationResponse(record);
  }

  async getMyResponse(
    userId: string,
    rentalCompanyOrganizationId: string,
    requirementId: string,
  ): Promise<QuotationResponse> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "rfq.respond",
    );
    const record = await this.quotationResponseRepository.findByRequirementAndOrganization(
      requirementId,
      rentalCompanyOrganizationId,
    );
    if (!record) {
      throw new NotFoundError("No response submitted for this requirement yet");
    }
    return toQuotationResponse(record);
  }

  // The Renter's comparison list — every Rental Company's reply to their
  // own Requirement.
  async listResponsesForRequirement(
    userId: string,
    renterOrganizationId: string,
    requirementId: string,
  ): Promise<QuotationResponse[]> {
    await this.permissionService.requirePermission(userId, renterOrganizationId, "rfq.manage");
    const requirement = await this.requirementRepository.findById(requirementId);
    if (!requirement || requirement.renter_organization_id !== renterOrganizationId) {
      throw new NotFoundError("Requirement not found in this organization");
    }
    const records = await this.quotationResponseRepository.listByRequirement(requirementId);
    return records.map(toQuotationResponse);
  }
}
