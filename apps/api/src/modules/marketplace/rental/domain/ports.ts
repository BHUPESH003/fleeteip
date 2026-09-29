import type {
  ActualDatesVerificationStatus,
  ClientSnapshot,
  OperatorScope,
  RateUnit,
  RentalEventType,
  RentalStatus,
} from "@fleetip/contracts/rental";
import type { RentalListParams } from "@fleetip/contracts/list";
import type { Page, ParsedListQuery } from "../../../../shared/list-query.js";

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
  actual_start_date: string | null;
  actual_end_date: string | null;
  actual_dates_verification_status: ActualDatesVerificationStatus | null;
  actual_dates_dispute_reason: string | null;
  // Pending date-change proposal (migration 0032) — pending iff
  // date_change_proposed_at is set. ponytail: optional only so the many
  // RentalRecord fixtures in other modules' tests needn't list them; the
  // repository always returns them.
  proposed_start_date?: string | null;
  proposed_end_date?: string | null;
  date_change_reason?: string | null;
  date_change_proposed_at?: Date | string | null;
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
// in packages/contracts/src/rental/index.ts). undefined = unchanged,
// null = clear the value.
export interface UpdateRentalTermsInput {
  projectName?: string | null;
  projectLocation?: string | null;
  rate?: number;
  rateUnit?: RateUnit;
  mobilizationCharge?: number | null;
  demobilizationCharge?: number | null;
  paymentTerms?: string | null;
  shiftStructure?: string | null;
  overtimeRate?: number | null;
  sundayCondition?: string | null;
  fuelNorms?: string | null;
  operatorScope?: OperatorScope | null;
  noticePeriodDays?: number | null;
  dehireTerms?: string | null;
}

export interface RentalRepositoryPort {
  create(input: CreateRentalInput): Promise<RentalRecord>;
  findById(id: string): Promise<RentalRecord | undefined>;
  listByOrganization(rentalCompanyOrganizationId: string): Promise<RentalRecord[]>;
  listByRenterOrganization(renterOrganizationId: string): Promise<RentalRecord[]>;
  // One keyset page of either party's rentals, filtered server-side (ticket l).
  listRentalsPage(
    party: "rentalCompany" | "renter",
    organizationId: string,
    query: ParsedListQuery<RentalListParams>,
  ): Promise<Page<RentalRecord>>;
  updateTerms(id: string, updates: UpdateRentalTermsInput): Promise<RentalRecord>;
  // On "active"/"off_rent", actualDate also writes actual_start_date/
  // actual_end_date and resets actual_dates_verification_status to
  // "pending" — folded into the same status write, mirroring Transport's
  // own combined {status, actualDate} update.
  updateStatus(id: string, status: RentalStatus, actualDate?: string): Promise<RentalRecord>;
  setActualDatesVerification(
    id: string,
    status: "verified" | "disputed",
    disputeReason?: string,
  ): Promise<RentalRecord>;
  // Application-level pre-check (docs/rental-domain-design.md §10 layer 1) —
  // the real guarantee is the DB exclusion constraint, this exists only for
  // a fast, friendly error (naming the rental) before ever reaching the
  // database. Committing rentals (confirmed/active/off_rent) on any of these
  // machines overlapping [startDate, endDate] (null end = open-ended), one query.
  findCommittedOverlapping(
    machineIds: string[],
    startDate: string,
    endDate: string | null,
  ): Promise<RentalRecord[]>;
  // Global search — project name/client name match, one side of the party
  // split (mirrors listByOrganization/listByRenterOrganization).
  searchByOrganization(rentalCompanyOrganizationId: string, query: string): Promise<RentalRecord[]>;
  searchByRenterOrganization(renterOrganizationId: string, query: string): Promise<RentalRecord[]>;
}

export interface RentalEventRecord {
  id: string;
  rental_id: string;
  organization_id: string;
  organization_name: string | null;
  type: RentalEventType;
  detail: Record<string, unknown> | null;
  created_at: Date | string;
}

export interface RecordRentalEventInput {
  rentalId: string;
  organizationId: string;
  actorUserId: string | null;
  type: RentalEventType;
  detail?: Record<string, unknown>;
}

// Date changes, actual-date corrections and the activity log. A separate
// port from RentalRepositoryPort (the same RentalRepository implements
// both) so the other modules that only read rentals don't have to fake it.
export interface RentalChangeRepositoryPort {
  proposeDateChange(
    id: string,
    proposal: { startDate: string; endDate: string | null; reason: string | null },
  ): Promise<RentalRecord>;
  clearDateChange(id: string): Promise<RentalRecord>;
  // Writes the planned dates and clears any pending proposal. Throws
  // ConflictError if the DB exclusion constraint rejects the new range.
  changeDates(id: string, startDate: string, endDate: string | null): Promise<RentalRecord>;
  // Sets new actual dates and puts verification back to "pending".
  correctActualDates(id: string, actualStartDate: string, actualEndDate: string | null): Promise<RentalRecord>;
  recordEvent(input: RecordRentalEventInput): Promise<void>;
  listEvents(rentalId: string): Promise<RentalEventRecord[]>;
}
