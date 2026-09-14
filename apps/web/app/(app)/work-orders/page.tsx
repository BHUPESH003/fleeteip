"use client";

import type { WorkOrder } from "@fleetip/contracts/work-order";
import {
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
import { WORK_ORDER_STATUS_MAP } from "./shared";

export default function WorkOrdersPage() {
  const { currentMembership } = useSession();
  const organizationId = currentMembership?.organizationId;
  const [workOrders, setWorkOrders] = useState<WorkOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    void (async () => {
      try {
        setWorkOrders((await apiClient.listWorkOrders(organizationId)) as WorkOrder[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load work orders");
      }
    })();
  }, [organizationId]);

  if (!organizationId) return <LoadingState label="Loading…" />;
  if (error) return <ErrorState message={error} />;
  if (!workOrders) return <LoadingState label="Loading work orders…" />;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Work Orders"
        description="The finalized commercial order for each awarded quotation — created automatically, never re-entered."
      />

      {workOrders.length === 0 ? (
        <EmptyState
          title="No work orders yet"
          description="A work order is created automatically the moment a quotation is awarded."
        />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Reference</Th>
              <Th>Rate</Th>
              <Th>Start date</Th>
              <Th>Status</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {workOrders.map((workOrder) => (
              <Tr key={workOrder.id}>
                <Td className="font-mono">{workOrder.referenceNumber}</Td>
                <Td className="font-mono">
                  {workOrder.rate} / {workOrder.rateUnit}
                </Td>
                <Td className="font-mono">{formatDate(workOrder.startDate)}</Td>
                <Td>
                  <StatusBadge status={workOrder.status} map={WORK_ORDER_STATUS_MAP} />
                </Td>
                <Td>
                  <Link
                    href={`/work-orders/${workOrder.id}`}
                    className="text-xs font-medium text-accent-text"
                  >
                    Open
                  </Link>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
