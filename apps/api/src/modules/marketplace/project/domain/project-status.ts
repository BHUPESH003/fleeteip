import type { ProjectStatus } from "@fleetip/contracts/project";

const VALID_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
