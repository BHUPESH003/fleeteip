"use client";

import type { Machine } from "@fleetip/contracts/equipment";
import type { Logsheet } from "@fleetip/contracts/logsheet";
import { OrganizationTypeCode, type Organization } from "@fleetip/contracts/organization";
import { RentalStatus, type Rental } from "@fleetip/contracts/rental";
import {
  Alert,
  AttentionList,
  Button,
  DescriptionList,
  EmptyState,
  Icon,
  KeyFigures,
  Menu,
  PageBody,
  PageHeader,
  Panel,
  Skeleton,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  UILink,
  type AttentionListItem,
  type Breadcrumb,
  type KeyFigure,
  type MenuItem,
} from "@fleetip/ui";
import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ForbiddenPage, PageLoadError } from "../../../../components/PageStates";
import { ApiError, apiClient } from "../../../../lib/api-client";
import { useConnection } from "../../../../lib/connection";
import { OFFLINE_HINT } from "../../../../lib/errors";
import {
  formatDate,
  formatDateRange,
  formatDateTime,
  formatHours,
  formatMoney,
  formatNumber,
  rentalRef,
} from "../../../../lib/format";
import { useListBackHref } from "../../../../lib/list-state";
import { useSession } from "../../../../lib/session-context";
import { Status, statusLabel } from "../../../../lib/status";
import { optional, useLoad } from "../../../../lib/use-load";
import { DetailColumns, TEXT_LINK } from "../../../../components/list-kit";
import { LogsheetDrawer } from "../../rentals/LogsheetDrawer";
import { confirmation, fuelText, totalHours } from "../shared";

interface SheetData {
  sheet: Logsheet;
  /** The rental's logsheets, when they could be listed (the drawer needs them). */
  rentalSheets: Logsheet[] | null;
  /** null when the role can't read the rental. */
  rental: Rental | null;
  machine: Machine | null;
  customerName: string | null;
}

async function loadSheet(
  orgId: string,
  id: string,
  rentalIdParam: string | null,
  access: { rental: boolean; machines: boolean; customers: boolean },
): Promise<SheetData> {
  let sheet: Logsheet | undefined;
  let rentalSheets: Logsheet[] | null = null;
  if (rentalIdParam) {
    rentalSheets = (await apiClient.listLogsheetsForRental(orgId, rentalIdParam)) as Logsheet[];
    sheet = rentalSheets.find((l) => l.id === id);
  }
  if (!sheet) {
    // A notification/dashboard link only carries the logsheet's own id —
    // getLogsheetById resolves it (and its rentalId) for either side.
    sheet = (await apiClient.getLogsheetById(orgId, id)) as Logsheet;
    if (!sheet) throw new ApiError("Logsheet not found", 404, "not_found");
    const found = sheet;
    rentalSheets = await optional(true, () => apiClient.listLogsheetsForRental(orgId, found.rentalId) as Promise<Logsheet[]>, null as Logsheet[] | null);
  }
  const rentalId = sheet.rentalId;
  const [rental, machines, renters] = await Promise.all([
    optional(access.rental, () => apiClient.getRental(orgId, rentalId) as Promise<Rental>, null as Rental | null),
    optional(access.machines, () => apiClient.listMachines(orgId) as Promise<Machine[]>, [] as Machine[]),
    optional(access.customers, () => apiClient.listRenterOrganizations(orgId) as Promise<Organization[]>, [] as Organization[]),
  ]);
  const found = sheet;
  return {
    sheet: found,
    rentalSheets,
    rental,
    machine: machines.find((m) => m.id === found.machineId) ?? null,
    customerName: rental
      ? (rental.clientSnapshot?.name ??
        (rental.renterOrganizationId ? (renters.find((o) => o.id === rental.renterOrganizationId)?.name ?? "FleetIP customer") : null))
      : null,
  };
}

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function LogsheetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const rentalIdParam = searchParams.get("rentalId");
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  const isRenter = organizationType === OrganizationTypeCode.renter;
  // rental_company uses logsheet.manage, renter uses logsheet.respond — same
  // organization-type branch as the service's listByRental/getLogsheetById.
  // A flat hasPermission("logsheet.manage") here used to lock every Renter
  // out of this page unconditionally.
  const canView = isRenter ? hasPermission("logsheet.respond") : hasPermission("logsheet.manage");
  // The rental is enrichment for this logsheet's header, not the point of
  // this page (logsheet.manage/.respond is) — a custom role without the
  // rental permission still gets a working page.
  const canGetRental = isRenter ? hasPermission("rental.respond") : hasPermission("rental.manage");
  const access = {
    rental: canGetRental,
    machines: !isRenter && hasPermission("equipment.manage"),
    customers: !isRenter && hasPermission("quotation.manage"),
  };

  const { data, error, loading, reload } = useLoad(
    () => loadSheet(organizationId!, id, rentalIdParam, access),
    [organizationId, id, rentalIdParam, access.rental, access.machines, access.customers],
    Boolean(organizationId) && canView,
  );

  if (currentMembership && !canView) {
    return (
      <ForbiddenPage
        what="logsheets"
        permissionHint={isRenter ? "Seeing logsheets on your rentals needs the Logsheets permission." : "Logsheets need the Logsheets permission."}
      />
    );
  }
  if (error) {
    return (
      <PageLoadError
        error={error}
        onRetry={() => void reload()}
        notFound={{
          title: "We can't find this logsheet",
          body: "It may be for a rental in another organization, or the link is wrong. Logsheets aren't deleted — a corrected one keeps its place.",
        }}
        forbidden={{ what: "logsheets", permissionHint: "Logsheets need the Logsheets permission." }}
        serverTitle="This logsheet didn't load"
        backHref={isRenter ? "/rentals" : "/logsheets"}
        backLabel={isRenter ? "Back to rentals" : "Back to logsheets"}
      />
    );
  }
  if (loading || !data || !organizationId) return <SheetSkeleton />;

  // Keyed by id so the drawer and local state reset when another logsheet opens.
  return (
    <SheetView
      key={id}
      data={data}
      organizationId={organizationId}
      reload={reload}
      isRenter={isRenter}
      canManage={!isRenter && hasPermission("logsheet.manage")}
      canOpenRental={canGetRental}
      canOpenMachine={access.machines}
    />
  );
}

