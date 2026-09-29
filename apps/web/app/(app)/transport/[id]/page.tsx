"use client";

import type { Machine } from "@fleetip/contracts/equipment";
import type { Organization } from "@fleetip/contracts/organization";
import { RentalStatus, type Rental } from "@fleetip/contracts/rental";
import { TransportLeg, TransportStatus, type TransportRecord } from "@fleetip/contracts/transport";
import {
  Alert,
  AttentionList,
  Button,
  DescriptionList,
  Menu,
  PageBody,
  PageHeader,
  Panel,
  Skeleton,
  UILink,
  type AttentionListItem,
  type Breadcrumb,
  type MenuItem,
} from "@fleetip/ui";
import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ForbiddenPage, PageLoadError } from "../../../../components/PageStates";
import { ApiError, apiClient } from "../../../../lib/api-client";
import { useConnection } from "../../../../lib/connection";
import { OFFLINE_HINT } from "../../../../lib/errors";
import { useAction } from "../../../../lib/form";
import {
  daysBetween,
  formatDate,
  formatDateRange,
  formatDateTime,
  formatMoney,
  plural,
  rentalRef,
  todayIsoDate,
} from "../../../../lib/format";
import { useListBackHref } from "../../../../lib/list-state";
import { useSession } from "../../../../lib/session-context";
import { Status } from "../../../../lib/status";
import { optional, useLoad } from "../../../../lib/use-load";
import { DetailColumns, TEXT_LINK } from "../../../../components/list-kit";
import {
  CancelTransportDialog,
  DeliverTransportDialog,
  LEG_LABEL,
  LEG_PURPOSE,
  TransportPlanDialog,
} from "../TransportDialogs";

interface TripData {
  record: TransportRecord;
  rentalId: string;
  /** null when the role can't read the rental (custom role without the rental permission). */
  rental: Rental | null;
  /** Both legs of the rental, when they could be listed. */
  legs: TransportRecord[] | null;
  machine: Machine | null;
  customerName: string | null;
  today: string;
}

async function loadTrip(
  orgId: string,
  id: string,
  rentalIdParam: string | null,
  access: { rental: boolean; machines: boolean; customers: boolean },
): Promise<TripData> {
  let record: TransportRecord | undefined;
  let legs: TransportRecord[] | null = null;
  if (rentalIdParam) {
    // Linked from Transport, a rental's Transport tab or Machine detail.
    legs = (await apiClient.listTransportForRental(orgId, rentalIdParam)) as TransportRecord[];
    record = legs.find((r) => r.id === id);
  }
  if (!record) {
    // A notification/dashboard link only carries the transport record's own
    // id — getTransportRecordById resolves it (and its rentalId) for either
    // organization type.
    record = (await apiClient.getTransportRecordById(orgId, id)) as TransportRecord;
    if (!record) throw new ApiError("Transport record not found", 404, "not_found");
    const found = record;
    legs = await optional(true, () => apiClient.listTransportForRental(orgId, found.rentalId) as Promise<TransportRecord[]>, null as TransportRecord[] | null);
  }
  const rentalId = record.rentalId;
  const [rental, machines, renters] = await Promise.all([
    optional(access.rental, () => apiClient.getRental(orgId, rentalId) as Promise<Rental>, null as Rental | null),
    optional(access.machines, () => apiClient.listMachines(orgId) as Promise<Machine[]>, [] as Machine[]),
    optional(access.customers, () => apiClient.listRenterOrganizations(orgId) as Promise<Organization[]>, [] as Organization[]),
  ]);
  const customerName = rental
    ? (rental.clientSnapshot?.name ??
      (rental.renterOrganizationId ? (renters.find((o) => o.id === rental.renterOrganizationId)?.name ?? "FleetIP customer") : null))
    : null;
  return {
    record,
    rentalId,
    rental,
    legs,
    machine: rental ? (machines.find((m) => m.id === rental.machineId) ?? null) : null,
    customerName,
    today: todayIsoDate(),
  };
}

