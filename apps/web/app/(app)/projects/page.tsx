"use client";

import { ProjectStatus, type Project } from "@fleetip/contracts/project";
import {
  Button,
  CellStack,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FormBanner,
  Menu,
  PageBody,
  PageHeader,
  Pagination,
  Select,
  Table,
  TableFooter,
  TableSkeleton,
  TableToolbar,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  UILink,
  type MenuItem,
} from "@fleetip/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ForbiddenPage } from "../../../components/PageStates";
import { apiClient } from "../../../lib/api-client";
import { useConnection } from "../../../lib/connection";
import { describeError, OFFLINE_HINT } from "../../../lib/errors";
import { useAction } from "../../../lib/form";
import { formatDateRange, plural } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { Status, statusLabel, statusOptions } from "../../../lib/status";
import { useLoad } from "../../../lib/use-load";
import { SearchField, compareText, directed, pageSlice, PAGE_SIZE, useListState, useSticky } from "../requirements/list-kit";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { acceptsRequirements, projectRegion, projectSearchText } from "./shared";

/** The two final states an active project can move to. */
type ClosingStatus = Exclude<ProjectStatus, typeof ProjectStatus.active>;

export default function ProjectsPage() {
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const canManage = hasPermission("project.manage");

  if (currentMembership && !canManage) {
    return <ForbiddenPage what="projects" permissionHint="Viewing and creating projects needs the Projects permission." />;
  }
  return <ProjectsList organizationId={organizationId ?? null} />;
}

