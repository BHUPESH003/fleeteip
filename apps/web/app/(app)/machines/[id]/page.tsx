"use client";

import type { Product } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
import type { Logsheet, MachineUtilization } from "@fleetip/contracts/logsheet";
import type { MaintenanceRecord } from "@fleetip/contracts/maintenance";
import type { Organization } from "@fleetip/contracts/organization";
import type { Rental } from "@fleetip/contracts/rental";
import {
  AvailabilityLane,
  AvailabilityLaneLegend,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
  Table,
  Tabs,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@fleetip/ui";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiClient } from "../../../../lib/api-client";
import { formatCurrencyINR, formatDate, formatDateRange, formatShortDate, daysBetween, todayIsoDate } from "../../../../lib/format";
import { useSession } from "../../../../lib/session-context";
import { EditMachineDialog } from "../EditMachineDialog";
import { laneBlocksFor } from "../lane";
import { MaintenancePanel } from "../panels";
import {
  MACHINE_STATUS_MAP,
  currentRentalFor,
  flattenSpecifications,
  legalNextMachineStatuses,
} from "../shared";

interface Loaded {
  machine: Machine;
  product: Product | null;
  rentals: Rental[];
  maintenanceRecords: MaintenanceRecord[];
  utilization: MachineUtilization | null;
  logsheets: Logsheet[];
  renterNames: Map<string, string>;
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "rentals", label: "Rental history" },
  { key: "maintenance", label: "Maintenance" },
  { key: "logsheets", label: "Logsheets" },
  { key: "documents", label: "Documents", disabled: true },
  { key: "activity", label: "Activity" },
];

const LANE_WINDOW_MONTHS = 12;
const LANE_WINDOW_DAYS = 365;

