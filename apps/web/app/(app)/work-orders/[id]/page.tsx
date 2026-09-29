"use client";

import type { Product } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
import { OrganizationTypeCode, type Organization } from "@fleetip/contracts/organization";
import { RentalStatus, type Rental } from "@fleetip/contracts/rental";
import { WorkOrderStatus, type WorkOrder, type WorkOrderScopeItem } from "@fleetip/contracts/work-order";
import {
  Alert,
  AttentionList,
  Button,
  ConfirmDialog,
  DescriptionList,
  EmptyState,
  ErrorState,
  FormBanner,
  Icon,
  Menu,
  PageBody,
  PageHeader,
  Panel,
  Skeleton,
  Table,
  TableSkeleton,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  UILink,
  type AttentionListItem,
  type MenuItem,
} from "@fleetip/ui";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ForbiddenPage, PageLoadError } from "../../../../components/PageStates";
import { apiClient } from "../../../../lib/api-client";
import { useConnection } from "../../../../lib/connection";
import { OFFLINE_HINT, describeError } from "../../../../lib/errors";
import { useAction } from "../../../../lib/form";
import { formatDate, formatDateTime, formatMoney, formatNumber, formatRateUnit, humanize, plural, rentalRef } from "../../../../lib/format";
import { useListBackHref } from "../../../../lib/list-state";
import { useSession } from "../../../../lib/session-context";
import { Status, statusLabel } from "../../../../lib/status";
import { optional, useLoad } from "../../../../lib/use-load";
import { productName } from "../../machines/shared";
import { TEXT_LINK } from "../../maintenance/list-kit";
import { RESPONSIBLE_WORD, accommodationScopeText, fuelScopeText, periodText, workOrderMismatch } from "../shared";

interface WorkOrderData {
  workOrder: WorkOrder;
  /** null when the role can't read the rental. */
  rental: Rental | null;
  machine: Machine | null;
  product: Product | null;
  customerName: string | null;
}

async function loadWorkOrder(
  orgId: string,
  id: string,
  access: { rental: boolean; machines: boolean; customers: boolean },
): Promise<WorkOrderData> {
  const workOrder = (await apiClient.getWorkOrder(orgId, id)) as WorkOrder;
  // Everything else is enrichment: a role without it still gets the full order.
  const [rental, machines, products, renters] = await Promise.all([
    optional(access.rental, () => apiClient.getRental(orgId, workOrder.rentalId) as Promise<Rental>, null as Rental | null),
    optional(access.machines, () => apiClient.listMachines(orgId) as Promise<Machine[]>, [] as Machine[]),
    optional(access.machines, () => apiClient.listProducts() as Promise<Product[]>, [] as Product[]),
    optional(access.customers, () => apiClient.listRenterOrganizations(orgId) as Promise<Organization[]>, [] as Organization[]),
  ]);
  const machine = machines.find((m) => m.id === workOrder.machineId) ?? null;
  return {
    workOrder,
    rental,
    machine,
    product: machine ? (products.find((p) => p.id === machine.productId) ?? null) : null,
    customerName:
      workOrder.clientSnapshot?.name ??
      (workOrder.renterOrganizationId ? (renters.find((o) => o.id === workOrder.renterOrganizationId)?.name ?? null) : null),
  };
}

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const isRenter = currentMembership?.organization.organizationTypeCode === OrganizationTypeCode.renter;
  // getWorkOrder serves both parties: rental.manage (Rental Company) or
  // rental.respond (the Renter it was issued to).
  const canView = isRenter ? hasPermission("rental.respond") : hasPermission("rental.manage");
  const access = {
    rental: canView,
    machines: !isRenter && hasPermission("equipment.manage"),
    customers: !isRenter && hasPermission("quotation.manage"),
  };

  const { data, error, loading, reload } = useLoad(
    () => loadWorkOrder(organizationId!, id, access),
    [organizationId, id, access.rental, access.machines, access.customers],
    Boolean(organizationId) && canView,
  );

  if (currentMembership && !canView) {
    return (
      <ForbiddenPage
        what="work orders"
        permissionHint={isRenter ? "Seeing the work orders issued to you needs the Rentals permission." : "Work orders need the Rentals permission."}
      />
    );
  }
  if (error) {
    return (
      <PageLoadError
        error={error}
        onRetry={() => void reload()}
        notFound={{
          title: "We can't find this work order",
          body: "It may belong to another organization, or the link is wrong. Work orders are never deleted — a cancelled one would still open.",
        }}
        forbidden={{ what: "work orders", permissionHint: "Work orders need the Rentals permission." }}
        serverTitle="This work order didn't load"
        backHref="/work-orders"
        backLabel="Back to work orders"
      />
    );
  }
  if (loading || !data || !organizationId) return <WorkOrderSkeleton />;

  // Keyed by id so confirmations and the scope-items section reset per work order.
  return (
    <WorkOrderView
      key={id}
      data={data}
      organizationId={organizationId}
      reload={reload}
      // The issuing Rental Company is the party that can complete or cancel it.
      canManage={data.workOrder.rentalCompanyOrganizationId === organizationId && hasPermission("rental.manage")}
      isRenter={isRenter}
      canOpenQuotation={hasPermission("quotation.manage") || hasPermission("quotation.respond")}
      canOpenRental={canView}
      canOpenMachine={access.machines}
      canOpenProject={isRenter && hasPermission("project.manage")}
    />
  );
}

