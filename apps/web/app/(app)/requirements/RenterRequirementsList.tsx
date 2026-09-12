"use client";

import type { Requirement } from "@fleetip/contracts/rfq";
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
import { PostRequirementDialog } from "./PostRequirementDialog";
import { REQUIREMENT_STATUS_MAP } from "./shared";

export function RenterRequirementsList({ organizationId }: { organizationId: string }) {
  const [requirements, setRequirements] = useState<Requirement[] | null>(null);
  const [responseCounts, setResponseCounts] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [postOpen, setPostOpen] = useState(false);

  async function load() {
    try {
      const list = (await apiClient.listRequirements(organizationId)) as Requirement[];
      const counts = await Promise.all(
        list.map(async (r) => {
          const responses = await apiClient.listResponsesForRequirement(organizationId, r.id);
          return [r.id, (responses as unknown[]).length] as const;
        }),
      );
      setRequirements(list);
      setResponseCounts(new Map(counts));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load requirements");
    }
  }

  useEffect(() => {
    void load();
  }, [organizationId]);

  if (error) return <ErrorState message={error} />;
  if (!requirements) return <LoadingState label="Loading requirements…" />;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Requirements"
        description="Post equipment requirements and compare Rental Company responses."
        actions={<Button onClick={() => setPostOpen(true)}>Post requirement</Button>}
      />

      {requirements.length === 0 ? (
        <EmptyState
          title="No requirements yet"
          description="Post one above to start receiving quotes."
          action={<Button onClick={() => setPostOpen(true)}>Post requirement</Button>}
        />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Project</Th>
              <Th>Start date</Th>
              <Th>Validity</Th>
              <Th>Responses</Th>
              <Th>Status</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {requirements.map((req) => (
              <Tr key={req.id}>
                <Td>{req.projectName ?? "—"}</Td>
                <Td className="font-mono">{formatDate(req.requestedStartDate)}</Td>
                <Td className="font-mono">{formatDate(req.validityDate)}</Td>
                <Td className="font-mono">{responseCounts.get(req.id) ?? 0}</Td>
                <Td>
                  <StatusBadge status={req.status} map={REQUIREMENT_STATUS_MAP} />
                </Td>
                <Td>
                  <Link href={`/requirements/${req.id}`} className="text-xs font-medium text-accent-text">
                    Open
                  </Link>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <PostRequirementDialog
        open={postOpen}
        onClose={() => setPostOpen(false)}
        organizationId={organizationId}
        onPosted={() => void load()}
      />
    </div>
  );
}