function ProjectsList({ organizationId }: { organizationId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { online } = useConnection();
  const list = useListState("projects", { sort: "start", dir: "desc" });
  const { get, set, search, activeQuery, sortKey, dir, page, setPage, toggleSort, sortDirection } = list;

  const { data, error, loading, reload, setData } = useLoad(
    async () => (await apiClient.listProjects(organizationId!)) as Project[],
    [organizationId],
    Boolean(organizationId),
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [transition, setTransition] = useState<{ project: Project; to: ClosingStatus } | null>(null);
  const transitionTarget = useSticky(transition);

  // ?create=1 (from "Post requirement" when no active project exists) opens
  // the form. Keyed on the param, then stripped so the same link works twice.
  const createParam = searchParams.get("create");
  useEffect(() => {
    if (createParam !== "1") return;
    setCreateOpen(true);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("create");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // searchParams is read once per param change on purpose
  }, [createParam]);

  const status = get("status");
  const projects = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const rows = projects.filter((project) => {
      if (status && project.status !== status) return false;
      if (activeQuery && !projectSearchText(project).includes(activeQuery)) return false;
      return true;
    });
    const compare =
      sortKey === "code"
        ? (a: Project, b: Project) => compareText(a.projectCode, b.projectCode)
        : sortKey === "name"
          ? (a: Project, b: Project) => compareText(a.projectName, b.projectName)
          : (a: Project, b: Project) => a.startDate.localeCompare(b.startDate);
    return [...rows].sort(directed(compare, dir));
  }, [projects, status, activeQuery, sortKey, dir]);

  const pageView = pageSlice(filtered, page);
  const filtersOn = Boolean(status || activeQuery);
  const offline = !online;

  function clearFilters() {
    search.setValue("");
    set({ status: null, q: null });
  }

  function rowMenu(project: Project): MenuItem[] {
    const active = project.status === ProjectStatus.active;
    const lockedHint = `This project is ${statusLabel("project", project.status)}. Only active projects change status.`;
    return [
      {
        key: "post",
        label: "Post a requirement",
        icon: "requirement",
        href: `/requirements?projectId=${project.id}&post=1`,
        disabled: !active || offline,
        hint: offline ? OFFLINE_HINT : active ? "Opens the form with this project selected." : "Only active projects take new requirements.",
      },
      {
        key: "complete",
        label: "Mark completed",
        icon: "check",
        separatorBefore: true,
        disabled: !active || offline,
        hint: offline ? OFFLINE_HINT : active ? "Work on site is done. New requirements can't be posted against it." : lockedHint,
        onSelect: () => setTransition({ project, to: ProjectStatus.completed }),
      },
      {
        key: "cancel",
        label: "Cancel project",
        icon: "close",
        danger: true,
        disabled: !active || offline,
        hint: offline ? OFFLINE_HINT : active ? "It isn't going ahead. Linked records are kept." : lockedHint,
        onSelect: () => setTransition({ project, to: ProjectStatus.cancelled }),
      },
    ];
  }

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title="Projects"
        description="One project per site. Requirements, quotations and rentals for that site are grouped under it."
        actions={
          <Button icon="plus" onClick={() => setCreateOpen(true)} disabled={offline || !organizationId} title={offline ? OFFLINE_HINT : undefined}>
            New project
          </Button>
        }
      />
      <PageBody>
        <section aria-label="Projects" className="min-w-0 overflow-hidden rounded-panel border border-border-strong bg-surface">
          <TableToolbar>
            <SearchField search={search} label="Search projects" placeholder="Code, name, type or site" />
            <Select
              size="sm"
              aria-label="Status"
              className="w-[170px] max-[760px]:w-full"
              placeholder="Any status"
              options={statusOptions("project")}
              value={status}
              onChange={(event) => set({ status: event.target.value || null })}
            />
            {filtersOn && (
              <Button variant="tertiary" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </TableToolbar>

          {error ? (
            <div className="p-4">
              <ErrorState
                title="Projects didn't load"
                message={describeError(error).body}
                action={
                  <Button variant="secondary" size="sm" icon="refresh" onClick={() => void reload()}>
                    Try again
                  </Button>
                }
              />
            </div>
          ) : !loading && projects.length === 0 ? (
            <EmptyState
              variant="page"
              icon="project"
              title="No projects yet"
              description="Create a project for each site. You'll pick it when you post a requirement, so its name and location don't have to be typed again."
              action={
                <Button variant="secondary" icon="plus" onClick={() => setCreateOpen(true)} disabled={offline}>
                  New project
                </Button>
              }
            />
          ) : !loading && filtered.length === 0 ? (
            <EmptyState
              title="No projects match these filters"
              description={[activeQuery && `Search “${get("q")}”`, status && statusLabel("project", status)].filter(Boolean).join(" · ")}
              action={
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <Table bare minWidth={860} caption="Projects">
              <Thead>
                <Tr>
                  <Th className="w-[150px]" onSort={() => toggleSort("code")} sortDirection={sortDirection("code")}>
                    Code
                  </Th>
                  <Th onSort={() => toggleSort("name")} sortDirection={sortDirection("name")}>
                    Project
                  </Th>
                  <Th>Site</Th>
                  <Th className="w-[200px]" onSort={() => toggleSort("start")} sortDirection={sortDirection("start")}>
                    Dates
                  </Th>
                  <Th className="w-[120px]">Status</Th>
                  <Th className="w-[190px]">
                    <span className="sr-only">Actions</span>
                  </Th>
                </Tr>
              </Thead>
              {loading ? (
                <TableSkeleton columns={6} rows={8} label="Loading projects" />
              ) : (
                <Tbody>
                  {pageView.rows.map((project) => (
                    <Tr key={project.id}>
                      <Td className="whitespace-nowrap font-mono text-xs font-medium text-ink">{project.projectCode}</Td>
                      <Td>
                        <CellStack title={project.projectName} sub={project.projectType} />
                      </Td>
                      <Td>
                        <CellStack title={project.siteLocation} sub={projectRegion(project) ?? "District and state not recorded"} />
                      </Td>
                      <Td className="whitespace-nowrap font-mono text-xs">
                        {formatDateRange(project.startDate, project.endDate, "no end date")}
                      </Td>
                      <Td>
                        <Status domain="project" value={project.status} size="sm" />
                      </Td>
                      <Td>
                        <div className="flex items-center justify-end gap-2">
                          <UILink
                            href={`/requirements?projectId=${project.id}`}
                            className="whitespace-nowrap text-xs font-medium text-accent-text no-underline hover:text-accent-text-hover hover:underline"
                          >
                            View requirements
                          </UILink>
                          <Menu label={`More actions for ${project.projectCode}`} items={rowMenu(project)} triggerSize="sm" width={300} />
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              )}
            </Table>
          )}

          {!error && !loading && filtered.length > 0 && (
            <TableFooter>
              <span className="text-xs text-meta">
                {plural(projects.filter((p) => acceptsRequirements(p)).length, "active project")} taking requirements
              </span>
              <Pagination page={pageView.page} pageCount={pageView.pageCount} onPageChange={setPage} total={pageView.total} pageSize={PAGE_SIZE} noun="projects" />
            </TableFooter>
          )}
        </section>
      </PageBody>

      {organizationId && (
        <CreateProjectDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          organizationId={organizationId}
          onCreated={(project) => setData((previous) => [project, ...(previous ?? [])])}
        />
      )}
      {organizationId && transitionTarget && (
        <ProjectStatusDialog
          key={`${transitionTarget.project.id}-${transitionTarget.to}`}
          open={transition !== null}
          organizationId={organizationId}
          project={transitionTarget.project}
          to={transitionTarget.to}
          onClose={() => setTransition(null)}
          onChanged={(updated) => setData((previous) => (previous ?? []).map((p) => (p.id === updated.id ? updated : p)))}
        />
      )}
    </div>
  );
}

/**
 * active → completed | cancelled. Both are final (project-status.ts has no
 * way back) and nothing cascades: ProjectService.updateProjectStatus only
 * writes the status, and RequirementService.createRequirement refuses a
 * project that isn't active.
 */
function ProjectStatusDialog({
  open,
  organizationId,
  project,
  to,
  onClose,
  onChanged,
}: {
  open: boolean;
  organizationId: string;
  project: Project;
  to: ClosingStatus;
  onClose: () => void;
  onChanged: (project: Project) => void;
}) {
  const action = useAction();
  const completing = to === ProjectStatus.completed;

  async function confirm() {
    await action.run(() => apiClient.updateProjectStatus(organizationId, project.id, to) as Promise<Project>, {
      failTitle: "The project wasn't changed",
      success: () => ({
        title: `${project.projectCode} ${completing ? "marked Completed" : "cancelled"}`,
        body: "New requirements can't be posted against it. Linked requirements, quotations and rentals are unchanged.",
      }),
      onDone: (updated) => {
        onChanged(updated);
        onClose();
      },
    });
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={confirm}
      icon={completing ? "check" : "close"}
      tone={completing ? "success" : "danger"}
      title={completing ? `Mark ${project.projectCode} completed?` : `Cancel project ${project.projectCode}?`}
      description={`${project.projectName} · ${project.siteLocation}`}
      consequences={[
        `Its status changes from Active to ${completing ? "Completed" : "Cancelled"}. This is final — a project can't be made active again.`,
        "New requirements can't be posted against it.",
        "Requirements, quotations, rentals and work orders already linked to it aren't changed. Close or cancel open requirements separately.",
      ]}
      cancelLabel={completing ? "Not yet" : "Keep project"}
      confirmLabel={completing ? "Mark completed" : "Cancel project"}
      busyLabel="Saving…"
      confirmVariant={completing ? "primary" : "danger"}
      busy={action.busy}
    >
      {action.banner && (
        <FormBanner tone="error" title="Nothing was changed">
          {action.banner.body}
        </FormBanner>
      )}
    </ConfirmDialog>
  );
}
