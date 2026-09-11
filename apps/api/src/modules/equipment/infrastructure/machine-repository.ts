import type { MachineStatus } from "@fleetip/contracts/equipment";
import type { Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import { ConflictError } from "../../../shared/errors.js";
import type { CreateMachineInput, MachineRecord, MachineRepositoryPort } from "../domain/ports.js";

// SQLSTATE 23505 = unique_violation — backstops EquipmentService's
// check-then-insert assetCodeExists pre-check (see
// machines_organization_asset_code_unique in 0004_create_machines.ts)
// against the rare race where two requests pass the pre-check together.
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

// `machines.status` is a plain `text` column with no DB-level CHECK constraint
// (see docs/equipment-domain-design.md) — this app is the only writer, always
// through the closed MachineStatus enum, so narrowing it back here is safe.
function toMachineRecord(row: Omit<MachineRecord, "status"> & { status: string }): MachineRecord {
  return row as MachineRecord;
}

export class MachineRepository implements MachineRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async create(input: CreateMachineInput) {
    try {
      const row = await this.db
        .insertInto("machines")
        .values({
          organization_id: input.organizationId,
          product_id: input.productId,
          asset_code: input.assetCode,
          chassis_number: input.chassisNumber ?? null,
          registration_number: input.registrationNumber,
          year_of_manufacture: input.yearOfManufacture ?? null,
          status: "active",
        })
        .returning([
          "id",
          "organization_id",
          "product_id",
          "asset_code",
          "chassis_number",
          "registration_number",
          "year_of_manufacture",
          "status",
          "created_at",
        ])
        .executeTakeFirstOrThrow();
      return toMachineRecord(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          "A machine with this asset code already exists in this organization",
        );
      }
      throw error;
    }
  }

  async findById(id: string) {
    const row = await this.db
      .selectFrom("machines")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toMachineRecord(row) : undefined;
  }

  async listByOrganization(organizationId: string) {
    const rows = await this.db
      .selectFrom("machines")
      .selectAll()
      .where("organization_id", "=", organizationId)
      .execute();
    return rows.map(toMachineRecord);
  }

  async updateStatus(id: string, status: MachineStatus) {
    const row = await this.db
      .updateTable("machines")
      .set({ status })
      .where("id", "=", id)
      .returning([
        "id",
        "organization_id",
        "product_id",
        "asset_code",
        "chassis_number",
        "registration_number",
        "year_of_manufacture",
        "status",
        "created_at",
      ])
      .executeTakeFirstOrThrow();
    return toMachineRecord(row);
  }

  assetCodeExists(organizationId: string, assetCode: string) {
    return this.db
      .selectFrom("machines")
      .select("id")
      .where("organization_id", "=", organizationId)
      .where("asset_code", "=", assetCode)
      .executeTakeFirst()
      .then((row) => row !== undefined);
  }
}
