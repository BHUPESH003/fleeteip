import type { Logsheet } from "@fleetip/contracts/logsheet";
import { RentalStatus, type Rental } from "@fleetip/contracts/rental";
import { addDays, formatNumber } from "../../../lib/format";

export function confirmation(sheet: Logsheet): "confirmed" | "unconfirmed" {
  return sheet.customerConfirmed ? "confirmed" : "unconfirmed";
}

/** Fuel as stored: the figure plus its free-text unit ("96 L"), never converted. */
export function fuelText(sheet: Pick<Logsheet, "fuelConsumed" | "fuelUnit">): string | null {
  if (sheet.fuelConsumed == null) return null;
  return `${formatNumber(sheet.fuelConsumed)}${sheet.fuelUnit ? ` ${sheet.fuelUnit}` : ""}`;
}

export function totalHours(sheet: Pick<Logsheet, "operatingHours" | "idleHours" | "overtimeHours">): number {
  return (sheet.operatingHours ?? 0) + (sheet.idleHours ?? 0) + (sheet.overtimeHours ?? 0);
}

/**
 * Days a running rental should have a logsheet for but doesn't — from its
 * (actual) start to yesterday, capped at its end date, newest first. Same
 * window as LogsheetPanel: today is only logged once it's over.
 */
export function missingDays(rental: Rental, logsheets: Logsheet[], today: string): string[] {
  if (rental.status !== RentalStatus.active) return [];
  const from = rental.actualStartDate && rental.actualStartDate > rental.startDate ? rental.actualStartDate : rental.startDate;
  const yesterday = addDays(today, -1);
  const to = rental.endDate && rental.endDate < yesterday ? rental.endDate : yesterday;
  const logged = new Set(logsheets.filter((l) => l.rentalId === rental.id).map((l) => l.logDate));
  const out: string[] = [];
  for (let day = to; day >= from; day = addDays(day, -1)) {
    if (!logged.has(day)) out.push(day);
  }
  return out;
}
