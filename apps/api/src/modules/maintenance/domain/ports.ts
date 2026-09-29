import type { MachineStatus } from "@fleetip/contracts/equipment";
import type { MaintenanceStatus, MaintenanceType } from "@fleetip/contracts/maintenance";
import type { MaintenanceListParams } from "@fleetip/contracts/list";
import type { Page, ParsedListQuery } from "../../../shared/list-query.js";

export interface MaintenanceRecord {
  id: string;
  machine_id: string;
  maintenance_type: MaintenanceType;
  start_date: string;
  end_date: string | null;
  status: MaintenanceStatus;
  notes: string | null;
  rental_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateMaintenanceInput {
  machineId: string;
  maintenanceType: MaintenanceType;
  startDate: string;
  endDate?: string;
  notes?: string;
  rentalId?: string;
  /** Defaults to scheduled. */
  status?: MaintenanceStatus;
  /** Also move the machine in the same transaction; see MachineStatusChange. */
  machineStatus?: MachineStatusChange;
}

/**
 * A machine status write that rides along with a maintenance write, in one
 * transaction. The repository applies it only if the machine is still in
 * `from`; otherwise it throws ConflictError and nothing is saved.
 */
export interface MachineStatusChange {
  from: MachineStatus;
  to: MachineStatus;
}

export interface MaintenanceRepositoryPort {
  create(input: CreateMaintenanceInput): Promise<MaintenanceRecord>;
  findById(id: string): Promise<MaintenanceRecord | undefined>;
  listByMachine(machineId: string): Promise<MaintenanceRecord[]>;
  // Standalone Maintenance screen — every maintenance record across the
  // Rental Company's own fleet, not one machine at a time. A single join,
  // not a loop over listByMachine per machine.
  listByOrganization(rentalCompanyOrganizationId: string): Promise<MaintenanceRecord[]>;
  listMaintenancePage(
    rentalCompanyOrganizationId: string,
    query: ParsedListQuery<MaintenanceListParams>,
  ): Promise<Page<MaintenanceRecord>>;
  updateStatus(
    id: string,
    status: MaintenanceStatus,
    machineStatus?: MachineStatusChange,
  ): Promise<MaintenanceRecord>;
  // Read by RentalService before confirming/activating a Rental — the
  // Maintenance side of the two-way availability check. See
  // docs/execution-and-billing-design.md §2.
  // Open jobs (scheduled/in_progress) on any of these machines overlapping
  // [startDate, endDate] (null end = open-ended), one query.
  findOpenOverlapping(
    machineIds: string[],
    startDate: string,
    endDate: string | null,
  ): Promise<MaintenanceRecord[]>;
}
