import type {
  CreateMaintenanceRequest,
  MaintenanceRecord as MaintenanceContract,
  MaintenanceStatus,
} from "@fleetip/contracts/maintenance";
import { MachineStatus } from "@fleetip/contracts/equipment";
import { MaintenanceStatus as Status } from "@fleetip/contracts/maintenance";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors.js";
import type { MaintenanceListParams, Page } from "@fleetip/contracts/list";
import { mapPage, type ParsedListQuery } from "../../../shared/list-query.js";
import { canTransition as canMachineTransition } from "../../equipment/domain/machine-status.js";
import type { MachineRecord, MachineRepositoryPort } from "../../equipment/domain/ports.js";
import { availabilityConflictError, rentalConflict } from "../../marketplace/rental/application/availability.js";
import type { RentalRepositoryPort } from "../../marketplace/rental/domain/ports.js";
import { PermissionService } from "../../permissions/application/permission-service.js";
import { canTransition } from "../domain/maintenance-status.js";
import type {
  MachineStatusChange,
  MaintenanceRecord,
  MaintenanceRepositoryPort,
} from "../domain/ports.js";

function toMaintenance(record: MaintenanceRecord): MaintenanceContract {
  return {
    id: record.id,
    machineId: record.machine_id,
    maintenanceType: record.maintenance_type,
    startDate: record.start_date,
    endDate: record.end_date,
    status: record.status,
    notes: record.notes,
    rentalId: record.rental_id,
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

  /** Plan a job: created Scheduled, machine status untouched. */
  async createMaintenance(
    userId: string,
    rentalCompanyOrganizationId: string,
    input: CreateMaintenanceRequest,
  ): Promise<MaintenanceContract> {
    await this.checkNewJob(userId, rentalCompanyOrganizationId, input);
    const record = await this.maintenanceRepository.create({ ...input });
    return toMaintenance(record);
  }

  /** Send to workshop: job created In progress and machine Active → Under maintenance, one transaction. */
  async sendToWorkshop(
    userId: string,
    rentalCompanyOrganizationId: string,
    input: CreateMaintenanceRequest,
  ): Promise<MaintenanceContract> {
    await this.permissionService.requirePermission(userId, rentalCompanyOrganizationId, "equipment.manage");
    const machine = await this.checkNewJob(userId, rentalCompanyOrganizationId, input);
    const machineStatus = machineMove(machine, MachineStatus.under_maintenance);
    const record = await this.maintenanceRepository.create({
      ...input,
      status: Status.in_progress,
      machineStatus,
    });
    return toMaintenance(record);
  }

  /** Log a job that already happened: created Completed in one write, machine status untouched. */
  async logCompleted(
    userId: string,
    rentalCompanyOrganizationId: string,
    input: CreateMaintenanceRequest,
  ): Promise<MaintenanceContract> {
    await this.checkNewJob(userId, rentalCompanyOrganizationId, input);
    const record = await this.maintenanceRepository.create({ ...input, status: Status.completed });
    return toMaintenance(record);
  }

  // Shared rules for every new job: tenant-scoped machine and rental link,
  // and no overlap with a committing rental other than the linked one.
  private async checkNewJob(
    userId: string,
    rentalCompanyOrganizationId: string,
    input: CreateMaintenanceRequest,
  ): Promise<MachineRecord> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "maintenance.manage",
    );

    const machine = await this.machineRepository.findById(input.machineId);
    if (!machine || machine.organization_id !== rentalCompanyOrganizationId) {
      throw new NotFoundError("Machine not found in this organization");
    }

    if (input.rentalId) {
      const rental = await this.rentalRepository.findById(input.rentalId);
      if (!rental || rental.rental_company_organization_id !== rentalCompanyOrganizationId) {
        throw new NotFoundError("Rental not found in this organization");
      }
      if (rental.machine_id !== input.machineId) {
        const message = "That rental is for a different machine";
        throw new ValidationError(message, [{ path: "rentalId", message }]);
      }
    }

    const [blocker] = (
      await this.rentalRepository.findCommittedOverlapping(
        [input.machineId],
        input.startDate,
        input.endDate ?? null,
      )
    ).filter((rental) => rental.id !== input.rentalId);
    if (blocker) throw availabilityConflictError(rentalConflict(blocker), "startDate");
    return machine;
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

  // Paged/filtered variant of listByOrganization (ticket l).
  async listMaintenancePage(
    userId: string,
    rentalCompanyOrganizationId: string,
    query: ParsedListQuery<MaintenanceListParams>,
  ): Promise<Page<MaintenanceContract>> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "maintenance.manage",
    );
    const page = await this.maintenanceRepository.listMaintenancePage(rentalCompanyOrganizationId, query);
    return mapPage(page, toMaintenance);
  }

  async getMaintenanceRecord(
    userId: string,
    rentalCompanyOrganizationId: string,
    maintenanceId: string,
  ): Promise<MaintenanceContract> {
    await this.permissionService.requirePermission(
      userId,
      rentalCompanyOrganizationId,
      "maintenance.manage",
    );
    const record = await this.maintenanceRepository.findById(maintenanceId);
    if (!record) throw new NotFoundError("Maintenance record not found");
    const machine = await this.machineRepository.findById(record.machine_id);
    if (!machine || machine.organization_id !== rentalCompanyOrganizationId) {
      throw new NotFoundError("Maintenance record not found in this organization");
    }
    return toMaintenance(record);
  }

  async updateStatus(
    userId: string,
    rentalCompanyOrganizationId: string,
    maintenanceId: string,
    newStatus: MaintenanceStatus,
    // Also move the machine, in the same transaction as the job's status.
    newMachineStatus?: MachineStatus,
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
    let machineStatus: MachineStatusChange | undefined;
    if (newMachineStatus) {
      await this.permissionService.requirePermission(userId, rentalCompanyOrganizationId, "equipment.manage");
      machineStatus = machineMove(machine, newMachineStatus);
    }
    const record = await this.maintenanceRepository.updateStatus(maintenanceId, newStatus, machineStatus);
    return toMaintenance(record);
  }
}

function machineMove(machine: MachineRecord, to: MachineStatus): MachineStatusChange {
  if (!canMachineTransition(machine.status, to)) {
    throw new ConflictError(`Cannot transition machine from ${machine.status} to ${to}`);
  }
  return { from: machine.status, to };
}