function WorkOrderView({
  data,
  organizationId,
  reload,
  canManage,
  isRenter,
  canOpenQuotation,
  canOpenRental,
  canOpenMachine,
  canOpenProject,
}: {
  data: WorkOrderData;
  organizationId: string;
  reload: () => Promise<void>;
  canManage: boolean;
  isRenter: boolean;
  canOpenQuotation: boolean;
  canOpenRental: boolean;
  canOpenMachine: boolean;
  canOpenProject: boolean;
}) {
  const { online } = useConnection();
  const backHref = useListBackHref("work-orders", "/work-orders");
  const [confirm, setConfirm] = useState<typeof WorkOrderStatus.completed | typeof WorkOrderStatus.cancelled | null>(null);
  const action = useAction();
  const { clear } = action;

  const { workOrder: wo, rental } = data;
  const ref = wo.referenceNumber;
  const rentalLabel = rentalRef(wo.rentalId);
  const assetCode = wo.machineAssetCode ?? data.machine?.assetCode ?? null;
  const product = wo.productName ?? productName(data.product);
  const counterpart = isRenter ? (rental?.rentalCompanyOrganizationName ?? null) : data.customerName;
  const mismatch = workOrderMismatch(wo, rental);
  const issued = wo.status === WorkOrderStatus.issued;
  const printUrl = apiClient.workOrderPrintUrl(organizationId, wo.id);

  const scope = useLoad(
    () => apiClient.listWorkOrderScopeItems(organizationId, wo.id) as Promise<WorkOrderScopeItem[]>,
    [organizationId, wo.id],
  );

  useEffect(() => {
    // clear only calls a state setter, so any render's copy will do.
    if (confirm) clear();
  }, [confirm]);

  function transition(status: typeof WorkOrderStatus.completed | typeof WorkOrderStatus.cancelled) {
    void action.run(() => apiClient.updateWorkOrderStatus(organizationId, wo.id, status), {
      failTitle: status === WorkOrderStatus.completed ? "The work order wasn't completed" : "The work order wasn't cancelled",
      success: () => ({
        title: `${ref} ${status === WorkOrderStatus.completed ? "completed" : "cancelled"}`,
        body: `Status changed from Issued. ${rentalLabel} wasn't changed.`,
      }),
      onDone: () => {
        setConfirm(null);
        void reload();
      },
    });
  }

  const primary =
    canManage && issued ? (
      <Button icon="check" onClick={() => setConfirm(WorkOrderStatus.completed)} disabled={!online} title={online ? undefined : OFFLINE_HINT}>
        Mark completed
      </Button>
    ) : null;

  const menuItems: MenuItem[] = [
    ...(canOpenRental ? [{ key: "rental", label: `Open ${rentalLabel}`, icon: "rental" as const, href: `/rentals/${wo.rentalId}`, hint: "The rental that carries out this order." }] : []),
    ...(canOpenQuotation ? [{ key: "quotation", label: "Open the quotation", icon: "quotation" as const, href: `/quotations/${wo.quotationId}`, hint: "The awarded quotation these terms came from." }] : []),
    ...(canOpenMachine && data.machine ? [{ key: "machine", label: `Open ${data.machine.assetCode}`, icon: "machine" as const, href: `/machines/${data.machine.id}` }] : []),
    ...(canManage
      ? [
          {
            key: "cancel",
            label: "Cancel work order",
            icon: "close" as const,
            danger: true,
            separatorBefore: true,
            disabled: !issued || !online,
            hint: !online
              ? OFFLINE_HINT
              : issued
                ? "Kept on record as Cancelled. The rental isn't changed."
                : `It's ${statusLabel("work_order", wo.status)} — only an Issued work order can be cancelled.`,
            onSelect: () => setConfirm(WorkOrderStatus.cancelled),
          },
        ]
      : []),
  ];

  const attention: AttentionListItem[] = [];
  if (mismatch && rental) {
    attention.push({
      key: "mismatch",
      severity: "warning",
      title: `${rentalLabel} is ${statusLabel("rental", rental.status)}, but ${ref} is still Issued`,
      context: canManage
        ? "Work orders aren't completed automatically when a rental ends. Close it here so it doesn't read as a live order."
        : `Work orders aren't completed automatically when a rental ends. ${counterpart ?? "The rental company"} can close it.`,
      action:
        canManage && online
          ? rental.status === RentalStatus.completed
            ? { label: "Mark completed", onClick: () => setConfirm(WorkOrderStatus.completed) }
            : { label: "Cancel work order", onClick: () => setConfirm(WorkOrderStatus.cancelled) }
          : undefined,
    });
  }

  const money = (value: number | null) => (value != null ? formatMoney(value) : null);
  const client = wo.clientSnapshot;

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        breadcrumbs={[
          { label: "Work orders", href: backHref },
          { label: ref, mono: true },
        ]}
        title={ref}
        titleMono
        meta={<Status domain="work_order" value={wo.status} />}
        description={[rentalLabel, assetCode, counterpart].filter(Boolean).join(" · ")}
        actions={
          <>
            <a
              href={printUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-[34px] items-center gap-[7px] rounded-control border border-border-control bg-surface px-[13px] text-sm font-medium text-ink-strong no-underline hover:bg-surface-hover"
            >
              <Icon name="export" size={15} />
              Print / save PDF
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            {primary}
            {menuItems.length > 0 && <Menu label={`More actions for ${ref}`} items={menuItems} width={300} />}
          </>
        }
      />

      <PageBody>
        {isRenter && (
          <Alert tone="neutral" icon="lock">
            Issued by {counterpart ?? "the rental company"}. Only they can complete or cancel it — print it to keep a copy.
          </Alert>
        )}
        <AttentionList items={attention} note="Worked out when this page opened. FleetIP doesn't send reminders for these." />

        <Panel title="Order" subtitle="who and what" padding="none">
          <div className="px-4 py-3.5">
            <DescriptionList
              layout="grid"
              items={[
                {
                  label: "Quotation",
                  value: canOpenQuotation ? (
                    <UILink href={`/quotations/${wo.quotationId}`} className={TEXT_LINK}>
                      Open the awarded quotation
                    </UILink>
                  ) : (
                    "Awarded quotation"
                  ),
                },
                {
                  label: "Rental",
                  value: canOpenRental ? (
                    <UILink href={`/rentals/${wo.rentalId}`} className={TEXT_LINK}>
                      {rentalLabel}
                    </UILink>
                  ) : (
                    rentalLabel
                  ),
                  mono: true,
                },
                {
                  label: "Rental status",
                  value: rental ? <Status domain="rental" value={rental.status} size="sm" /> : null,
                  emptyText: "Needs the Rentals permission",
                },
                { label: isRenter ? "Rental company" : "Customer", value: counterpart },
                ...(client
                  ? [
                      {
                        label: "Customer contact",
                        value: [client.contactPerson, client.phone, client.email].filter(Boolean).join(" · ") || null,
                      },
                    ]
                  : []),
                {
                  label: "Project",
                  value:
                    wo.projectCode && wo.projectId && canOpenProject ? (
                      <UILink href={`/projects/${wo.projectId}`} className={TEXT_LINK}>
                        {wo.projectCode}
                      </UILink>
                    ) : (
                      wo.projectCode
                    ),
                  mono: Boolean(wo.projectCode),
                  emptyText: wo.projectId ? "Not specified" : "Direct deal — no project",
                },
                {
                  label: "Machine",
                  value:
                    data.machine && canOpenMachine ? (
                      <UILink href={`/machines/${data.machine.id}`} className={TEXT_LINK}>
                        {data.machine.assetCode}
                      </UILink>
                    ) : (
                      assetCode
                    ),
                  mono: true,
                },
                { label: "Product", value: product },
                { label: "Issued", value: formatDateTime(wo.createdAt), mono: true },
                { label: "Last updated", value: formatDateTime(wo.updatedAt), mono: true },
              ]}
            />
          </div>
        </Panel>

        <Panel title="Terms" subtitle="snapshotted when the quotation was awarded" padding="none">
          <div className="flex flex-col gap-2 px-4 py-3.5">
            {/* Contract order (workOrderSchema); nulls read "Not specified". */}
            <DescriptionList
              layout="grid"
              items={[
                { label: "Start date", value: formatDate(wo.startDate), mono: true },
                { label: "End date", value: wo.endDate ? formatDate(wo.endDate) : "Open-ended", mono: true },
                { label: "Rate", value: `${formatMoney(wo.rate)} ${formatRateUnit(wo.rateUnit)}`, mono: true },
                { label: "Mobilization charge", value: money(wo.mobilizationCharge), mono: true },
                { label: "Demobilization charge", value: money(wo.demobilizationCharge), mono: true },
                { label: "Overtime rate", value: wo.overtimeRate != null ? `${formatMoney(wo.overtimeRate)} per h` : null, mono: true },
                { label: "Payment terms", value: wo.paymentTerms },
                { label: "Shift structure", value: wo.shiftStructure },
                { label: "Sunday condition", value: wo.sundayCondition },
                { label: "Fuel norms", value: wo.fuelNorms },
                { label: "Fuel", value: fuelScopeText(wo.fuelScope) },
                { label: "Dehire terms", value: wo.dehireTerms },
                { label: "Operator", value: wo.operatorScope ? humanize(wo.operatorScope) : null },
                { label: "Accommodation", value: accommodationScopeText(wo.accommodationScope) },
                { label: "Working hours", value: wo.workingHours != null ? `${formatNumber(wo.workingHours)} h per shift` : null, mono: true },
                { label: "Working days", value: wo.workingDaysPerWeek != null ? `${plural(wo.workingDaysPerWeek, "day")} a week` : null, mono: true },
                { label: "Minimum rental period", value: periodText(wo.minimumRentalPeriodValue, wo.minimumRentalPeriodUnit), mono: true },
                { label: "GST terms", value: wo.gstTerms },
                { label: "Notice period", value: wo.noticePeriodDays != null ? plural(wo.noticePeriodDays, "day") : null, mono: true },
                { label: "Special / site conditions", value: wo.commercialNotes, wide: true },
                { label: "Company terms", value: wo.companyTerms, wide: true },
              ]}
            />
            <span className="flex items-start gap-1.5 text-[11px] leading-[1.45] text-meta">
              <Icon name="lock" size={12} className="mt-px text-meta-light" />
              These are the terms as awarded. Later changes to the quotation or the rental don&apos;t change the work order, and it
              isn&apos;t closed automatically when the rental ends.
            </span>
          </div>
        </Panel>

        <Panel title="Responsibilities" count={scope.data?.length} subtitle="category-specific scope agreed on the quotation" padding="none">
          {scope.error ? (
            <div className="p-4">
              <ErrorState
                title="Responsibilities didn't load"
                message={describeError(scope.error).body}
                action={
                  <Button variant="secondary" size="sm" onClick={() => void scope.reload()}>
                    Try again
                  </Button>
                }
              />
            </div>
          ) : scope.data && scope.data.length === 0 ? (
            <EmptyState title="No category-specific responsibilities" description="None were agreed on the quotation beyond the terms above." />
          ) : (
            <Table bare minWidth={560} caption={`Responsibilities on ${ref}`}>
              <Thead>
                <Tr>
                  <Th>Item</Th>
                  <Th className="w-[170px]">Responsible</Th>
                  <Th>Notes</Th>
                </Tr>
              </Thead>
              {!scope.data ? (
                <TableSkeleton columns={3} rows={3} label="Loading responsibilities" />
              ) : (
                <Tbody>
                  {scope.data.map((item) => (
                    <Tr key={item.id}>
                      <Td className="font-medium">{item.item}</Td>
                      <Td>{RESPONSIBLE_WORD[item.responsibleParty]}</Td>
                      <Td className="text-ink-muted">{item.notes ?? <span className="italic text-disabled-text">No notes</span>}</Td>
                    </Tr>
                  ))}
                </Tbody>
              )}
            </Table>
          )}
        </Panel>
      </PageBody>

      {canManage && (
        <ConfirmDialog
          open={confirm !== null}
          onClose={() => setConfirm(null)}
          onConfirm={() => (confirm ? transition(confirm) : undefined)}
          icon={confirm === WorkOrderStatus.cancelled ? "close" : "check"}
          tone={confirm === WorkOrderStatus.cancelled ? "danger" : "success"}
          confirmVariant={confirm === WorkOrderStatus.cancelled ? "danger" : "primary"}
          title={confirm === WorkOrderStatus.cancelled ? `Cancel work order ${ref}?` : `Mark ${ref} complete?`}
          description={[rentalLabel, assetCode, counterpart].filter(Boolean).join(" · ")}
          consequences={
            confirm === WorkOrderStatus.cancelled
              ? [
                  "It stays on record as Cancelled.",
                  `The rental isn't changed — cancel ${rentalLabel} separately if the job isn't going ahead.`,
                  "Cancelling is final — the work order can't be issued again.",
                ]
              : [
                  `Marks ${ref} complete. The rental isn't changed.`,
                  ...(rental ? [`${rentalLabel} stays ${statusLabel("rental", rental.status)}.`] : []),
                  "Completing is final — a completed work order can't be reopened or cancelled.",
                ]
          }
          cancelLabel={confirm === WorkOrderStatus.cancelled ? "Keep work order" : "Not yet"}
          confirmLabel={confirm === WorkOrderStatus.cancelled ? "Cancel work order" : "Mark completed"}
          busyLabel="Saving…"
          busy={action.busy}
        >
          {action.banner && <FormBanner title="Nothing was changed">{action.banner.body}</FormBanner>}
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Matches the page: header band, then the order, terms and responsibilities cards. */
function WorkOrderSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading work order" className="flex flex-col">
      <div className="flex flex-col gap-3.5 border-b border-border-header bg-surface px-6 pb-4 pt-3.5 max-[760px]:px-4">
        <Skeleton className="h-2.5 w-[180px]" />
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-1 flex-col gap-[9px]">
            <Skeleton className="h-5 w-[220px] max-w-[80%]" />
            <Skeleton className="h-3 w-[340px] max-w-[90%]" />
          </div>
          <Skeleton className="h-[34px] w-[260px] rounded-control" />
        </div>
      </div>
      <div className="flex flex-col gap-3.5 px-6 py-4 max-[760px]:px-4">
        <div className="h-[150px] rounded-panel border border-border-soft bg-surface" />
        <div className="h-[300px] rounded-panel border border-border-soft bg-surface" />
        <div className="h-[140px] rounded-panel border border-border-soft bg-surface" />
        <span role="status" className="text-xs text-meta">
          Loading work order…
        </span>
      </div>
    </div>
  );
}
