import type { MaintenanceStatus } from "@fleetip/contracts/maintenance";
import { sql, type Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type {
  CreateMaintenanceInput,
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
    const row = await this.db
      .insertInto("maintenance_records")
      .values({
        machine_id: input.machineId,
        maintenance_type: input.maintenanceType,
        start_date: input.startDate,
        end_date: input.endDate ?? null,
        status: "scheduled",
        notes: input.notes ?? null,
      })
      .returning(MAINTENANCE_COLUMNS)
      .executeTakeFirstOrThrow();
    return toMaintenanceRecord(row);
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

  async updateStatus(id: string, status: MaintenanceStatus) {
    const row = await this.db
      .updateTable("maintenance_records")
      .set({ status, updated_at: new Date() })
      .where("id", "=", id)
      .returning(MAINTENANCE_COLUMNS)
      .executeTakeFirstOrThrow();
    return toMaintenanceRecord(row);
  }

  async hasOverlappingMaintenance(machineId: string, startDate: string, endDate: string | null) {
    const result = await sql<{ overlapping: boolean }>`
      SELECT EXISTS (
        SELECT 1 FROM maintenance_records
        WHERE machine_id = ${machineId}
          AND status IN ('scheduled', 'in_progress')
          AND daterange(start_date, end_date, '[]') && daterange(${startDate}, ${endDate}, '[]')
      ) AS overlapping
    `.execute(this.db);
    return result.rows[0]?.overlapping ?? false;
  }
}