export default function MachineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  const canManage = organizationType === "rental_company";
  // Utilization/logsheets, rental history, maintenance records, and renter
  // names are enrichment, not the point of this page (equipment.manage is)
  // — a role without the matching logsheet/rental/maintenance/quotation
  // permission still gets a fully working machine page, just with those
  // sections falling back to "no data" (already handled: utilization ?
  // ... : "No utilization data yet.", empty rentals/logsheets/maintenance
  // lists, renter name falling back to "Renter"/"—").
  const canViewLogsheets = canManage ? hasPermission("logsheet.manage") : hasPermission("logsheet.respond");
  const canListRentals = canManage ? hasPermission("rental.manage") : hasPermission("rental.respond");
  const canListRenterOrgs = hasPermission("quotation.manage");
  const canListMaintenance = hasPermission("maintenance.manage");

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(searchParams.get("tab") ?? "overview");
  const [editOpen, setEditOpen] = useState(false);

  // A notification/search hit for a *different* machine reaches this page
  // via router.push — same route, only the [id] segment differs — which the
  // App Router doesn't remount the page for either, so the useState
  // initializer above never re-runs and `tab` stays stuck on whatever it
  // was for the previous machine. Reset per `id`, reading tab fresh each
  // time (falls back to "overview" when the new link carries no tab param).
  useEffect(() => {
    setTab(searchParams.get("tab") ?? "overview");
  }, [id]);

  async function load(orgId: string) {
    const [machines, utilization, rentals, maintenanceRecords, renterOrgs] = await Promise.all([
      apiClient.listMachines(orgId) as Promise<Machine[]>,
      canViewLogsheets
        ? (apiClient.getMachineUtilization(orgId, id) as Promise<MachineUtilization>)
        : Promise.resolve(null),
      canListRentals ? (apiClient.listRentals(orgId) as Promise<Rental[]>) : Promise.resolve([]),
      canListMaintenance
        ? (apiClient.listMaintenanceForMachine(orgId, id) as Promise<MaintenanceRecord[]>)
        : Promise.resolve([]),
      canListRenterOrgs ? (apiClient.listRenterOrganizations(orgId) as Promise<Organization[]>) : Promise.resolve([]),
    ]);
    const machine = machines.find((m) => m.id === id) ?? null;
    if (!machine) {
      setError("Machine not found");
      return;
    }
    const products = (await apiClient.listProducts()) as Product[];
    const product = products.find((p) => p.id === machine.productId) ?? null;
    const rental = currentRentalFor(machine.id, rentals);
    const logsheets =
      rental && canViewLogsheets
        ? ((await apiClient.listLogsheetsForRental(orgId, rental.id)) as Logsheet[])
        : [];
    setData({
      machine,
      product,
      rentals,
      maintenanceRecords,
      utilization,
      logsheets,
      renterNames: new Map(renterOrgs.map((o) => [o.id, o.name])),
    });
  }

  useEffect(() => {
    if (!organizationId) return;
    void (async () => {
      try {
        await load(organizationId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load machine");
      }
    })();
  }, [organizationId, id, canViewLogsheets, canListRentals, canListMaintenance, canListRenterOrgs]);

  async function handleMarkStatus(status: Machine["status"]) {
    if (!organizationId) return;
    await apiClient.updateMachineStatus(organizationId, id, status);
    await load(organizationId);
  }

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Loading machine…" />;

  const { machine, product, rentals, maintenanceRecords, utilization, logsheets, renterNames } = data;
  const rental = currentRentalFor(machine.id, rentals);
  const rentalName = rental
    ? (rental.renterOrganizationId && renterNames.get(rental.renterOrganizationId)) ||
      rental.clientSnapshot?.name ||
      "Renter"
    : null;
  const specRows = flattenSpecifications(product?.specifications);
  const today = todayIsoDate();

  const machineRentals = rentals.filter((r) => r.machineId === machine.id).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const machineMaintenance = maintenanceRecords
    .filter((rec) => rec.machineId === machine.id)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  // 12-month lane window: 6 months back, 6 months ahead of today.
  const windowStart = (() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 6);
    return d.toISOString().slice(0, 10);
  })();
  const yearScale = Array.from({ length: LANE_WINDOW_MONTHS }, (_, i) => {
    const d = new Date(`${windowStart}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + i);
    return new Intl.DateTimeFormat("en-GB", { month: "short" }).format(d);
  });
  // laneBlocksFor only covers rentals occupying the machine now/ahead
  // (active/confirmed) plus open maintenance windows — past rentals need
  // their own `past`-kind blocks added here so the 12-month history
  // actually shows completed/cancelled rentals, matching the canvas.
  const yearLaneBlocks = [
    ...laneBlocksFor(machine.id, rentals, maintenanceRecords),
    ...machineRentals
      .filter((r) => r.status === "completed" || r.status === "cancelled")
      .map((r) => ({ from: r.startDate, to: r.endDate ?? r.startDate, kind: "past" as const })),
  ];

  const unbookedDays = (() => {
    // Whole 12-month window minus every occupying/maintenance day, floored at 0 — a real
    // derivation from the same block data drawn in the lane, not a separate estimate.
    const totalDays = LANE_WINDOW_DAYS;
    const occupied = yearLaneBlocks.reduce((sum, b) => {
      const to = b.to ?? today;
      return sum + Math.max(0, daysBetween(b.from, to));
    }, 0);
    return Math.max(0, totalDays - occupied);
  })();

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <PageHeader
        breadcrumbs={[{ label: "Machines", href: "/machines" }, { label: machine.assetCode }]}
        title={product ? `${product.manufacturer} ${product.name}` : machine.assetCode}
        actions={
          <div className="flex flex-wrap gap-2">
            {legalNextMachineStatuses(machine.status).map((next) => (
              <Button key={next} variant="secondary" onClick={() => void handleMarkStatus(next)}>
                Mark {MACHINE_STATUS_MAP[next]?.label ?? next}
              </Button>
            ))}
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              Edit details
            </Button>
            <Button disabled={Boolean(rental)} title={rental ? "Already on rent" : "Not built yet"}>
              Add to quotation
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <StatusBadge status={machine.status} map={MACHINE_STATUS_MAP} />
        {rental && (
          <span className="text-[11px] font-semibold uppercase tracking-wide text-on-rent">On rent</span>
        )}
        <span className="font-mono text-sm text-meta">{machine.assetCode}</span>
        <span className="text-meta-light">·</span>
        <span className="font-mono text-xs text-meta">{machine.registrationNumber}</span>
        {machine.chassisNumber && (
          <>
            <span className="text-meta-light">·</span>
            <span className="font-mono text-xs text-meta">Chassis {machine.chassisNumber}</span>
          </>
        )}
        {machine.yearOfManufacture && (
          <>
            <span className="text-meta-light">·</span>
            <span className="font-mono text-xs text-meta">YOM {machine.yearOfManufacture}</span>
          </>
        )}
      </div>

      <Tabs items={TABS} active={tab} onChange={setTab} />

      {tab === "overview" && (
        <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-2 overflow-hidden rounded-panel border border-border-strong bg-surface sm:grid-cols-3 lg:flex">
            <Metric
              label="Deployment"
              value={rental ? "On rent" : machine.status === "under_maintenance" ? "Maintenance" : machine.status === "retired" ? "Retired" : "Available"}
              sub={rental ? `RN-${rental.id.slice(0, 8).toUpperCase()} · ${rentalName ?? "—"}` : undefined}
              tone={rental ? "text-on-rent" : "text-ink"}
            />
            <Metric
              label="Frees on"
              value={rental ? (rental.endDate ? formatDate(rental.endDate) : "No end date") : "—"}
              sub={
                rental
                  ? `${daysBetween(rental.startDate, today)} of ${
                      rental.endDate ? daysBetween(rental.startDate, rental.endDate) : "∞"
                    } days elapsed`
                  : undefined
              }
            />
            <Metric
              label="Earning"
              value={rental ? formatCurrencyINR(rental.rate) : "—"}
              sub={rental ? `per ${rental.rateUnit}, since ${formatDate(rental.startDate)}` : undefined}
            />
            <Metric label="Logged days" value={String(utilization?.loggedDayCount ?? "—")} sub="logsheets on record" />
            <Metric
              label="Unbooked"
              value={`${unbookedDays} days`}
              sub="in the last twelve months"
              tone="text-attention"
            />
          </div>

          <Card>
            <div className="mb-2.5 flex flex-wrap items-baseline gap-2.5">
              <h2 className="text-sm font-semibold text-ink">Twelve-month record</h2>
              <span className="text-xs text-meta">
                Rentals and workshop blocks on one scale · {formatShortDate(windowStart)} → {formatShortDate(today)}
              </span>
            </div>
            <AvailabilityLane
              windowStart={windowStart}
              windowDays={LANE_WINDOW_DAYS}
              scale={yearScale}
              blocks={yearLaneBlocks}
              today={today}
              height={34}
            />
            <div className="mt-2.5 flex flex-wrap items-center gap-4">
              <AvailabilityLaneLegend items={[
                { label: "On rent", kind: "active" },
                { label: "Past rental", kind: "past" },
                { label: "Workshop", kind: "maintenance" },
              ]} />
              <span className="ml-auto text-xs text-meta">Gaps are unbooked days — {unbookedDays} across the year</span>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1fr)_352px]">
            <div className="flex flex-col gap-3.5">
              {rental && (
                <Card padding="none">
                  <div className="flex items-center gap-2.5 border-b border-border px-4.5 py-3.5">
                    <h2 className="text-sm font-semibold text-ink">Current rental</h2>
                    <span className="font-mono text-xs text-accent-text">RN-{rental.id.slice(0, 8).toUpperCase()}</span>
                    <StatusBadge status={rental.status} map={{ active: { label: "Active", tone: "info" }, confirmed: { label: "Confirmed", tone: "warning" } }} />
                    <a href={`/rentals/${rental.id}`} className="ml-auto text-xs font-medium text-accent-text">
                      Open rental
                    </a>
                  </div>
                  <div className="flex flex-col gap-3.5 p-4.5">
                    <div className="flex flex-wrap items-start gap-6">
                      <Field label="Customer" value={rentalName ?? "—"} sub={rental.clientSnapshot ? "Client snapshot · not a FleetIP organization" : undefined} />
                      <Field label="Project" value={rental.projectName ?? "—"} sub={rental.projectLocation ?? undefined} />
                      <Field label="Rate" value={formatCurrencyINR(rental.rate)} sub={`per ${rental.rateUnit}`} align="right" mono className="ml-auto" />
                    </div>
                    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-cell border border-border sm:grid-cols-4">
                      <TermCell label="Rate unit" value={rental.rateUnit} mono />
                      <TermCell label="Operator scope" value={rental.operatorScope?.replace("_", " ") ?? "—"} />
                      <TermCell label="Shift structure" value={rental.shiftStructure ?? "—"} />
                      <TermCell label="Overtime" value={rental.overtimeRate ? formatCurrencyINR(rental.overtimeRate) + " / hr" : "—"} mono />
                      <TermCell label="Mobilization" value={rental.mobilizationCharge ? formatCurrencyINR(rental.mobilizationCharge) : "—"} mono />
                      <TermCell label="Demobilization" value={rental.demobilizationCharge ? formatCurrencyINR(rental.demobilizationCharge) : "—"} mono />
                      <TermCell label="Fuel norms" value={rental.fuelNorms ?? "—"} />
                      <TermCell label="Notice period" value={rental.noticePeriodDays ? `${rental.noticePeriodDays} days` : "—"} mono />
                    </div>
                  </div>
                </Card>
              )}

              <Card padding="none">
                <div className="flex items-center gap-2.5 border-b border-border px-4.5 py-3.5">
                  <h2 className="text-sm font-semibold text-ink">Rental history</h2>
                  <span className="text-xs text-meta">
                    {machineRentals.length > 5 ? `Five most recent of ${machineRentals.length}` : `${machineRentals.length} total`}
                  </span>
                  <button type="button" className="ml-auto text-xs font-medium text-accent-text" onClick={() => setTab("rentals")}>
                    All rentals
                  </button>
                </div>
                {machineRentals.length === 0 ? (
                  <EmptyState title="No rental history" />
                ) : (
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>Rental</Th>
                        <Th>Customer &amp; project</Th>
                        <Th>Term</Th>
                        <Th>Status</Th>
                        <Th className="text-right">Rate</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {machineRentals.slice(0, 5).map((r) => (
                        <Tr key={r.id}>
                          <Td className="font-mono text-accent-text">RN-{r.id.slice(0, 8).toUpperCase()}</Td>
                          <Td>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-ink-strong">
                                {(r.renterOrganizationId && renterNames.get(r.renterOrganizationId)) || r.clientSnapshot?.name || "—"}
                              </span>
                              <span className="text-xs text-meta">{r.projectName ?? "—"}</span>
                            </div>
                          </Td>
                          <Td className="font-mono">{formatDateRange(r.startDate, r.endDate)}</Td>
                          <Td>
                            <StatusBadge
                              status={r.status}
                              map={{
                                confirmed: { label: "Confirmed", tone: "warning" },
                                active: { label: "Active", tone: "info" },
                                off_rent: { label: "Off rent", tone: "warning" },
                                completed: { label: "Completed", tone: "success" },
                                cancelled: { label: "Cancelled", tone: "neutral" },
                              }}
                            />
                          </Td>
                          <Td className="text-right font-mono font-semibold">{formatCurrencyINR(r.rate)}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                )}
              </Card>

              <Card padding="none">
                <div className="flex items-center gap-2.5 border-b border-border px-4.5 py-3.5">
                  <h2 className="text-sm font-semibold text-ink">Workshop record</h2>
                  <span className="text-xs text-meta">
                    {machineMaintenance.length > 3 ? `Three most recent of ${machineMaintenance.length}` : `${machineMaintenance.length} total`}
                  </span>
                  <button type="button" className="ml-auto text-xs font-medium text-accent-text" onClick={() => setTab("maintenance")}>
                    Log maintenance
                  </button>
                </div>
                {machineMaintenance.length === 0 ? (
                  <EmptyState
                    title="No maintenance logged"
                    description={canListMaintenance ? "Nothing scheduled yet." : "You don't have permission to view maintenance."}
                  />
                ) : (
                  <div className="flex flex-col">
                    {machineMaintenance.slice(0, 3).map((rec) => (
                      <div key={rec.id} className="grid grid-cols-[110px_140px_minmax(0,1fr)_120px] items-center gap-3 border-b border-border px-4.5 py-3 last:border-0">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-ink-strong capitalize">{rec.maintenanceType}</span>
                        <span className="font-mono text-xs text-ink-strong">{formatDateRange(rec.startDate, rec.endDate)}</span>
                        <span className="truncate text-sm text-ink-muted">{rec.notes ?? "—"}</span>
                        <span className="text-right text-xs font-medium text-available">{rec.status === "completed" ? "Completed" : rec.status.replace("_", " ")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <div className="flex flex-col gap-3.5">
              <Card padding="none">
                <div className="flex items-baseline gap-2 border-b border-border px-4 py-3.5">
                  <h2 className="text-sm font-semibold text-ink">Utilization</h2>
                  <span className="text-xs text-meta">from logsheets</span>
                </div>
                <div className="flex flex-col gap-3 p-4">
                  {utilization ? (
                    <>
                      <StatRow label="Operating hours" value={utilization.totalOperatingHours} />
                      <StatRow label="Idle hours" value={utilization.totalIdleHours} />
                      <StatRow label="Logged days" value={utilization.loggedDayCount} />
                      <div className="flex h-2 overflow-hidden rounded-xs bg-surface-rail-track">
                        <div
                          className="bg-on-rent"
                          style={{
                            width: `${Math.round(
                              (utilization.totalOperatingHours /
                                Math.max(1, utilization.totalOperatingHours + utilization.totalIdleHours)) *
                                100,
                            )}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs leading-normal text-meta">
                        Operating vs. idle hours as a share of logged hours. The contracts expose no total
                        rental days per machine, so no percentage of the year is claimed here.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-meta">No utilization data yet.</p>
                  )}
                </div>
              </Card>

              <Card padding="none">
                <div className="border-b border-border px-4 py-3.5 text-sm font-semibold text-ink">Specifications</div>
                {specRows.length === 0 ? (
                  <p className="p-4 text-sm text-meta">No specifications recorded for this product.</p>
                ) : (
                  <div className="flex flex-col gap-2 p-4">
                    {specRows.map((row) => (
                      <StatRow key={row.label} label={row.label} value={row.value} mono />
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      )}

      {tab === "rentals" && (
        <Card padding={machineRentals.length === 0 ? "md" : "none"}>
          {machineRentals.length === 0 ? (
            <EmptyState title="No rental history" />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Rental</Th>
                  <Th>Party</Th>
                  <Th>Period</Th>
                  <Th>Rate</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {machineRentals.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-mono">RN-{r.id.slice(0, 8).toUpperCase()}</Td>
                    <Td>
                      {(r.renterOrganizationId && renterNames.get(r.renterOrganizationId)) ||
                        r.clientSnapshot?.name ||
                        "—"}
                    </Td>
                    <Td className="font-mono">{formatDateRange(r.startDate, r.endDate)}</Td>
                    <Td className="font-mono">{formatCurrencyINR(r.rate)}/{r.rateUnit}</Td>
                    <Td>
                      <Badge
                        tone={
                          r.status === "active"
                            ? "info"
                            : r.status === "cancelled"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {r.status}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === "maintenance" && organizationId && (
        <MaintenancePanel organizationId={organizationId} machineId={machine.id} />
      )}

      {tab === "logsheets" && (
        <Card padding={!rental || logsheets.length === 0 ? "md" : "none"}>
          {!rental ? (
            <EmptyState
              title="No current rental"
              description="Logsheets are tied to the current rental — there isn't one right now."
            />
          ) : logsheets.length === 0 ? (
            <EmptyState title="No logsheets yet" />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Date</Th>
                  <Th>Operating</Th>
                  <Th>Idle</Th>
                  <Th>Overtime</Th>
                  <Th>Operator</Th>
                </Tr>
              </Thead>
              <Tbody>
                {logsheets.map((sheet) => (
                  <Tr key={sheet.id}>
                    <Td className="font-mono">{formatDate(sheet.logDate)}</Td>
                    <Td className="font-mono">{sheet.operatingHours ?? "—"}</Td>
                    <Td className="font-mono">{sheet.idleHours ?? "—"}</Td>
                    <Td className="font-mono">{sheet.overtimeHours ?? "—"}</Td>
                    <Td>{sheet.operatorName ?? "—"}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === "activity" && (
        <Card>
          <p className="text-sm text-meta">
            Per-machine activity history isn&apos;t available yet — recorded in the frontend/backend
            gap report.
          </p>
        </Card>
      )}

      {organizationId && (
        <EditMachineDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          organizationId={organizationId}
          machine={machine}
          onUpdated={(updated) => setData((prev) => (prev ? { ...prev, machine: updated } : prev))}
        />
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone = "text-ink",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 border-b border-r border-border-soft px-4 py-3.5 lg:border-b-0 lg:last:border-r-0">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-meta">{label}</span>
      <span className={["truncate font-mono text-[19px] font-semibold leading-tight", tone].join(" ")}>{value}</span>
      {sub && <span className="truncate text-[11px] leading-tight text-meta">{sub}</span>}
    </div>
  );
}

function Field({
  label,
  value,
  sub,
  align = "left",
  mono = false,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  align?: "left" | "right";
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={["flex flex-col gap-0.5", align === "right" ? "items-end" : "items-start", className].filter(Boolean).join(" ")}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-meta">{label}</span>
      <span className={["text-[15px] font-medium leading-tight text-ink", mono && "font-mono"].filter(Boolean).join(" ")}>
        {value}
      </span>
      {sub && <span className="text-xs leading-tight text-meta">{sub}</span>}
    </div>
  );
}

function TermCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 bg-surface px-3 py-2.5">
      <span className="text-[11px] leading-tight text-meta">{label}</span>
      <span className={["text-[13px] font-medium leading-tight text-ink-strong capitalize", mono && "font-mono normal-case"].filter(Boolean).join(" ")}>
        {value}
      </span>
    </div>
  );
}

function StatRow({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="flex-1 text-xs leading-tight text-ink-muted">{label}</span>
      <span className={["text-sm font-semibold text-ink", mono && "font-mono"].filter(Boolean).join(" ")}>{value}</span>
    </div>
  );
}
