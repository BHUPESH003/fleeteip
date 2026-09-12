export interface LogsheetRecord {
  id: string;
  rental_id: string;
  machine_id: string;
  log_date: string;
  shift: string | null;
  operating_hours: number | null;
  idle_hours: number | null;
  overtime_hours: number | null;
  operator_name: string | null;
  fuel_consumed: number | null;
  fuel_unit: string | null;
  remarks: string | null;
  customer_confirmed: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface SubmitLogsheetInput {
  rentalId: string;
  machineId: string;
  logDate: string;
  shift?: string;
  operatingHours?: number;
  idleHours?: number;
  overtimeHours?: number;
  operatorName?: string;
  fuelConsumed?: number;
  fuelUnit?: string;
  remarks?: string;
  customerConfirmed?: boolean;
}

export interface UtilizationTotals {
  totalOperatingHours: number;
  totalIdleHours: number;
  totalOvertimeHours: number;
  loggedDayCount: number;
}

export interface LogsheetRepositoryPort {
  // Upserts on (rental_id, log_date) — resubmitting the same date corrects
  // it rather than duplicating. See docs/execution-and-billing-design.md §4.
  submit(input: SubmitLogsheetInput): Promise<LogsheetRecord>;
  findByRentalAndDate(rentalId: string, logDate: string): Promise<LogsheetRecord | undefined>;
  listByRental(rentalId: string): Promise<LogsheetRecord[]>;
  // Standalone Logsheets screen — every logsheet across the Rental Company's
  // own rentals, not one rental at a time. A single join, not a loop.
  listByRentalCompanyOrganization(rentalCompanyOrganizationId: string): Promise<LogsheetRecord[]>;
  getRentalTotals(rentalId: string): Promise<UtilizationTotals>;
  getMachineTotals(machineId: string): Promise<UtilizationTotals>;
}
