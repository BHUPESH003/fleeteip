import { MachineStatus, type Machine, type UpdateMachineRequest } from "@fleetip/contracts/equipment";
import { MaintenanceStatus } from "@fleetip/contracts/maintenance";
import { RentalStatus } from "@fleetip/contracts/rental";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors.js";
import type { MachineListParams, Page } from "@fleetip/contracts/list";
import { mapPage, type ParsedListQuery } from "../../../shared/list-query.js";
import type { ProductRepositoryPort } from "../../catalogue/domain/ports.js";
import type { MaintenanceRepositoryPort } from "../../maintenance/domain/ports.js";
import {
  maintenanceConflict,
  rentalConflict,
} from "../../marketplace/rental/application/availability.js";
import type { RentalRepositoryPort } from "../../marketplace/rental/domain/ports.js";
import { PermissionService } from "../../permissions/application/permission-service.js";
import { canTransition } from "../domain/machine-status.js";
import type { CreateMachineInput, MachineRecord, MachineRepositoryPort } from "../domain/ports.js";

function toMachine(record: MachineRecord): Machine {
  return {
    id: record.id,
    organizationId: record.organization_id,
    productId: record.product_id,
    assetCode: record.asset_code,
    chassisNumber: record.chassis_number,
    registrationNumber: record.registration_number,
    yearOfManufacture: record.year_of_manufacture,
    status: record.status,
    createdAt: new Date(record.created_at).toISOString(),
  };
}

const ALL_TIME_START = "0001-01-01";
const RENTAL_STATE: Partial<Record<RentalStatus, string>> = {
  [RentalStatus.confirmed]: "booked",
  [RentalStatus.active]: "on rent",
  [RentalStatus.off_rent]: "off rent and returning",
};

export class EquipmentService {
  constructor(
    private readonly machineRepository: MachineRepositoryPort,
    private readonly productRepository: ProductRepositoryPort,
    private readonly permissionService: PermissionService,
    private readonly rentalRepository: RentalRepositoryPort,
    private readonly maintenanceRepository: MaintenanceRepositoryPort,
  ) {}

  async createMachine(
    userId: string,
    organizationId: string,
    input: Omit<CreateMachineInput, "organizationId">,
  ): Promise<Machine> {
    await this.permissionService.requirePermission(userId, organizationId, "equipment.manage");

    const product = await this.productRepository.findById(input.productId);
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    // Soft cascade (0037): a disabled subcategory/category disables its products too.
    if (product.disabled_at || product.subcategory_disabled_at || product.category_disabled_at) {
      const message = "This product is disabled in the catalogue";
      throw new ValidationError(message, [{ path: "productId", message }]);
    }
    // Asset code is assigned automatically first when the caller doesn't
    // supply one, so a machine always has a stable fleet identifier even
    // before the rest of its details are filled in. A caller may still
    // override it with its own fleet code.
    const supplied = input.assetCode?.trim();
    if (supplied && (await this.machineRepository.assetCodeExists(organizationId, supplied))) {
      throw new ConflictError("Asset code already exists", "assetCode");
    }

    const base = { organizationId, productId: input.productId, chassisNumber: input.chassisNumber, registrationNumber: input.registrationNumber, yearOfManufacture: input.yearOfManufacture };
    // An auto-assigned code can lose a race with a concurrent registration;
    // the unique index rejects the loser, so pick the next code and retry.
    let record: MachineRecord | undefined;
    for (let attempt = 0; !record; attempt += 1) {
      try {
        record = await this.machineRepository.create({ ...base, assetCode: supplied || (await this.nextAssetCode(organizationId)) });
      } catch (error) {
        if (supplied || !(error instanceof ConflictError) || attempt >= 4) throw error;
      }
    }
    return toMachine(record);
  }

