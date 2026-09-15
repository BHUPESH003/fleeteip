import type { ProjectStatus } from "@fleetip/contracts/project";

export interface ProjectRecord {
  id: string;
  renter_organization_id: string;
  project_code: string;
  project_type: string;
  project_name: string;
  site_location: string;
  state: string | null;
  district: string | null;
  start_date: string;
  end_date: string | null;
  status: ProjectStatus;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateProjectInput {
  renterOrganizationId: string;
  projectCode: string;
  projectType: string;
  projectName: string;
  siteLocation: string;
  state?: string;
  district?: string;
  startDate: string;
  endDate?: string;
}

// Deliberately excludes projectCode/status — see updateProjectRequestSchema
// in packages/contracts/src/project/index.ts.
export interface UpdateProjectFieldsInput {
  projectType?: string;
  projectName?: string;
  siteLocation?: string;
  state?: string;
  district?: string;
  startDate?: string;
  endDate?: string;
}

export interface ProjectRepositoryPort {
  create(input: CreateProjectInput): Promise<ProjectRecord>;
  findById(id: string): Promise<ProjectRecord | undefined>;
  listByRenter(renterOrganizationId: string): Promise<ProjectRecord[]>;
  updateStatus(id: string, status: ProjectStatus): Promise<ProjectRecord>;
  updateFields(id: string, updates: UpdateProjectFieldsInput): Promise<ProjectRecord>;
  // Race-free per-Renter counter — same pattern as
  // CommercialQuotationRepositoryPort.nextReferenceNumber.
  nextReferenceNumber(renterOrganizationId: string): Promise<string>;
  search(renterOrganizationId: string, query: string): Promise<ProjectRecord[]>;
}
