import type { ProjectStatus } from "@fleetip/contracts/project";
import type { StatusMap } from "@fleetip/ui";

export const PROJECT_STATUS_MAP: StatusMap = {
  active: { label: "Active", tone: "info" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export function projectStatus(status: ProjectStatus) {
  return PROJECT_STATUS_MAP[status];
}
