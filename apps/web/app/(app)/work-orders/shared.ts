import { ResponsibleParty } from "@fleetip/contracts/quotation";
import { RentalStatus, type RateUnit, type Rental } from "@fleetip/contracts/rental";
import { WorkOrderStatus, type WorkOrder } from "@fleetip/contracts/work-order";

// Manual transition only — see UpdateWorkOrderStatusRequest's own comment
// (issued → completed | cancelled; never cascaded from the rental's status).
export function legalNextWorkOrderStatuses(current: WorkOrderStatus): WorkOrderStatus[] {
  if (current === WorkOrderStatus.issued) return [WorkOrderStatus.completed, WorkOrderStatus.cancelled];
  return [];
}

/** Who a responsibility sits with, in words. */
export const RESPONSIBLE_WORD: Record<ResponsibleParty, string> = {
  client: "Customer",
  company: "Rental company",
};

export function fuelScopeText(party: ResponsibleParty | null): string | null {
  if (!party) return null;
  return party === ResponsibleParty.client ? "Customer supplies the fuel" : "Rental company supplies the fuel";
}

export function accommodationScopeText(party: ResponsibleParty | null): string | null {
  if (!party) return null;
  return party === ResponsibleParty.client ? "Customer provides the crew's accommodation" : "Rental company provides the crew's accommodation";
}

const UNIT_WORD: Record<RateUnit, [string, string]> = {
  shift: ["shift", "shifts"],
  day: ["day", "days"],
  week: ["week", "weeks"],
  month: ["month", "months"],
};

/** Minimum rental period as value + unit: "3 months". */
export function periodText(value: number | null, unit: RateUnit | null): string | null {
  if (value == null) return null;
  if (!unit) return String(value);
  const [one, many] = UNIT_WORD[unit];
  return `${value.toLocaleString("en-IN")} ${value === 1 ? one : many}`;
}

/**
 * Work orders aren't cascaded from rental status (contract comment): one
 * still Issued on a rental that has ended is a mismatch worth flagging.
 */
export function workOrderMismatch(workOrder: WorkOrder, rental: Rental | null | undefined): boolean {
  return (
    workOrder.status === WorkOrderStatus.issued &&
    Boolean(rental) &&
    (rental?.status === RentalStatus.completed || rental?.status === RentalStatus.cancelled)
  );
}