  // Generates the next free sequential asset code for an organization
  // (AST-0001, AST-0002, ...). Seeded from the current machine count, then
  // advanced past any collision — covers the case where a user previously
  // typed a code that happens to match the generated pattern.
  private async nextAssetCode(organizationId: string): Promise<string> {
    const count = await this.machineRepository.countByOrganization(organizationId);
    let n = count + 1;
    // Bounded loop: at most one probe per existing machine plus a safety cap.
    for (let attempts = 0; attempts <= count + 1; attempts += 1) {
      const candidate = `AST-${String(n).padStart(4, "0")}`;
      if (!(await this.machineRepository.assetCodeExists(organizationId, candidate))) {
        return candidate;
      }
      n += 1;
    }
    // Fallback that can't collide with the sequential scheme.
    return `AST-${Date.now()}`;
  }

  async updateMachineStatus(
    userId: string,
    organizationId: string,
    machineId: string,
    newStatus: MachineStatus,
  ): Promise<Machine> {
    await this.permissionService.requirePermission(userId, organizationId, "equipment.manage");
    const machine = await this.machineRepository.findById(machineId);
    if (!machine) {
      throw new NotFoundError("Machine not found");
    }
    if (machine.organization_id !== organizationId) {
      throw new NotFoundError("Machine not found in this organization");
    }

    const canMachineTransition = canTransition(machine.status, newStatus);
    if (!canMachineTransition) {
      throw new ConflictError(`Cannot transition machine from ${machine.status} to ${newStatus}`);
    }
    if (newStatus === MachineStatus.retired) await this.assertCanRetire(machine);

    const record = await this.machineRepository.updateStatus(machineId, newStatus);
    return toMachine(record);
  }

  async updateMachine(
    userId: string,
    organizationId: string,
    machineId: string,
    updates: UpdateMachineRequest,
  ): Promise<Machine> {
    await this.permissionService.requirePermission(userId, organizationId, "equipment.manage");
    const machine = await this.machineRepository.findById(machineId);
    if (!machine) {
      throw new NotFoundError("Machine not found");
    }
    if (machine.organization_id !== organizationId) {
      throw new NotFoundError("Machine not found in this organization");
    }

    if (updates.assetCode && updates.assetCode !== machine.asset_code) {
      const assetCodeExists = await this.machineRepository.assetCodeExists(
        organizationId,
        updates.assetCode,
        machineId,
      );
      if (assetCodeExists) {
        throw new ConflictError("Asset code already exists", "assetCode");
      }
    }

    const record = await this.machineRepository.updateDetails(machineId, updates);
    return toMachine(record);
  }

  // Retiring is final, so nothing may still be booked or in the workshop:
  // a confirmed/active/off-rent rental or a scheduled/in-progress job, any dates.
  private async assertCanRetire(machine: MachineRecord): Promise<void> {
    const [rentals, jobs] = await Promise.all([
      this.rentalRepository.findCommittedOverlapping([machine.id], ALL_TIME_START, null),
      this.maintenanceRepository.findOpenOverlapping([machine.id], ALL_TIME_START, null),
    ]);
    const rental = rentals[0];
    if (rental) {
      const conflict = rentalConflict(rental);
      throw new ConflictError(
        `${machine.asset_code} can't be retired while ${conflict.reference} is ${RENTAL_STATE[rental.status] ?? rental.status}. Complete or cancel it first.`,
        undefined,
        conflict,
      );
    }
    const job = jobs[0];
    if (job) {
      throw new ConflictError(
        `${machine.asset_code} can't be retired while a workshop job from ${job.start_date} is ${job.status === MaintenanceStatus.in_progress ? "in progress" : "scheduled"}. Complete or cancel it first.`,
        undefined,
        maintenanceConflict(job),
      );
    }
  }

  async listMachines(userId: string, organizationId: string): Promise<Machine[]> {
    await this.permissionService.requirePermission(userId, organizationId, "equipment.manage");
    const records = await this.machineRepository.listByOrganization(organizationId);
    return records.map(toMachine);
  }

  // Paged/filtered variant of listMachines (ticket l).
  async listMachinesPage(
    userId: string,
    organizationId: string,
    query: ParsedListQuery<MachineListParams>,
  ): Promise<Page<Machine>> {
    await this.permissionService.requirePermission(userId, organizationId, "equipment.manage");
    return mapPage(await this.machineRepository.listMachinesPage(organizationId, query), toMachine);
  }
}
