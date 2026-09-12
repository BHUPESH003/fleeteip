import type { Machine, MachineStatus } from "@fleetip/contracts/equipment";
import type { ProductSpecifications } from "@fleetip/contracts/catalogue";
import type { Rental } from "@fleetip/contracts/rental";
import type { StatusMap } from "@fleetip/ui";
import { humanizeKey } from "../../../lib/format";

export const MACHINE_STATUS_MAP: StatusMap = {
  active: { label: "Active", tone: "success" },
  under_maintenance: { label: "Under maintenance", tone: "warning" },
  retired: { label: "Retired", tone: "neutral" },
};

export const MAINTENANCE_STATUS_MAP: StatusMap = {
  scheduled: { label: "Scheduled", tone: "info" },
  in_progress: { label: "In progress", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export function legalNextMachineStatuses(current: MachineStatus): MachineStatus[] {
  if (current === "active") return ["under_maintenance", "retired"];
  if (current === "under_maintenance") return ["active", "retired"];
  return [];
}

export function legalNextMaintenanceStatuses(
  current: "scheduled" | "in_progress" | "completed" | "cancelled",
): ("in_progress" | "completed" | "cancelled")[] {
  if (current === "scheduled") return ["in_progress", "cancelled"];
  if (current === "in_progress") return ["completed", "cancelled"];
  return [];
}

/** A rental "occupies" a machine while it's active/confirmed. */
export function currentRentalFor(machineId: string, rentals: Rental[]): Rental | null {
  return (
    rentals.find(
      (r) => r.machineId === machineId && (r.status === "active" || r.status === "confirmed"),
    ) ?? null
  );
}

export function isAvailable(machine: Machine, rentals: Rental[]): boolean {
  return machine.status === "active" && !currentRentalFor(machine.id, rentals);
}

/**
 * Flattens whichever ProductSpecifications group is populated into plain
 * label/value rows — generic across every equipment category (boom pumps,
 * cranes, generators, ...) instead of hardcoding one category's fields.
 */
export function flattenSpecifications(
  specs: ProductSpecifications | null | undefined,
): { label: string; value: string }[] {
  if (!specs) return [];
  const rows: { label: string; value: string }[] = [];
  for (const group of Object.values(specs)) {
    if (!group || typeof group !== "object") continue;
    for (const [key, value] of Object.entries(group)) {
      if (value === undefined || value === null || value === "") continue;
      rows.push({ label: humanizeKey(key), value: String(value) });
    }
  }
  return rows;
}
