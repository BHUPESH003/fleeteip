import type { ClientSnapshot, OperatorScope, RateUnit } from "@fleetip/contracts/rental";
import type { ResponsibleParty } from "@fleetip/contracts/quotation";
import type { WorkOrderStatus } from "@fleetip/contracts/work-order";

export interface WorkOrderRecord {
  id: string;
  reference_number: string;
  quotation_id: string;
  rental_id: string;
  rental_company_organization_id: string;
  renter_organization_id: string | null;
  client_snapshot: ClientSnapshot | null;
  project_id: string | null;
  machine_id: string;
  start_date: string;
  end_date: string | null;
  rate: number;
  rate_unit: RateUnit;
  mobilization_charge: number | null;
  demobilization_charge: number | null;
  overtime_rate: number | null;
  payment_terms: string | null;
  shift_structure: string | null;
  sunday_condition: string | null;
  fuel_norms: string | null;
  fuel_scope: ResponsibleParty | null;
  dehire_terms: string | null;
  operator_scope: OperatorScope | null;
  accommodation_scope: ResponsibleParty | null;
  working_hours: number | null;
  working_days_per_week: number | null;
  minimum_rental_period_value: number | null;
  minimum_rental_period_unit: RateUnit | null;
  gst_terms: string | null;
  notice_period_days: number | null;
  commercial_notes: string | null;
  company_terms: string | null;
  status: WorkOrderStatus;
  created_at: Date | string;
  updated_at: Date | string;
}

// Every field is a snapshot taken at award time — see CommercialQuotationService.
export interface CreateWorkOrderInput {
  referenceNumber: string;
  quotationId: string;
  rentalId: string;
  rentalCompanyOrganizationId: string;
  renterOrganizationId?: string;
  clientSnapshot?: ClientSnapshot;
  projectId?: string;
  machineId: string;
  startDate: string;
  endDate?: string;
  rate: number;
  rateUnit: RateUnit;
  mobilizationCharge?: number;
  demobilizationCharge?: number;
  overtimeRate?: number;
  paymentTerms?: string;
  shiftStructure?: string;
  sundayCondition?: string;
  fuelNorms?: string;
  fuelScope?: ResponsibleParty;
  dehireTerms?: string;
  operatorScope?: OperatorScope;
  accommodationScope?: ResponsibleParty;
  workingHours?: number;
  workingDaysPerWeek?: number;
  minimumRentalPeriodValue?: number;
  minimumRentalPeriodUnit?: RateUnit;
  gstTerms?: string;
  noticePeriodDays?: number;
  commercialNotes?: string;
  companyTerms?: string;
}

// The one operation CommercialQuotationService needs from WorkOrderService —
// a narrow port so that cross-module dependency stays swappable/fakeable,
// unlike the deliberate RentalService exception (awardQuotation reuses
// Rental's real business logic, not just a data write; Work Order creation
// here is a plain "snapshot and store," closer to a repository operation).
export interface WorkOrderCreationPort {
  createFromAward(
    input: Omit<CreateWorkOrderInput, "referenceNumber">,
    scopeItems: { item: string; responsibleParty: ResponsibleParty; notes: string | null }[],
  ): Promise<unknown>;
}

export interface WorkOrderRepositoryPort {
  nextReferenceNumber(rentalCompanyOrganizationId: string): Promise<string>;
  create(input: CreateWorkOrderInput): Promise<WorkOrderRecord>;
  findById(id: string): Promise<WorkOrderRecord | undefined>;
  findByRentalId(rentalId: string): Promise<WorkOrderRecord | undefined>;
  findByQuotationId(quotationId: string): Promise<WorkOrderRecord | undefined>;
  listByRentalCompany(rentalCompanyOrganizationId: string): Promise<WorkOrderRecord[]>;
  listByRenter(renterOrganizationId: string): Promise<WorkOrderRecord[]>;
  updateStatus(id: string, status: WorkOrderStatus): Promise<WorkOrderRecord>;
}

export interface WorkOrderScopeItemRecord {
  id: string;
  work_order_id: string;
  item: string;
  responsible_party: ResponsibleParty;
  notes: string | null;
  created_at: Date | string;
}

export interface CreateWorkOrderScopeItemInput {
  workOrderId: string;
  item: string;
  responsibleParty: ResponsibleParty;
  notes?: string;
}

export interface WorkOrderScopeItemRepositoryPort {
  create(input: CreateWorkOrderScopeItemInput): Promise<WorkOrderScopeItemRecord>;
  listByWorkOrder(workOrderId: string): Promise<WorkOrderScopeItemRecord[]>;
}
