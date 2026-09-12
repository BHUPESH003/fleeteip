import { sql, type Kysely, type RawBuilder } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type {
  LogsheetRecord,
  LogsheetRepositoryPort,
  SubmitLogsheetInput,
  UtilizationTotals,
} from "../domain/ports.js";

const LOGSHEET_COLUMNS = [
  "id",
  "rental_id",
  "machine_id",
  "log_date",
  "shift",
  "operating_hours",
  "idle_hours",
  "overtime_hours",
  "operator_name",
  "fuel_consumed",
  "fuel_unit",
  "remarks",
  "customer_confirmed",
  "created_at",
  "updated_at",
] as const;

export class LogsheetRepository implements LogsheetRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async submit(input: SubmitLogsheetInput): Promise<LogsheetRecord> {
    const values = {
      rental_id: input.rentalId,
      machine_id: input.machineId,
      log_date: input.logDate,
      shift: input.shift ?? null,
      operating_hours: input.operatingHours ?? null,
      idle_hours: input.idleHours ?? null,
      overtime_hours: input.overtimeHours ?? null,
      operator_name: input.operatorName ?? null,
      fuel_consumed: input.fuelConsumed ?? null,
      fuel_unit: input.fuelUnit ?? null,
      remarks: input.remarks ?? null,
      customer_confirmed: input.customerConfirmed ?? false,
    };
    const row = await this.db
      .insertInto("logsheets")
      .values(values)
      .onConflict((oc) =>
        oc.columns(["rental_id", "log_date"]).doUpdateSet({
          shift: values.shift,
          operating_hours: values.operating_hours,
          idle_hours: values.idle_hours,
          overtime_hours: values.overtime_hours,
          operator_name: values.operator_name,
          fuel_consumed: values.fuel_consumed,
          fuel_unit: values.fuel_unit,
          remarks: values.remarks,
          customer_confirmed: values.customer_confirmed,
          updated_at: new Date(),
        }),
      )
      .returning(LOGSHEET_COLUMNS)
      .executeTakeFirstOrThrow();
    return row as LogsheetRecord;
  }

  async findByRentalAndDate(rentalId: string, logDate: string) {
    const row = await this.db
      .selectFrom("logsheets")
      .selectAll()
      .where("rental_id", "=", rentalId)
      .where("log_date", "=", logDate)
      .executeTakeFirst();
    return row as LogsheetRecord | undefined;
  }

  async listByRental(rentalId: string) {
    const rows = await this.db
      .selectFrom("logsheets")
      .selectAll()
      .where("rental_id", "=", rentalId)
      .orderBy("log_date", "asc")
      .execute();
    return rows as LogsheetRecord[];
  }

  async listByRentalCompanyOrganization(rentalCompanyOrganizationId: string) {
    const rows = await this.db
      .selectFrom("logsheets")
      .innerJoin("rentals", "rentals.id", "logsheets.rental_id")
      .where("rentals.rental_company_organization_id", "=", rentalCompanyOrganizationId)
      .select([
        "logsheets.id as id",
        "logsheets.rental_id as rental_id",
        "logsheets.machine_id as machine_id",
        "logsheets.log_date as log_date",
        "logsheets.shift as shift",
        "logsheets.operating_hours as operating_hours",
        "logsheets.idle_hours as idle_hours",
        "logsheets.overtime_hours as overtime_hours",
        "logsheets.operator_name as operator_name",
        "logsheets.fuel_consumed as fuel_consumed",
        "logsheets.fuel_unit as fuel_unit",
        "logsheets.remarks as remarks",
        "logsheets.customer_confirmed as customer_confirmed",
        "logsheets.created_at as created_at",
        "logsheets.updated_at as updated_at",
      ])
      .orderBy("logsheets.log_date", "desc")
      .execute();
    return rows as LogsheetRecord[];
  }

  async getRentalTotals(rentalId: string): Promise<UtilizationTotals> {
    return this.getTotals(sql`rental_id = ${rentalId}`);
  }

  async getMachineTotals(machineId: string): Promise<UtilizationTotals> {
    return this.getTotals(sql`machine_id = ${machineId}`);
  }

  private async getTotals(where: RawBuilder<unknown>): Promise<UtilizationTotals> {
    const result = await sql<{
      total_operating_hours: string | null;
      total_idle_hours: string | null;
      total_overtime_hours: string | null;
      logged_day_count: string;
    }>`
      SELECT
        COALESCE(SUM(operating_hours), 0) AS total_operating_hours,
        COALESCE(SUM(idle_hours), 0) AS total_idle_hours,
        COALESCE(SUM(overtime_hours), 0) AS total_overtime_hours,
        COUNT(*) AS logged_day_count
      FROM logsheets
      WHERE ${where}
    `.execute(this.db);
    const row = result.rows[0];
    return {
      totalOperatingHours: Number(row?.total_operating_hours ?? 0),
      totalIdleHours: Number(row?.total_idle_hours ?? 0),
      totalOvertimeHours: Number(row?.total_overtime_hours ?? 0),
      loggedDayCount: Number(row?.logged_day_count ?? 0),
    };
  }
}
