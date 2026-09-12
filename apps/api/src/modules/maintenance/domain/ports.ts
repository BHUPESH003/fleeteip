import type { MaintenanceStatus, MaintenanceType } from "@fleetip/contracts/maintenance";

export interface MaintenanceRecord {
  id: string;
  machine_id: string;
  maintenance_type: MaintenanceType;
  start_date: string;
  end_date: string | null;
  status: MaintenanceStatus;
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateMaintenanceInput {
  machineId: string;
  maintenanceType: MaintenanceType;
  startDate: string;
  endDate?: string;
  notes?: string;
}

export interface MaintenanceRepositoryPort {
  create(input: CreateMaintenanceInput): Promise<MaintenanceRecord>;
  findById(id: string): Promise<MaintenanceRecord | undefined>;
  listByMachine(machineId: string): Promise<MaintenanceRecord[]>;
  // Standalone Maintenance screen — every maintenance record across the
  // Rental Company's own fleet, not one machine at a time. A single join,
  // not a loop over listByMachine per machine.
  listByOrganization(rentalCompanyOrganizationId: string): Promise<MaintenanceRecord[]>;
  updateStatus(id: string, status: MaintenanceStatus): Promise<MaintenanceRecord>;
  // Read by RentalService before confirming/activating a Rental — the
  // Maintenance side of the two-way availability check. See
  // docs/execution-and-billing-design.md §2.
  hasOverlappingMaintenance(
    machineId: string,
    startDate: string,
    endDate: string | null,
  ): Promise<boolean>;
}
