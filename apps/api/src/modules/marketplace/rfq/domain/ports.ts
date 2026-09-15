import type { RateUnit } from "@fleetip/contracts/rental";
import type { CrewRequirement, RequirementStatus, ShiftPattern } from "@fleetip/contracts/rfq";

export interface RequirementRecord {
  id: string;
  renter_organization_id: string;
  project_id: string;
  product_subcategory_id: string;
  capacity: number | null;
  capacity_unit: string | null;
  boom_length: number | null;
  quantity: number;
  project_name: string | null;
  project_location: string | null;
  requested_start_date: string;
  expected_duration_value: number | null;
  expected_duration_unit: RateUnit | null;
  shift_pattern: ShiftPattern | null;
  crew_requirement: CrewRequirement | null;
  shift_requirement: string | null;
  validity_date: string;
  status: RequirementStatus;
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateRequirementInput {
  renterOrganizationId: string;
  projectId: string;
  productSubcategoryId: string;
  capacity?: number;
  capacityUnit?: string;
  boomLength?: number;
  quantity: number;
  projectName?: string;
  projectLocation?: string;
  requestedStartDate: string;
  expectedDurationValue?: number;
  expectedDurationUnit?: RateUnit;
  shiftPattern?: ShiftPattern;
  crewRequirement?: CrewRequirement;
  shiftRequirement?: string;
  validityDate: string;
  notes?: string;
}

// Deliberately excludes productSubcategoryId/projectId/status — see
// updateRequirementRequestSchema in packages/contracts/src/rfq/index.ts.
export interface UpdateRequirementFieldsInput {
  capacity?: number;
  capacityUnit?: string;
  boomLength?: number;
  quantity?: number;
  projectName?: string;
  projectLocation?: string;
  requestedStartDate?: string;
  expectedDurationValue?: number;
  expectedDurationUnit?: RateUnit;
  shiftPattern?: ShiftPattern;
  crewRequirement?: CrewRequirement;
  shiftRequirement?: string;
  validityDate?: string;
  notes?: string;
}

export interface RequirementRepositoryPort {
  create(input: CreateRequirementInput): Promise<RequirementRecord>;
  findById(id: string): Promise<RequirementRecord | undefined>;
  listByRenter(renterOrganizationId: string): Promise<RequirementRecord[]>;
  // Discovery set for Rental Companies — open and not yet past validityDate.
  // See docs/marketplace-core-loop-design.md §4.
  listOpenForDiscovery(): Promise<RequirementRecord[]>;
  updateStatus(id: string, status: RequirementStatus): Promise<RequirementRecord>;
  updateFields(id: string, updates: UpdateRequirementFieldsInput): Promise<RequirementRecord>;
  // Global search — project name match, this Renter's own requirements only.
  search(renterOrganizationId: string, query: string): Promise<RequirementRecord[]>;
}
