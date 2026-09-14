import type { WorkOrderStatus } from "@fleetip/contracts/work-order";
import type { StatusMap } from "@fleetip/ui";

export const WORK_ORDER_STATUS_MAP: StatusMap = {
  issued: { label: "Issued", tone: "info" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

// Manual transition only — see UpdateWorkOrderStatusRequest's own comment.
export function legalNextWorkOrderStatuses(current: WorkOrderStatus): WorkOrderStatus[] {
  if (current === "issued") return ["completed", "cancelled"];
  return [];
}
