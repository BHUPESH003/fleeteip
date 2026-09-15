import type {
  QuotationResponse,
  SubmitQuotationResponseRequest,
} from "@fleetip/contracts/quotation";
import { ConflictError, NotFoundError } from "../../../../shared/errors.js";
import type { RequirementRepositoryPort } from "../../rfq/domain/ports.js";
import { NotificationService } from "../../../notification/application/notification-service.js";
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
    private readonly notificationService: NotificationService,
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

    // Submitting is upsert-shaped (a Rental Company may revise its reply) —
    // only notify on the first response, not every revision, to avoid
    // spamming the Renter on the same event.
    const isFirstResponse = !(await this.quotationResponseRepository.findByRequirementAndOrganization(
      requirementId,
      rentalCompanyOrganizationId,
    ));

    const record = await this.quotationResponseRepository.submit({
      requirementId,
      rentalCompanyOrganizationId,
      status: input.status,
      indicativeRate: input.indicativeRate,
      // Locked to the requirement's own expectedDurationUnit when it has
      // one, never trusting the caller for it — otherwise responses to the
      // same requirement can land in different units (e.g. 6000/day vs.
      // 150000/month), making the Renter's "lowest"/"spread" comparison
      // meaningless. Falls back to the caller's own choice only when the
      // requirement didn't specify a unit to lock to.
      indicativeRateUnit: requirement.expected_duration_unit ?? input.indicativeRateUnit,
      notes: input.notes,
    });
    if (isFirstResponse) {
      try {
        await this.notificationService.notify({
          recipientOrganizationId: requirement.renter_organization_id,
          type: "requirement.response_received",
          title: "New response to your requirement",
          message: "A Rental Company responded to your requirement.",
          relatedResourceType: "requirement",
          relatedResourceId: requirementId,
        });
      } catch {
        // Notification failures must never block the real business action.
      }
    }
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
