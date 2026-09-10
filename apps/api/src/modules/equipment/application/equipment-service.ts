import type { Machine, MachineStatus } from "@fleetip/contracts/equipment";
import { ConflictError, NotFoundError } from "../../../shared/errors.js";
import type { ProductRepositoryPort } from "../../catalogue/domain/ports.js";
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

export class EquipmentService {
  constructor(
    private readonly machineRepository: MachineRepositoryPort,
    private readonly productRepository: ProductRepositoryPort,
    private readonly permissionService: PermissionService,
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
    const assetCodeExists = await this.machineRepository.assetCodeExists(
      organizationId,
      input.assetCode,
    );
    if (assetCodeExists) {
      throw new ConflictError("Asset code already exists");
    }

    const record = await this.machineRepository.create({
      organizationId,
      productId: input.productId,
      assetCode: input.assetCode,
      chassisNumber: input.chassisNumber,
      registrationNumber: input.registrationNumber,
      yearOfManufacture: input.yearOfManufacture,
    });
    return toMachine(record);
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

    const record = await this.machineRepository.updateStatus(machineId, newStatus);
    return toMachine(record);
  }

  async listMachines(userId: string, organizationId: string): Promise<Machine[]> {
    await this.permissionService.requirePermission(userId, organizationId, "equipment.manage");
    const records = await this.machineRepository.listByOrganization(organizationId);
    return records.map(toMachine);
  }
}
