import type {
  CreateMaintenanceRequest,
  MaintenanceRecord as MaintenanceContract,
  MaintenanceStatus,
} from "@fleetip/contracts/maintenance";
import { ConflictError, NotFoundError } from "../../../shared/errors.js";
import type { MachineRepositoryPort } from "../../equipment/domain/ports.js";
import type { RentalRepositoryPort } from "../../marketplace/rental/domain/ports.js";
import { PermissionService } from "../../permissions/application/permission-service.js";
import { canTransition } from "../domain/maintenance-status.js";
import type { MaintenanceRecord, MaintenanceRepositoryPort } from "../domain/ports.js";

function toMaintenance(record: MaintenanceRecord): MaintenanceContract {
  return {
    id: record.id,
    machineId: record.machine_id,
    maintenanceType: record.maintenance_type,
    startDate: record.start_date,
    endDate: record.end_date,
    status: record.status,
    notes: record.notes,
    createdAt: new Date(record.created_at).toISOString(),
    updatedAt: new Date(record.updated_at).toISOString(),
  };
}

export class MaintenanceService {
  constructor(
    private readonly maintenanceRepository: MaintenanceRepositoryPort,
    private readonly machineRepository: MachineRepositoryPort,
    private readonly rentalRepository: RentalRepositoryPort,
    private readonly permissionService: PermissionService,
  ) {}

  async createMaintenance(
    userId: string,
    rentalCompanyOrganizationId: string,
    input: CreateMaintenanceRequest,
  ): Promise<MaintenanceContract> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "maintenance.manage",
    );

    const machine = await this.machineRepository.findById(input.machineId);
    if (!machine || machine.organization_id !== rentalCompanyOrganizationId) {
      throw new NotFoundError("Machine not found in this organization");
    }

    const available = await this.rentalRepository.isAvailable(
      input.machineId,
      input.startDate,
      input.endDate ?? null,
    );
    if (!available) {
      throw new ConflictError("Machine is committed to a Rental for part of this period");
    }

    const record = await this.maintenanceRepository.create({
      machineId: input.machineId,
      maintenanceType: input.maintenanceType,
      startDate: input.startDate,
      endDate: input.endDate,
      notes: input.notes,
    });
    return toMaintenance(record);
  }

  async listByMachine(
    userId: string,
    rentalCompanyOrganizationId: string,
    machineId: string,
  ): Promise<MaintenanceContract[]> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "maintenance.manage",
    );
    const machine = await this.machineRepository.findById(machineId);
    if (!machine || machine.organization_id !== rentalCompanyOrganizationId) {
      throw new NotFoundError("Machine not found in this organization");
    }
    const records = await this.maintenanceRepository.listByMachine(machineId);
    return records.map(toMaintenance);
  }

  // Standalone Maintenance screen — every maintenance record across the
  // Rental Company's own fleet, not one machine at a time.
  async listByOrganization(
    userId: string,
    rentalCompanyOrganizationId: string,
  ): Promise<MaintenanceContract[]> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "maintenance.manage",
    );
    const records = await this.maintenanceRepository.listByOrganization(
      rentalCompanyOrganizationId,
    );
    return records.map(toMaintenance);
  }

  async updateStatus(
    userId: string,
    rentalCompanyOrganizationId: string,
    maintenanceId: string,
    newStatus: MaintenanceStatus,
  ): Promise<MaintenanceContract> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "maintenance.manage",
    );
    const existing = await this.maintenanceRepository.findById(maintenanceId);
    if (!existing) throw new NotFoundError("Maintenance record not found");
    const machine = await this.machineRepository.findById(existing.machine_id);
    if (!machine || machine.organization_id !== rentalCompanyOrganizationId) {
      throw new NotFoundError("Maintenance record not found in this organization");
    }
    if (!canTransition(existing.status, newStatus)) {
      throw new ConflictError(
        `Cannot transition maintenance from ${existing.status} to ${newStatus}`,
      );
    }
    const record = await this.maintenanceRepository.updateStatus(maintenanceId, newStatus);
    return toMaintenance(record);
  }
}
