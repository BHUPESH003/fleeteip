import { ProjectStatus, type Project } from "@fleetip/contracts/project";

/** "Kharadi · Pune, Maharashtra" — district/state only when recorded. */
export function projectRegion(project: Pick<Project, "district" | "state">): string | null {
  const parts = [project.district, project.state].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** Only an active project can take new requirements (RequirementService.createRequirement). */
export function acceptsRequirements(project: Pick<Project, "status">): boolean {
  return project.status === ProjectStatus.active;
}

/** Search haystack for the projects list and the project picker. */
export function projectSearchText(project: Project): string {
  return [project.projectCode, project.projectName, project.projectType, project.siteLocation, project.district, project.state]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
