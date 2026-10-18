import type { MachineStatus } from "@fleetip/contracts/equipment";
import type { MachineListParams } from "@fleetip/contracts/list";
import type { Page, ParsedListQuery } from "../../../shared/list-query.js";

export interface MachineRecord {
  id: string;
  organization_id: string;
  product_id: string;
  asset_code: string;
  chassis_number: string | null;
  registration_number: string | null;
  year_of_manufacture: number | null;
  status: MachineStatus;
  created_at: Date | string;
}

export interface CreateMachineInput {
  organizationId: string;
  productId: string;
  // Optional: EquipmentService auto-assigns one when omitted.
  assetCode?: string;
  chassisNumber?: string;
  // Optional/not-applicable for crawler/tracked equipment with no road registration.
  registrationNumber?: string;
  yearOfManufacture?: number;
}

// Deliberately excludes organizationId/productId — see updateMachineRequestSchema.
export interface UpdateMachineInput {
  assetCode?: string;
  chassisNumber?: string;
  registrationNumber?: string;
  yearOfManufacture?: number;
}

export interface MachineRepositoryPort {
  create(input: CreateMachineInput): Promise<MachineRecord>;
  findById(id: string): Promise<MachineRecord | undefined>;
  listByOrganization(organizationId: string): Promise<MachineRecord[]>;
  listMachinesPage(
    organizationId: string,
    query: ParsedListQuery<MachineListParams>,
  ): Promise<Page<MachineRecord>>;
  updateStatus(id: string, status: MachineStatus): Promise<MachineRecord>;
  updateDetails(id: string, updates: UpdateMachineInput): Promise<MachineRecord>;
  // excludeMachineId lets the update path check "would this new asset code
  // collide with a DIFFERENT machine" without always tripping on itself.
  assetCodeExists(
    organizationId: string,
    assetCode: string,
    excludeMachineId?: string,
  ): Promise<boolean>;
  // Backs auto-assignment of an asset code when the caller doesn't supply
  // one: the count seeds the next sequential number (collisions are still
  // re-checked via assetCodeExists before insert).
  countByOrganization(organizationId: string): Promise<number>;
  // Global search — asset code/registration number match, this org's own
  // fleet only. Capped (see implementation) since it backs a type-ahead box,
  // not a paginated list.
  search(organizationId: string, query: string): Promise<MachineRecord[]>;
}
