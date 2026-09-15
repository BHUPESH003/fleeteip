"use client";

import type { Project } from "@fleetip/contracts/project";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@fleetip/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { formatDate } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { PROJECT_STATUS_MAP } from "./shared";

export default function ProjectsPage() {
  const { currentMembership } = useSession();
  const organizationId = currentMembership?.organizationId;
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    if (!organizationId) return;
    try {
      setProjects((await apiClient.listProjects(organizationId)) as Project[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    }
  }

  useEffect(() => {
    void load();
  }, [organizationId]);

  if (!organizationId) return <LoadingState label="Loading…" />;
  if (error) return <ErrorState message={error} />;
  if (!projects) return <LoadingState label="Loading projects…" />;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Projects"
        description="Group requirements, quotations, rentals, and billing under one site or engagement."
        actions={<Button onClick={() => setCreateOpen(true)}>New project</Button>}
      />

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create one to start posting requirements against it."
          action={<Button onClick={() => setCreateOpen(true)}>New project</Button>}
        />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Code</Th>
              <Th>Project</Th>
              <Th>Site location</Th>
              <Th>Start date</Th>
              <Th>Status</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {projects.map((project) => (
              <Tr key={project.id}>
                <Td className="font-mono">{project.projectCode}</Td>
                <Td>{project.projectName}</Td>
                <Td>{project.siteLocation}</Td>
                <Td className="font-mono">{formatDate(project.startDate)}</Td>
                <Td>
                  <StatusBadge status={project.status} map={PROJECT_STATUS_MAP} />
                </Td>
                <Td>
                  <Link
                    href={`/requirements?projectId=${project.id}`}
                    className="text-xs font-medium text-accent-text"
                  >
                    View requirements
                  </Link>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <CreateProjectDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        organizationId={organizationId}
        onCreated={() => void load()}
      />
    </div>
  );
}
