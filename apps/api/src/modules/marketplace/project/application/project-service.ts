import type {
  CreateProjectRequest,
  Project,
  ProjectStatus,
  UpdateProjectRequest,
} from "@fleetip/contracts/project";
import { ConflictError, NotFoundError, ValidationError } from "../../../../shared/errors.js";
import { PermissionService } from "../../../permissions/application/permission-service.js";
import { canTransition } from "../domain/project-status.js";
import type { ProjectRecord, ProjectRepositoryPort } from "../domain/ports.js";

function toProject(record: ProjectRecord): Project {
  return {
    id: record.id,
    renterOrganizationId: record.renter_organization_id,
    projectCode: record.project_code,
    projectType: record.project_type,
    projectName: record.project_name,
    siteLocation: record.site_location,
    state: record.state,
    district: record.district,
    startDate: record.start_date,
    endDate: record.end_date,
    status: record.status,
    createdAt: new Date(record.created_at).toISOString(),
    updatedAt: new Date(record.updated_at).toISOString(),
  };
}

export class ProjectService {
  constructor(
    private readonly projectRepository: ProjectRepositoryPort,
    private readonly permissionService: PermissionService,
  ) {}

  async createProject(
    userId: string,
    renterOrganizationId: string,
    input: CreateProjectRequest,
  ): Promise<Project> {
    await this.permissionService.requirePermission(
      userId,
      renterOrganizationId,
      "project.manage",
    );
    const projectCode = await this.projectRepository.nextReferenceNumber(renterOrganizationId);
    const record = await this.projectRepository.create({
      renterOrganizationId,
      projectCode,
      projectType: input.projectType,
      projectName: input.projectName,
      siteLocation: input.siteLocation,
      state: input.state,
      district: input.district,
      startDate: input.startDate,
      endDate: input.endDate,
    });
    return toProject(record);
  }

  async getProject(
    userId: string,
    renterOrganizationId: string,
    projectId: string,
  ): Promise<Project> {
    await this.permissionService.requirePermission(
      userId,
      renterOrganizationId,
      "project.manage",
    );
    const record = await this.loadOwned(renterOrganizationId, projectId);
    return toProject(record);
  }

  async listProjects(userId: string, renterOrganizationId: string): Promise<Project[]> {
    await this.permissionService.requirePermission(
      userId,
      renterOrganizationId,
      "project.manage",
    );
    const records = await this.projectRepository.listByRenter(renterOrganizationId);
    return records.map(toProject);
  }

  // Restricted to status === "active" — same reasoning as
  // RequirementService.updateRequirement: once things are hanging off a
  // Project (Requirements, Rentals, ...), quietly changing its dates/site
  // out from under them is unsafe.
  async updateProject(
    userId: string,
    renterOrganizationId: string,
    projectId: string,
    updates: UpdateProjectRequest,
  ): Promise<Project> {
    await this.permissionService.requirePermission(
      userId,
      renterOrganizationId,
      "project.manage",
    );
    const existing = await this.loadOwned(renterOrganizationId, projectId);
    if (existing.status !== "active") {
      throw new ConflictError("Project fields can only be edited while it is active");
    }
    // Cross-field ordering can't be a schema-level refine here — a partial
    // update may carry only one of the two dates — so it's checked against
    // the merged final values instead.
    const finalStartDate = updates.startDate ?? existing.start_date;
    const finalEndDate = updates.endDate ?? existing.end_date;
    if (finalEndDate && finalEndDate < finalStartDate) {
      throw new ValidationError("End date cannot be before the start date");
    }
    const record = await this.projectRepository.updateFields(projectId, updates);
    return toProject(record);
  }

  async updateProjectStatus(
    userId: string,
    renterOrganizationId: string,
    projectId: string,
    newStatus: ProjectStatus,
  ): Promise<Project> {
    await this.permissionService.requirePermission(
      userId,
      renterOrganizationId,
      "project.manage",
    );
    const existing = await this.loadOwned(renterOrganizationId, projectId);
    if (!canTransition(existing.status, newStatus)) {
      throw new ConflictError(`Cannot transition project from ${existing.status} to ${newStatus}`);
    }
    const record = await this.projectRepository.updateStatus(projectId, newStatus);
    return toProject(record);
  }

  private async loadOwned(
    renterOrganizationId: string,
    projectId: string,
  ): Promise<ProjectRecord> {
    const record = await this.projectRepository.findById(projectId);
    if (!record || record.renter_organization_id !== renterOrganizationId) {
      throw new NotFoundError("Project not found in this organization");
    }
    return record;
  }
}
