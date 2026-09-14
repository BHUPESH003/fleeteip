"use client";

import type { WorkOrder, WorkOrderScopeItem, WorkOrderStatus } from "@fleetip/contracts/work-order";
import {
  Button,
  Card,
  ErrorState,
  LoadingState,
  PageHeader,
  Select,
  StatusBadge,
} from "@fleetip/ui";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiClient } from "../../../../lib/api-client";
import { formatCurrencyINR, formatDate } from "../../../../lib/format";
import { useSession } from "../../../../lib/session-context";
import { legalNextWorkOrderStatuses, WORK_ORDER_STATUS_MAP } from "../shared";

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentMembership } = useSession();
  const organizationId = currentMembership?.organizationId;
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [scopeItems, setScopeItems] = useState<WorkOrderScopeItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!organizationId || !id) return;
    try {
      const [wo, items] = await Promise.all([
        apiClient.getWorkOrder(organizationId, id) as Promise<WorkOrder>,
        apiClient.listWorkOrderScopeItems(organizationId, id) as Promise<WorkOrderScopeItem[]>,
      ]);
      setWorkOrder(wo);
      setScopeItems(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load work order");
    }
  }

  useEffect(() => {
    void load();
  }, [organizationId, id]);

  async function handleStatusChange(status: WorkOrderStatus) {
    if (!organizationId || !id) return;
    try {
      await apiClient.updateWorkOrderStatus(organizationId, id, status);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  if (error) return <ErrorState message={error} />;
  if (!workOrder) return <LoadingState label="Loading work order…" />;

  const isRentalCompany = workOrder.rentalCompanyOrganizationId === organizationId;
  const nextStatuses = legalNextWorkOrderStatuses(workOrder.status);

  const sections: { title: string; rows: [string, string | number | null][] }[] = [
    {
      title: "Equipment & schedule",
      rows: [
        ["Machine", workOrder.machineAssetCode],
        ["Product", workOrder.productName],
        ["Project", workOrder.projectCode],
        ["Start date", formatDate(workOrder.startDate)],
        ["End date", workOrder.endDate ? formatDate(workOrder.endDate) : "Open-ended"],
      ],
    },
    {
      title: "Commercial terms",
      rows: [
        ["Rate", `${workOrder.rate} / ${workOrder.rateUnit}`],
        [
          "Mobilization",
          workOrder.mobilizationCharge != null ? formatCurrencyINR(workOrder.mobilizationCharge) : "—",
        ],
        [
          "Demobilization",
          workOrder.demobilizationCharge != null
            ? formatCurrencyINR(workOrder.demobilizationCharge)
            : "—",
        ],
        ["Payment terms", workOrder.paymentTerms ?? "—"],
        [
          "Minimum rental period",
          workOrder.minimumRentalPeriodValue != null
            ? `${workOrder.minimumRentalPeriodValue} ${workOrder.minimumRentalPeriodUnit}(s)`
            : "—",
        ],
        ["GST terms", workOrder.gstTerms ?? "—"],
      ],
    },
    {
      title: "Working & responsibility terms",
      rows: [
        ["Operator scope", workOrder.operatorScope?.replace(/_/g, " ") ?? "—"],
        ["Fuel scope", workOrder.fuelScope ?? "—"],
        ["Accommodation scope", workOrder.accommodationScope ?? "—"],
        ["Shift structure", workOrder.shiftStructure ?? "—"],
        [
          "Working hours / days",
          workOrder.workingHours != null || workOrder.workingDaysPerWeek != null
            ? `${workOrder.workingHours ?? "—"} hrs/shift, ${workOrder.workingDaysPerWeek ?? "—"} days/week`
            : "—",
        ],
        ["Notice / de-hire period", workOrder.noticePeriodDays != null ? `${workOrder.noticePeriodDays} days` : "—"],
        ["De-hire terms", workOrder.dehireTerms ?? "—"],
      ],
    },
    {
      title: "Terms & conditions",
      rows: [
        ["Special / site conditions", workOrder.commercialNotes ?? "—"],
        ["Company-specific T&Cs", workOrder.companyTerms ?? "—"],
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumbs={[{ label: "Work Orders", href: "/work-orders" }, { label: workOrder.referenceNumber }]}
        title={`Work Order ${workOrder.referenceNumber}`}
        actions={
          organizationId && (
            <a
              href={apiClient.workOrderPrintUrl(organizationId, workOrder.id)}
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="secondary">Print / Download</Button>
            </a>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={workOrder.status} map={WORK_ORDER_STATUS_MAP} />
        {isRentalCompany && nextStatuses.length > 0 && (
          <Select
            value=""
            onChange={(event) => void handleStatusChange(event.target.value as WorkOrderStatus)}
            options={[
              { value: "", label: "Change status…" },
              ...nextStatuses.map((status) => ({ value: status, label: WORK_ORDER_STATUS_MAP[status]?.label ?? status })),
            ]}
          />
        )}
      </div>

      <div className="flex flex-col gap-3.5">
        {sections.map((section) => (
          <Card key={section.title}>
            <h2 className="mb-3 text-sm font-semibold text-ink">{section.title}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {section.rows.map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5 border-b border-border pb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-meta">{label}</span>
                  <span className="text-sm text-ink">{value ?? "—"}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}

        {scopeItems.length > 0 && (
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-ink">Category-specific responsibilities</h2>
            <ul className="flex flex-col gap-2">
              {scopeItems.map((item) => (
                <li key={item.id} className="border-b border-border pb-2 text-sm">
                  <span className="font-medium text-ink">{item.item}</span>
                  <span className="ml-2 text-meta">
                    — {item.responsibleParty === "client" ? "Client scope" : "Company scope"}
                  </span>
                  {item.notes && <p className="text-xs text-meta-light">{item.notes}</p>}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
