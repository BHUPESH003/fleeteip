import { MaintenanceStatus } from "@fleetip/contracts/maintenance";
import { sql, type Kysely, type Transaction } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type { MaintenanceListParams } from "@fleetip/contracts/list";
import { executePage } from "../../../infrastructure/database/list-page.js";
import { containsPattern, type ParsedListQuery } from "../../../shared/list-query.js";
import { ConflictError } from "../../../shared/errors.js";
import type {
  CreateMaintenanceInput,
  MachineStatusChange,
  MaintenanceRecord,
  MaintenanceRepositoryPort,
} from "../domain/ports.js";

const MAINTENANCE_COLUMNS = [
  "id",
  "machine_id",
  "maintenance_type",
  "start_date",
  "end_date",
  "status",
  "notes",
  "rental_id",
  "created_at",
  "updated_at",
] as const;

function toMaintenanceRecord(
  row: Omit<MaintenanceRecord, "status" | "maintenance_type"> & {
    status: string;
    maintenance_type: string;
  },
): MaintenanceRecord {
  return row as MaintenanceRecord;
}

export class MaintenanceRepository implements MaintenanceRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async create(input: CreateMaintenanceInput): Promise<MaintenanceRecord> {
    return this.db.transaction().execute(async (trx) => {
      const row = await trx
        .insertInto("maintenance_records")
        .values({
          machine_id: input.machineId,
          maintenance_type: input.maintenanceType,
          start_date: input.startDate,
          end_date: input.endDate ?? null,
          status: input.status ?? MaintenanceStatus.scheduled,
          notes: input.notes ?? null,
          rental_id: input.rentalId ?? null,
        })
        .returning(MAINTENANCE_COLUMNS)
        .executeTakeFirstOrThrow();
      if (input.machineStatus) await moveMachine(trx, input.machineId, input.machineStatus);
      return toMaintenanceRecord(row);
    });
  }

  async findById(id: string) {
    const row = await this.db
      .selectFrom("maintenance_records")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toMaintenanceRecord(row) : undefined;
  }

  async listByMachine(machineId: string) {
    const rows = await this.db
      .selectFrom("maintenance_records")
      .selectAll()
      .where("machine_id", "=", machineId)
      .orderBy("start_date", "desc")
      .execute();
    return rows.map(toMaintenanceRecord);
  }

  async listByOrganization(rentalCompanyOrganizationId: string) {
    const rows = await this.db
      .selectFrom("maintenance_records")
      .innerJoin("machines", "machines.id", "maintenance_records.machine_id")
      .where("machines.organization_id", "=", rentalCompanyOrganizationId)
      .select([
        "maintenance_records.id as id",
        "maintenance_records.machine_id as machine_id",
        "maintenance_records.maintenance_type as maintenance_type",
        "maintenance_records.start_date as start_date",
        "maintenance_records.end_date as end_date",
        "maintenance_records.status as status",
        "maintenance_records.notes as notes",
        "maintenance_records.rental_id as rental_id",
        "maintenance_records.created_at as created_at",
        "maintenance_records.updated_at as updated_at",
      ])
      .orderBy("maintenance_records.start_date", "desc")
      .execute();
    return rows.map(toMaintenanceRecord);
  }

  async listMaintenancePage(
    rentalCompanyOrganizationId: string,
    query: ParsedListQuery<MaintenanceListParams>,
  ) {
    let q = this.db
      .selectFrom("maintenance_records")
      .innerJoin("machines", "machines.id", "maintenance_records.machine_id")
      .where("machines.organization_id", "=", rentalCompanyOrganizationId)
      .selectAll("maintenance_records");
    if (query.status) q = q.where("maintenance_records.status", "=", query.status);
    if (query.maintenanceType) q = q.where("maintenance_records.maintenance_type", "=", query.maintenanceType);
    if (query.machineId) q = q.where("maintenance_records.machine_id", "=", query.machineId);
    if (query.from) q = q.where("maintenance_records.start_date", ">=", query.from);
    if (query.to) q = q.where("maintenance_records.start_date", "<=", query.to);
    if (query.q) {
      const pattern = containsPattern(query.q);
      q = q.where((eb) =>
        eb.or([eb("machines.asset_code", "ilike", pattern), eb("machines.registration_number", "ilike", pattern)]),
      );
    }
    const sortColumn = {
      startDate: "maintenance_records.start_date",
      createdAt: "maintenance_records.created_at",
    }[query.sort];
    return executePage(q, sortColumn, "maintenance_records.id", query, toMaintenanceRecord);
  }

  async updateStatus(id: string, status: MaintenanceStatus, machineStatus?: MachineStatusChange) {
    return this.db.transaction().execute(async (trx) => {
      const row = await trx
        .updateTable("maintenance_records")
        .set({ status, updated_at: new Date() })
        .where("id", "=", id)
        .returning(MAINTENANCE_COLUMNS)
        .executeTakeFirstOrThrow();
      if (machineStatus) await moveMachine(trx, row.machine_id, machineStatus);
      return toMaintenanceRecord(row);
    });
  }

  async findOpenOverlapping(machineIds: string[], startDate: string, endDate: string | null) {
    if (machineIds.length === 0) return [];
    const rows = await this.db
      .selectFrom("maintenance_records")
      .select(MAINTENANCE_COLUMNS)
      .where("machine_id", "in", machineIds)
      .where("status", "in", [MaintenanceStatus.scheduled, MaintenanceStatus.in_progress])
      .where(
        sql<boolean>`daterange(start_date, end_date, '[]') && daterange(${startDate}, ${endDate}, '[]')`,
      )
      .orderBy("start_date")
      .execute();
    return rows.map(toMaintenanceRecord);
  }
}

// The machine write that rides along with a maintenance write. Guarded on the
// status the service saw, so a concurrent change rolls the whole transaction back.
async function moveMachine(
  trx: Transaction<Database>,
  machineId: string,
  change: MachineStatusChange,
): Promise<void> {
  const moved = await trx
    .updateTable("machines")
    .set({ status: change.to })
    .where("id", "=", machineId)
    .where("status", "=", change.from)
    .executeTakeFirst();
  if (moved.numUpdatedRows === 0n) {
    throw new ConflictError(`Cannot transition machine from ${change.from} to ${change.to}`);
  }
}