export default function TransportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const rentalIdParam = searchParams.get("rentalId");
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  const isRenter = organizationType === "renter";
  // rental_company uses transport.manage, renter uses transport.respond —
  // same organization-type branch as the service's listByRental/
  // getTransportById. A flat hasPermission("transport.manage") here used to
  // lock every Renter out of this page unconditionally.
  const canView = isRenter ? hasPermission("transport.respond") : hasPermission("transport.manage");
  // Rental detail here is enrichment (machine code, client name) — ancillary
  // to transport.manage/.respond, gated by a different permission a custom
  // role may lack even while it has transport access.
  const canGetRental = isRenter ? hasPermission("rental.respond") : hasPermission("rental.manage");
  const access = {
    rental: canGetRental,
    // A Renter gets the machine's asset code on the rental itself.
    machines: !isRenter && hasPermission("equipment.manage"),
    customers: !isRenter && hasPermission("quotation.manage"),
  };

  const { data, error, loading, reload } = useLoad(
    () => loadTrip(organizationId!, id, rentalIdParam, access),
    [organizationId, id, rentalIdParam, access.rental, access.machines, access.customers],
    Boolean(organizationId) && canView,
  );

  if (currentMembership && !canView) {
    return (
      <ForbiddenPage
        what="transport"
        permissionHint={isRenter ? "Seeing trips for your rentals needs the Transport permission." : "Transport records need the Transport permission."}
      />
    );
  }
  if (error) {
    return (
      <PageLoadError
        error={error}
        onRetry={() => void reload()}
        notFound={{
          title: "We can't find this trip",
          body: "It may be for a rental in another organization, or the link is wrong. Trips are never deleted — a cancelled one would still open.",
        }}
        forbidden={{ what: "transport", permissionHint: "Trips need the Transport permission." }}
        serverTitle="This trip didn't load"
        backHref={isRenter ? "/rentals" : "/transport"}
        backLabel={isRenter ? "Back to rentals" : "Back to transport"}
      />
    );
  }
  if (loading || !data || !organizationId) return <TripSkeleton />;

  // Keyed by id: dialogs reset when another trip opens ([id] changes don't remount).
  return (
    <TripView
      key={id}
      data={data}
      organizationId={organizationId}
      reload={reload}
      canManage={!isRenter && hasPermission("transport.manage")}
      isRenter={isRenter}
      canOpenRental={canGetRental}
      canOpenMachine={access.machines}
    />
  );
}

