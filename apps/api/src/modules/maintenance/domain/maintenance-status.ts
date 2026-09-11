import type { MaintenanceStatus } from "@fleetip/contracts/maintenance";

const VALID_TRANSITIONS: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransition(from: MaintenanceStatus, to: MaintenanceStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
