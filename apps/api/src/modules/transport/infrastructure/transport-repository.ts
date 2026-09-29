import { TransportStatus } from "@fleetip/contracts/transport";
import { sql, type Kysely } from "kysely";
import type { Database } from "../../../infrastructure/database/types.js";
import type { TransportListParams } from "@fleetip/contracts/list";
import { executePage } from "../../../infrastructure/database/list-page.js";
import { containsPattern, refIdPrefix, type ParsedListQuery } from "../../../shared/list-query.js";
import { ConflictError } from "../../../shared/errors.js";
import type {
  CreateTransportInput,
  TransportRecord,
  TransportRepositoryPort,
  UpdateTransportInput,
} from "../domain/ports.js";

const TRANSPORT_COLUMNS = [
  "id",
  "rental_id",
  "leg",
  "pickup_location",
  "destination",
  "planned_date",
  "actual_date",
  "status",
  "transport_details",
  "charges",
  "notes",
  "created_at",
  "updated_at",
] as const;

function toTransportRecord(
  row: Omit<TransportRecord, "leg" | "status"> & { leg: string; status: string },
): TransportRecord {
  return row as TransportRecord;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export class TransportRepository implements TransportRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async create(input: CreateTransportInput): Promise<TransportRecord> {
    try {
      const row = await this.db
        .insertInto("transport_records")
        .values({
          rental_id: input.rentalId,
          leg: input.leg,
          pickup_location: input.pickupLocation ?? null,
          destination: input.destination ?? null,
          planned_date: input.plannedDate ?? null,
          status: TransportStatus.planned,
          transport_details: input.transportDetails ?? null,
          charges: input.charges ?? null,
          notes: input.notes ?? null,
        })
        .returning(TRANSPORT_COLUMNS)
        .executeTakeFirstOrThrow();
      return toTransportRecord(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(`A ${input.leg} transport record already exists for this rental`);
      }
      throw error;
    }
  }

  async findById(id: string) {
    const row = await this.db
      .selectFrom("transport_records")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toTransportRecord(row) : undefined;
  }

  async findByRentalAndLeg(rentalId: string, leg: string) {
    const row = await this.db
      .selectFrom("transport_records")
      .selectAll()
      .where("rental_id", "=", rentalId)
      .where("leg", "=", leg)
      .executeTakeFirst();
    return row ? toTransportRecord(row) : undefined;
  }

  async listByRental(rentalId: string) {
    const rows = await this.db
      .selectFrom("transport_records")
      .selectAll()
      .where("rental_id", "=", rentalId)
      .execute();
    return rows.map(toTransportRecord);
  }

  async listByRentalCompanyOrganization(rentalCompanyOrganizationId: string) {
    const rows = await this.db
      .selectFrom("transport_records")
      .innerJoin("rentals", "rentals.id", "transport_records.rental_id")
      .where("rentals.rental_company_organization_id", "=", rentalCompanyOrganizationId)
      .select([
        "transport_records.id as id",
        "transport_records.rental_id as rental_id",
        "transport_records.leg as leg",
        "transport_records.pickup_location as pickup_location",
        "transport_records.destination as destination",
        "transport_records.planned_date as planned_date",
        "transport_records.actual_date as actual_date",
        "transport_records.status as status",
        "transport_records.transport_details as transport_details",
        "transport_records.charges as charges",
        "transport_records.notes as notes",
        "transport_records.created_at as created_at",
        "transport_records.updated_at as updated_at",
      ])
      .orderBy("transport_records.created_at", "desc")
      .execute();
    return rows.map(toTransportRecord);
  }

  async listTransportPage(rentalCompanyOrganizationId: string, query: ParsedListQuery<TransportListParams>) {
    let q = this.db
      .selectFrom("transport_records")
      .innerJoin("rentals", "rentals.id", "transport_records.rental_id")
      .innerJoin("machines", "machines.id", "rentals.machine_id")
      .where("rentals.rental_company_organization_id", "=", rentalCompanyOrganizationId)
      .selectAll("transport_records");
    if (query.status) q = q.where("transport_records.status", "=", query.status);
    if (query.leg) q = q.where("transport_records.leg", "=", query.leg);
    if (query.rentalId) q = q.where("transport_records.rental_id", "=", query.rentalId);
    if (query.from) q = q.where("transport_records.planned_date", ">=", query.from);
    if (query.to) q = q.where("transport_records.planned_date", "<=", query.to);
    if (query.q) {
      const pattern = containsPattern(query.q);
      const idPrefix = refIdPrefix(query.q, "RN");
      q = q.where((eb) =>
        eb.or([
          eb("machines.asset_code", "ilike", pattern),
          ...(idPrefix ? [eb(sql<string>`rentals.id::text`, "like", idPrefix)] : []),
        ]),
      );
    }
    return executePage(q, "transport_records.created_at", "transport_records.id", query, toTransportRecord);
  }

  async update(id: string, updates: UpdateTransportInput) {
    const row = await this.db
      .updateTable("transport_records")
      .set({
        ...(updates.pickupLocation !== undefined && { pickup_location: updates.pickupLocation }),
        ...(updates.destination !== undefined && { destination: updates.destination }),
        ...(updates.plannedDate !== undefined && { planned_date: updates.plannedDate }),
        ...(updates.actualDate !== undefined && { actual_date: updates.actualDate }),
        ...(updates.status !== undefined && { status: updates.status }),
        ...(updates.transportDetails !== undefined && {
          transport_details: updates.transportDetails,
        }),
        ...(updates.charges !== undefined && { charges: updates.charges }),
        ...(updates.notes !== undefined && { notes: updates.notes }),
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .returning(TRANSPORT_COLUMNS)
      .executeTakeFirstOrThrow();
    return toTransportRecord(row);
  }
}