function SheetView({
  data,
  organizationId,
  reload,
  isRenter,
  canManage,
  canOpenRental,
  canOpenMachine,
}: {
  data: SheetData;
  organizationId: string;
  reload: () => Promise<void>;
  isRenter: boolean;
  canManage: boolean;
  canOpenRental: boolean;
  canOpenMachine: boolean;
}) {
  const { online } = useConnection();
  const backHref = useListBackHref("logsheets", "/logsheets");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { sheet, rental } = data;
  const ref = rentalRef(sheet.rentalId);
  const day = WEEKDAY[new Date(`${sheet.logDate}T00:00:00Z`).getUTCDay()] ?? "";
  const assetCode = data.machine?.assetCode ?? rental?.machineAssetCode ?? null;
  const counterpart = isRenter ? (rental?.rentalCompanyOrganizationName ?? null) : data.customerName;
  const fuel = fuelText(sheet);
  const total = totalHours(sheet);
  // The API takes logsheets only while the rental is Active (and the date inside it, not in the future).
  const correctReason = !canManage
    ? null
    : !rental
      ? "Needs the Rentals permission to load the rental."
      : rental.status !== RentalStatus.active
        ? `${ref} is ${statusLabel("rental", rental.status)}, so its logsheets can't be changed${rental.status === RentalStatus.confirmed ? " until it starts" : ""}.`
        : !online
          ? OFFLINE_HINT
          : null;
  const canCorrect = canManage && rental?.status === RentalStatus.active;

  const primary =
    canCorrect && rental ? (
      <Button icon="edit" onClick={() => setDrawerOpen(true)} disabled={!online} title={online ? undefined : OFFLINE_HINT}>
        Correct logsheet
      </Button>
    ) : null;

  const allSheetsHref = isRenter ? `/rentals/${sheet.rentalId}?tab=logsheets` : `/logsheets?rental=${sheet.rentalId}`;
  const menuItems: MenuItem[] = [
    ...(canManage && !canCorrect
      ? [{ key: "correct", label: "Correct logsheet", icon: "edit" as const, disabled: true, hint: correctReason ?? undefined }]
      : []),
    ...(canOpenRental ? [{ key: "rental", label: `Open ${ref}`, icon: "rental" as const, href: `/rentals/${sheet.rentalId}`, hint: "Terms, transport and invoices." }] : []),
    ...(canOpenRental || !isRenter
      ? [{ key: "all", label: `All logsheets for ${ref}`, icon: "logsheet" as const, href: allSheetsHref, hint: "Every day of the rental, gaps included." }]
      : []),
    ...(data.machine && canOpenMachine
      ? [{ key: "machine", label: `Open ${data.machine.assetCode}`, icon: "machine" as const, href: `/machines/${data.machine.id}` }]
      : []),
  ];

  const attention: AttentionListItem[] = [];
  if (!sheet.customerConfirmed && canManage) {
    attention.push({
      key: "unconfirmed",
      severity: "warning",
      title: "The customer hasn't confirmed these hours",
      context:
        "Unconfirmed days are the ones most likely to be disputed when the invoice goes out. Tick “Customer has confirmed these hours” once the site engineer signs the sheet.",
      action: canCorrect && online ? { label: "Correct logsheet", onClick: () => setDrawerOpen(true) } : undefined,
    });
  }

  const hourFigure = (key: string, label: string, value: number | null, context: string): KeyFigure =>
    value == null
      ? { key, label, value: "—", context: "Not recorded", tone: "muted" }
      : { key, label, value: formatNumber(value), unit: "h", context };
  const figures: KeyFigure[] = [
    hourFigure("operating", "Operating", sheet.operatingHours, "Machine working"),
    hourFigure("idle", "Idle", sheet.idleHours, "Engine on, not working"),
    hourFigure(
      "overtime",
      "Overtime",
      sheet.overtimeHours,
      rental?.overtimeRate != null ? `Billed at ${formatMoney(rental.overtimeRate)} per h on ${ref}` : "Beyond the shift",
    ),
    { key: "total", label: "Logged in total", value: formatNumber(total), unit: "h", context: "Operating + idle + overtime" },
  ];

  const otherDays = (data.rentalSheets ?? []).filter((l) => l.id !== sheet.id).sort((a, b) => b.logDate.localeCompare(a.logDate)).slice(0, 6);

  const crumbs: Breadcrumb[] = isRenter
    ? canOpenRental
      ? [
          { label: "Rentals", href: "/rentals" },
          { label: ref, href: `/rentals/${sheet.rentalId}?tab=logsheets`, mono: true },
          { label: formatDate(sheet.logDate), mono: true },
        ]
      : [{ label: "Dashboard", href: "/" }, { label: `${formatDate(sheet.logDate)} · ${ref}`, mono: true }]
    : [
        { label: "Logsheets", href: backHref },
        { label: `${formatDate(sheet.logDate)} · ${ref}`, mono: true },
      ];

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        breadcrumbs={crumbs}
        title={
          <>
            Logsheet <span className="font-mono">{formatDate(sheet.logDate)}</span>
          </>
        }
        meta={<Status domain="logsheet" value={confirmation(sheet)} />}
        description={[`${day}`, ref, assetCode, counterpart, sheet.shift].filter(Boolean).join(" · ")}
        actions={
          primary || menuItems.length ? (
            <>
              {primary}
              {menuItems.length > 0 && <Menu label={`More actions for the ${formatDate(sheet.logDate)} logsheet`} items={menuItems} width={300} />}
            </>
          ) : undefined
        }
      />

      <PageBody>
        {isRenter && (
          <Alert tone="neutral" icon="lock">
            Logged by {rental?.rentalCompanyOrganizationName ?? "the rental company"}. If these hours are wrong, tell them — only they can
            correct a logsheet.
          </Alert>
        )}
        <AttentionList items={attention} note="Worked out when this page opened. FleetIP doesn't send reminders for these." />
        <KeyFigures items={figures} label="Hours on this day" />

        <DetailColumns
          asideLabel="Rental"
          main={
            <Panel title="Logsheet" subtitle="as submitted" padding="none">
              <div className="flex flex-col gap-3 px-4 py-3.5">
                <DescriptionList
                  layout="grid"
                  items={[
                    { label: "Date", value: `${day} ${formatDate(sheet.logDate)}`, mono: true },
                    { label: "Shift", value: sheet.shift },
                    { label: "Operating hours", value: sheet.operatingHours != null ? formatHours(sheet.operatingHours) : null, mono: true },
                    { label: "Idle hours", value: sheet.idleHours != null ? formatHours(sheet.idleHours) : null, mono: true },
                    { label: "Overtime hours", value: sheet.overtimeHours != null ? formatHours(sheet.overtimeHours) : null, mono: true },
                    { label: "Operator", value: sheet.operatorName },
                    { label: "Fuel used", value: fuel, mono: true, emptyText: "Not recorded" },
                    {
                      label: "Customer confirmed",
                      value: sheet.customerConfirmed ? "Yes — marked as confirmed by the customer's site" : "No — not marked as confirmed yet",
                    },
                    { label: "Remarks", value: sheet.remarks, wide: true, emptyText: "No remarks" },
                    { label: "Submitted", value: formatDateTime(sheet.createdAt), mono: true },
                    { label: "Last corrected", value: sheet.updatedAt !== sheet.createdAt ? formatDateTime(sheet.updatedAt) : null, mono: true, emptyText: "Never" },
                  ]}
                />
                <span className="flex items-start gap-1.5 text-[11px] leading-[1.45] text-meta">
                  <Icon name="info" size={12} className="mt-px text-meta-light" />
                  “Customer confirmed” is ticked by the rental company when the site signs the sheet — the customer doesn&apos;t confirm
                  in FleetIP. FleetIP doesn&apos;t record who submitted or corrected a logsheet.
                </span>
              </div>
            </Panel>
          }
          aside={
            <>
              <Panel title="Rental" padding="none">
                <div className="px-4 py-3">
                  {rental ? (
                    <DescriptionList
                      layout="rows"
                      items={[
                        {
                          label: "Rental",
                          value: canOpenRental ? (
                            <UILink href={`/rentals/${rental.id}`} className={TEXT_LINK}>
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
                        { label: "Rental dates", value: formatDateRange(rental.startDate, rental.endDate), mono: true },
                        { label: "Shift structure", value: rental.shiftStructure },
                        { label: "Overtime rate", value: rental.overtimeRate != null ? `${formatMoney(rental.overtimeRate)} per h` : null, mono: true },
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

              <Panel
                title={`Other days on ${ref}`}
                padding="none"
                actions={
                  canOpenRental || !isRenter ? (
                    <UILink href={allSheetsHref} className={`text-xs ${TEXT_LINK}`}>
                      All logsheets
                    </UILink>
                  ) : undefined
                }
              >
                {data.rentalSheets === null ? (
                  <p className="m-0 px-4 py-3 text-xs text-ink-soft">The rental&apos;s other logsheets couldn&apos;t be listed.</p>
                ) : otherDays.length === 0 ? (
                  <EmptyState title="No other days logged" description={`This is the only logsheet on ${ref} so far.`} />
                ) : (
                  <Table bare minWidth={320} caption={`Other logsheets on ${ref}`}>
                    <Thead>
                      <Tr>
                        <Th>Date</Th>
                        <Th align="right" className="w-[90px]">
                          Operating
                        </Th>
                        <Th className="w-[140px]">Customer</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {otherDays.map((other) => (
                        <Tr key={other.id}>
                          <Td>
                            <UILink href={`/logsheets/${other.id}?rentalId=${other.rentalId}`} className={`whitespace-nowrap font-mono text-xs ${TEXT_LINK}`}>
                              {formatDate(other.logDate)}
                            </UILink>
                          </Td>
                          <Td align="right" className="font-mono text-xs">
                            {formatHours(other.operatingHours)}
                          </Td>
                          <Td>
                            <Status domain="logsheet" value={confirmation(other)} size="sm" />
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                )}
              </Panel>
            </>
          }
        />
      </PageBody>

      {canCorrect && rental && (
        <LogsheetDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          organizationId={organizationId}
          rental={rental}
          logsheets={data.rentalSheets ?? [sheet]}
          initialDate={sheet.logDate}
          onSaved={() => void reload()}
        />
      )}
    </div>
  );
}

/** Matches the page: header band, the hours strip, then the logsheet and rental cards. */
function SheetSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading logsheet" className="flex flex-col">
      <div className="flex flex-col gap-3.5 border-b border-border-header bg-surface px-6 pb-4 pt-3.5 max-[760px]:px-4">
        <Skeleton className="h-2.5 w-[220px]" />
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-1 flex-col gap-[9px]">
            <Skeleton className="h-5 w-[260px] max-w-[80%]" />
            <Skeleton className="h-3 w-[340px] max-w-[90%]" />
          </div>
          <Skeleton className="h-[34px] w-[150px] rounded-control" />
        </div>
      </div>
      <div className="flex flex-col gap-3.5 px-6 py-4 max-[760px]:px-4">
        <div className="h-[78px] rounded-panel border border-border-soft bg-surface" />
        <div className="flex flex-wrap items-start gap-3.5">
          <div className="h-[300px] min-w-0 flex-[1_1_560px] rounded-panel border border-border-soft bg-surface" />
          <div className="h-[260px] min-w-0 flex-[1_1_300px] rounded-panel border border-border-soft bg-surface min-[1180px]:max-w-[380px]" />
        </div>
        <span role="status" className="text-xs text-meta">
          Loading logsheet…
        </span>
      </div>
    </div>
  );
}
