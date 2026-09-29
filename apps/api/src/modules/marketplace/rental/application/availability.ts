import type { AvailabilityConflict } from "@fleetip/contracts/rental";
import { AvailabilityConflictKind } from "@fleetip/contracts/rental";
import { ConflictError } from "../../../../shared/errors.js";
import type { MaintenanceRecord } from "../../../maintenance/domain/ports.js";
import type { RentalRecord } from "../domain/ports.js";

/** Same derived reference the web shows (lib/format.ts rentalRef); rentals have no stored number. */
export function rentalReference(id: string): string {
  return `RN-${id.slice(0, 8).toUpperCase()}`;
}

export function rentalConflict(record: RentalRecord): AvailabilityConflict {
  return {
    kind: AvailabilityConflictKind.rental,
    id: record.id,
    reference: rentalReference(record.id),
    startDate: record.start_date,
    endDate: record.end_date,
  };
}

// Workshop jobs have no number (plan §1: no MNT- references), so the job's start date names it.
export function maintenanceConflict(record: MaintenanceRecord): AvailabilityConflict {
  return {
    kind: AvailabilityConflictKind.maintenance,
    id: record.id,
    reference: `Workshop job ${record.start_date}`,
    startDate: record.start_date,
    endDate: record.end_date,
  };
}

/** Earliest first, rentals before jobs on the same day. */
export function sortConflicts(conflicts: AvailabilityConflict[]): AvailabilityConflict[] {
  return [...conflicts].sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      Number(b.kind === AvailabilityConflictKind.rental) - Number(a.kind === AvailabilityConflictKind.rental),
  );
}

function range(conflict: AvailabilityConflict): string {
  return conflict.endDate
    ? `from ${conflict.startDate} to ${conflict.endDate}`
    : `from ${conflict.startDate}, open-ended`;
}

/**
 * 409 naming the blocking record, in words the web shows as-is (the text
 * deliberately doesn't match lib/errors.ts's older generic patterns).
 */
export function availabilityConflictError(
  conflict: AvailabilityConflict,
  field?: string,
): ConflictError {
  const message =
    conflict.kind === AvailabilityConflictKind.rental
      ? `${conflict.reference} is booked on this machine ${range(conflict)}.`
      : `A workshop job is booked on this machine ${range(conflict)}.`;
  return new ConflictError(message, field, conflict);
}
