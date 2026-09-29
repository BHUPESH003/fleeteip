import { WorkOrderStatus } from "@fleetip/contracts/work-order";

const VALID_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  issued: [WorkOrderStatus.completed, WorkOrderStatus.cancelled],
  completed: [],
  cancelled: [],
};

export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
