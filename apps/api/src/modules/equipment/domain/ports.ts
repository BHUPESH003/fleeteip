import type { MachineStatus } from "@fleetip/contracts/equipment";

export interface MachineRecord {
  id: string;
  organization_id: string;
  product_id: string;
  asset_code: string;
  chassis_number: string | null;
  registration_number: string;
  year_of_manufacture: number | null;
  status: MachineStatus;
  created_at: Date | string;
}

export interface CreateMachineInput {
  organizationId: string;
  productId: string;
  assetCode: string;
  chassisNumber?: string;
  registrationNumber: string;
  yearOfManufacture?: number;
}
export interface MachineRepositoryPort {
  create(input: CreateMachineInput): Promise<MachineRecord>;
  findById(id: string): Promise<MachineRecord | undefined>;
  listByOrganization(organizationId: string): Promise<MachineRecord[]>;
  updateStatus(id: string, status: MachineStatus): Promise<MachineRecord>;
  assetCodeExists(organizationId: string, assetCode: string): Promise<boolean>;
}
