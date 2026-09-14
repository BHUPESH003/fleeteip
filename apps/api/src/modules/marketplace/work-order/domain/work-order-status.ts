import type { WorkOrderStatus } from "@fleetip/contracts/work-order";

const VALID_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  issued: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
