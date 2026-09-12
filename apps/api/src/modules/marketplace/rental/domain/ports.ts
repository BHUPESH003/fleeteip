import type {
  ClientSnapshot,
  OperatorScope,
  RateUnit,
  RentalStatus,
} from "@fleetip/contracts/rental";

export interface RentalRecord {
  id: string;
  rental_company_organization_id: string;
  renter_organization_id: string | null;
  client_snapshot: ClientSnapshot | null;
  machine_id: string;
  status: RentalStatus;
  project_name: string | null;
  project_location: string | null;
  start_date: string;
  end_date: string | null;
  rate: number;
  rate_unit: RateUnit;
  mobilization_charge: number | null;
  demobilization_charge: number | null;
  payment_terms: string | null;
  shift_structure: string | null;
  overtime_rate: number | null;
  sunday_condition: string | null;
  fuel_norms: string | null;
  operator_scope: OperatorScope | null;
  notice_period_days: number | null;
  dehire_terms: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateRentalInput {
  rentalCompanyOrganizationId: string;
  renterOrganizationId?: string;
  clientSnapshot?: ClientSnapshot;
  machineId: string;
  // Always "confirmed" in practice (no draft state — see
  // docs/rental-domain-design.md §4) — the caller states it explicitly
  // rather than the DB defaulting it, keeping the DB passive.
  status: RentalStatus;
  projectName?: string;
  projectLocation?: string;
  startDate: string;
  endDate?: string;
  rate: number;
  rateUnit: RateUnit;
  mobilizationCharge?: number;
  demobilizationCharge?: number;
  paymentTerms?: string;
  shiftStructure?: string;
  overtimeRate?: number;
  sundayCondition?: string;
  fuelNorms?: string;
  operatorScope?: OperatorScope;
  noticePeriodDays?: number;
  dehireTerms?: string;
}

// Only the fields §11 locks as editable while status = confirmed —
// machineId, party, and dates are deliberately absent (see
// docs/rental-domain-design.md §23 step 2 / createRentalRequestSchema note
// in packages/contracts/src/rental/index.ts).
export interface UpdateRentalTermsInput {
  projectName?: string;
  projectLocation?: string;
  rate?: number;
  rateUnit?: RateUnit;
  mobilizationCharge?: number;
  demobilizationCharge?: number;
  paymentTerms?: string;
  shiftStructure?: string;
  overtimeRate?: number;
  sundayCondition?: string;
  fuelNorms?: string;
  operatorScope?: OperatorScope;
  noticePeriodDays?: number;
  dehireTerms?: string;
}

export interface RentalRepositoryPort {
  create(input: CreateRentalInput): Promise<RentalRecord>;
  findById(id: string): Promise<RentalRecord | undefined>;
  listByOrganization(rentalCompanyOrganizationId: string): Promise<RentalRecord[]>;
  listByRenterOrganization(renterOrganizationId: string): Promise<RentalRecord[]>;
  updateTerms(id: string, updates: UpdateRentalTermsInput): Promise<RentalRecord>;
  updateStatus(id: string, status: RentalStatus): Promise<RentalRecord>;
  // Application-level pre-check (docs/rental-domain-design.md §10 layer 1) —
  // the real guarantee is the DB exclusion constraint, this exists only for
  // a fast, friendly error before ever reaching the database.
  isAvailable(machineId: string, startDate: string, endDate: string | null): Promise<boolean>;
  // Global search — project name/client name match, one side of the party
  // split (mirrors listByOrganization/listByRenterOrganization).
  searchByOrganization(rentalCompanyOrganizationId: string, query: string): Promise<RentalRecord[]>;
  searchByRenterOrganization(renterOrganizationId: string, query: string): Promise<RentalRecord[]>;
}
