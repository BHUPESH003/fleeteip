import { MaintenanceStatus } from "@fleetip/contracts/maintenance";

const VALID_TRANSITIONS: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  scheduled: [MaintenanceStatus.in_progress, MaintenanceStatus.cancelled],
  in_progress: [MaintenanceStatus.completed, MaintenanceStatus.cancelled],
  completed: [],
  cancelled: [],
};

export function canTransition(from: MaintenanceStatus, to: MaintenanceStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