function TripView({
  data,
  organizationId,
  reload,
  canManage,
  isRenter,
  canOpenRental,
  canOpenMachine,
}: {
  data: TripData;
  organizationId: string;
  reload: () => Promise<void>;
  canManage: boolean;
  isRenter: boolean;
  canOpenRental: boolean;
  canOpenMachine: boolean;
}) {
  const { online } = useConnection();
  const backHref = useListBackHref("transport", "/transport");
  const [dialog, setDialog] = useState<"edit" | "deliver" | "cancel" | "plan-other" | null>(null);
  const dispatchAction = useAction();

  const { record, rental, rentalId, today } = data;
  const ref = rentalRef(rentalId);
  const legLabel = LEG_LABEL[record.leg];
  const otherLeg: TransportLeg = record.leg === TransportLeg.mobilization ? TransportLeg.demobilization : TransportLeg.mobilization;
  const other = data.legs?.find((r) => r.leg === otherLeg) ?? null;
  const open = record.status === TransportStatus.planned || record.status === TransportStatus.dispatched;
  const rentalClosed = rental ? rental.status === RentalStatus.completed || rental.status === RentalStatus.cancelled : false;
  const assetCode = data.machine?.assetCode ?? rental?.machineAssetCode ?? null;
  const counterpart = isRenter ? rental?.rentalCompanyOrganizationName : data.customerName;
  const late = record.plannedDate && record.actualDate ? daysBetween(record.plannedDate, record.actualDate) : null;
  const writeHint = online ? null : OFFLINE_HINT;

  // Mark dispatched — no confirmation, like TransportPanel. A header button, so failures are a toast.
  const dispatch = () =>
    dispatchAction.run(() => apiClient.updateTransport(organizationId, record.rentalId, record.leg, { status: TransportStatus.dispatched }), {
      failTitle: `${legLabel} wasn't updated`,
      report: "toast",
      success: () => ({ title: `${legLabel} dispatched`, body: `${ref} · status changed from Planned.` }),
      onDone: () => void reload(),
    });

  const primary =
    canManage && record.status === TransportStatus.planned ? (
      <Button icon="transport" onClick={() => void dispatch()} busy={dispatchAction.busy} busyLabel="Saving…" disabled={!online} title={writeHint ?? undefined}>
        Mark dispatched
      </Button>
    ) : canManage && record.status === TransportStatus.dispatched ? (
      <Button icon="check" onClick={() => setDialog("deliver")} disabled={!online} title={writeHint ?? undefined}>
        Mark delivered
      </Button>
    ) : null;

  const menuItems: MenuItem[] = canManage
    ? [
        {
          key: "edit",
          label: "Edit plan",
          icon: "edit",
          disabled: !open || !online,
          hint: !online
            ? OFFLINE_HINT
            : open
              ? "Route, planned date, vehicle, charges."
              : record.status === TransportStatus.delivered
                ? "Delivered trips are kept as recorded."
                : "Cancelled trips can't be changed.",
          onSelect: () => setDialog("edit"),
        },
        ...(canOpenRental
          ? [
              { key: "rental", label: `Open ${ref}`, icon: "rental" as const, href: `/rentals/${rentalId}?tab=transport`, hint: "Terms, logsheets and invoices." },
              {
                key: "all",
                label: `Both legs of ${ref}`,
                icon: "transport" as const,
                href: `/transport?rental=${rentalId}`,
                hint: "Plan, dispatch or deliver either leg.",
              },
            ]
          : []),
        {
          key: "cancel",
          label: `Cancel ${record.leg}`,
          icon: "close",
          danger: true,
          separatorBefore: true,
          disabled: !open || !online,
          hint: !online
            ? OFFLINE_HINT
            : open
              ? "Final — this leg can't be planned again on this rental."
              : "Only planned or dispatched trips can be cancelled.",
          onSelect: () => setDialog("cancel"),
        },
      ]
    : [];

  const attention: AttentionListItem[] = [];
  if (record.status === TransportStatus.dispatched && record.plannedDate && record.plannedDate < today) {
    attention.push({
      key: "not-delivered",
      severity: "warning",
      title: `Dispatched but not delivered — it was planned for ${formatDate(record.plannedDate)}`,
      context: `${plural(daysBetween(record.plannedDate, today), "day")} past the planned date. Mark it delivered once the machine arrives; the date can't be later than today.`,
      action: canManage && online ? { label: "Mark delivered", onClick: () => setDialog("deliver") } : undefined,
    });
  }
  if (record.status === TransportStatus.planned && record.plannedDate && record.plannedDate < today) {
    attention.push({
      key: "not-dispatched",
      severity: "warning",
      title: `Still planned — it was due to leave on ${formatDate(record.plannedDate)}`,
      context: "Mark it dispatched when it leaves, or edit the plan if the date moved.",
      action: canManage && online ? { label: "Mark dispatched", onClick: () => void dispatch() } : undefined,
    });
  }

  const crumbs: Breadcrumb[] = isRenter
    ? canOpenRental
      ? [
          { label: "Rentals", href: "/rentals" },
          { label: ref, href: `/rentals/${rentalId}?tab=transport`, mono: true },
          { label: legLabel },
        ]
      : [{ label: "Dashboard", href: "/" }, { label: `${legLabel} · ${ref}` }]
    : [
        { label: "Transport", href: backHref },
        { label: `${legLabel} · ${ref}` },
      ];

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        breadcrumbs={crumbs}
        title={
          <>
            {legLabel} <span className="font-mono text-[20px] font-medium text-ink-muted">· {ref}</span>
          </>
        }
        meta={<Status domain="transport" value={record.status} />}
        description={[LEG_PURPOSE[record.leg], [assetCode, counterpart].filter(Boolean).join(" · ")].filter(Boolean).join(" ")}
        actions={
          canManage ? (
            <>
              {primary}
              <Menu label={`More actions for ${record.leg} of ${ref}`} items={menuItems} width={300} />
            </>
          ) : undefined
        }
      />

      <PageBody>
        {isRenter && (
          <Alert tone="neutral" icon="lock">
            Read-only. {rental?.rentalCompanyOrganizationName ?? "The rental company"} plans and updates the trips for this rental.
          </Alert>
        )}
        {record.status === TransportStatus.cancelled && (
          <Alert tone="neutral" icon="close">
            This {record.leg} was cancelled. FleetIP keeps one record per leg, so it can&apos;t be planned again on {ref}.
          </Alert>
        )}

        <AttentionList items={attention} note="Worked out when this page opened. FleetIP doesn't send reminders for these." />

        <DetailColumns
          asideLabel="Rental"
          main={
            <>
              <Panel title="Trip" subtitle="as recorded" padding="none">
                <div className="px-4 py-3.5">
                  <DescriptionList
                    layout="grid"
                    items={[
                      { label: "From", value: record.pickupLocation },
                      { label: "To", value: record.destination },
                      { label: "Planned date", value: record.plannedDate ? formatDate(record.plannedDate) : null, mono: true },
                      {
                        label: "Actual date",
                        value: record.actualDate
                          ? `${formatDate(record.actualDate)}${late ? ` · ${plural(Math.abs(late), "day")} ${late > 0 ? "late" : "early"}` : late === 0 ? " · on plan" : ""}`
                          : null,
                        mono: true,
                        emptyText: record.status === TransportStatus.cancelled ? "Never delivered" : "Not delivered yet",
                      },
                      { label: "Charges", value: record.charges != null ? formatMoney(record.charges) : null, mono: true },
                      { label: "Vehicle / details", value: record.transportDetails },
                      { label: "Notes", value: record.notes, wide: true },
                      { label: "Recorded", value: formatDateTime(record.createdAt), mono: true },
                      { label: "Last updated", value: formatDateTime(record.updatedAt), mono: true },
                    ]}
                  />
                </div>
              </Panel>

              {data.legs && (
                <Panel
                  title={`${LEG_LABEL[otherLeg]} — the other leg`}
                  padding="none"
                  actions={
                    other ? (
                      <UILink href={`/transport/${other.id}?rentalId=${rentalId}`} className={`text-xs ${TEXT_LINK}`}>
                        Open trip
                      </UILink>
                    ) : canManage && !rentalClosed ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon="plus"
                        onClick={() => setDialog("plan-other")}
                        disabled={!online}
                        title={writeHint ?? undefined}
                      >
                        Plan {otherLeg}
                      </Button>
                    ) : undefined
                  }
                >
                  <div className="px-4 py-3">
                    {other ? (
                      <div className="flex flex-col gap-2">
                        <Status domain="transport" value={other.status} size="sm" className="self-start" />
                        <DescriptionList
                          layout="grid"
                          minColumnWidth={160}
                          items={[
                            { label: "From", value: other.pickupLocation },
                            { label: "To", value: other.destination },
                            { label: "Planned", value: other.plannedDate ? formatDate(other.plannedDate) : null, mono: true },
                            { label: "Actual", value: other.actualDate ? formatDate(other.actualDate) : null, mono: true, emptyText: "Not delivered yet" },
                          ]}
                        />
                      </div>
                    ) : (
                      <p className="m-0 text-xs leading-[1.5] text-ink-soft">
                        {rentalClosed
                          ? `No ${otherLeg} was recorded, and ${ref} has ended.`
                          : `No ${otherLeg} is recorded for ${ref} yet.${
                              rental?.projectLocation
                                ? otherLeg === TransportLeg.demobilization
                                  ? ` Pickup would be ${rental.projectLocation}.`
                                  : ` Destination would be ${rental.projectLocation}.`
                                : ""
                            }`}
                      </p>
                    )}
                  </div>
                </Panel>
              )}
            </>
          }
          aside={
            <Panel title="Rental" padding="none">
              <div className="px-4 py-3">
                {rental ? (
                  <DescriptionList
                    layout="rows"
                    items={[
                      {
                        label: "Rental",
                        value: canOpenRental ? (
                          <UILink href={`/rentals/${rentalId}?tab=transport`} className={TEXT_LINK}>
                            {ref}
                          </UILink>
                        ) : (
                          ref
                        ),
                        mono: true,
                      },
                      { label: "Rental status", value: <Status domain="rental" value={rental.status} size="sm" /> },
                      { label: isRenter ? "Rental company" : "Customer", value: counterpart },
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
                      { label: "Project", value: rental.projectName },
                      { label: "Site", value: rental.projectLocation },
                      { label: "Rental dates", value: formatDateRange(rental.startDate, rental.endDate), mono: true },
                      {
                        label: record.leg === TransportLeg.mobilization ? "Mobilization charge on terms" : "Demobilization charge on terms",
                        value:
                          (record.leg === TransportLeg.mobilization ? rental.mobilizationCharge : rental.demobilizationCharge) != null
                            ? formatMoney((record.leg === TransportLeg.mobilization ? rental.mobilizationCharge : rental.demobilizationCharge) ?? 0)
                            : null,
                        mono: true,
                      },
                    ]}
                  />
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <span className="font-mono text-sm font-medium text-ink">{ref}</span>
                    <p className="m-0 text-xs leading-[1.5] text-ink-soft">
                      The rental&apos;s customer, machine and dates need the Rentals permission, so they aren&apos;t shown.
                    </p>
                  </div>
                )}
              </div>
            </Panel>
          }
        />
      </PageBody>

      {canManage && (
        <>
          <TransportPlanDialog
            open={dialog === "edit"}
            onClose={() => setDialog(null)}
            organizationId={organizationId}
            rentalId={rentalId}
            rental={rental}
            leg={record.leg}
            record={record}
            onSaved={() => void reload()}
          />
          <TransportPlanDialog
            open={dialog === "plan-other"}
            onClose={() => setDialog(null)}
            organizationId={organizationId}
            rentalId={rentalId}
            rental={rental}
            leg={otherLeg}
            record={null}
            onSaved={() => void reload()}
          />
          <DeliverTransportDialog
            open={dialog === "deliver"}
            onClose={() => setDialog(null)}
            organizationId={organizationId}
            record={record}
            rental={rental}
            onSaved={() => void reload()}
          />
          <CancelTransportDialog
            open={dialog === "cancel"}
            onClose={() => setDialog(null)}
            organizationId={organizationId}
            record={record}
            onSaved={() => void reload()}
          />
        </>
      )}
    </div>
  );
}

/** Matches the page: header band, the trip card and the rental aside. */
function TripSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading trip" className="flex flex-col">
      <div className="flex flex-col gap-3.5 border-b border-border-header bg-surface px-6 pb-4 pt-3.5 max-[760px]:px-4">
        <Skeleton className="h-2.5 w-[200px]" />
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-1 flex-col gap-[9px]">
            <Skeleton className="h-5 w-[300px] max-w-[80%]" />
            <Skeleton className="h-3 w-[380px] max-w-[90%]" />
          </div>
          <Skeleton className="h-[34px] w-[150px] rounded-control" />
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-3.5 px-6 py-4 max-[760px]:px-4">
        <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-3.5">
          <div className="h-[230px] rounded-panel border border-border-soft bg-surface" />
          <div className="h-[120px] rounded-panel border border-border-soft bg-surface" />
        </div>
        <div className="h-[300px] min-w-0 flex-[1_1_300px] rounded-panel border border-border-soft bg-surface min-[1180px]:max-w-[380px]" />
      </div>
      <span role="status" className="px-6 text-xs text-meta">
        Loading trip…
      </span>
    </div>
  );
}
