"use client";

import type { Product } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
import type { Logsheet, MachineUtilization } from "@fleetip/contracts/logsheet";
import type { MaintenanceRecord, MaintenanceType } from "@fleetip/contracts/maintenance";
import type { Organization } from "@fleetip/contracts/organization";
import type { Rental } from "@fleetip/contracts/rental";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Select,
  StatusBadge,
  Table,
  Tabs,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@fleetip/ui";
import { useParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { apiClient } from "../../../../lib/api-client";
import { formatDate } from "../../../../lib/format";
import { useSession } from "../../../../lib/session-context";
import {
  MACHINE_STATUS_MAP,
  MAINTENANCE_STATUS_MAP,
  currentRentalFor,
  flattenSpecifications,
  legalNextMachineStatuses,
  legalNextMaintenanceStatuses,
} from "../shared";

interface Loaded {
  machine: Machine;
  product: Product | null;
  rentals: Rental[];
  maintenance: MaintenanceRecord[];
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

export default function MachineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentMembership } = useSession();
  const organizationId = currentMembership?.organizationId;

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");
  const [scheduleOpen, setScheduleOpen] = useState(false);

  async function load(orgId: string) {
    const [machines, maintenance, utilization, rentals, renterOrgs] = await Promise.all([
      apiClient.listMachines(orgId) as Promise<Machine[]>,
      apiClient.listMaintenanceForMachine(orgId, id) as Promise<MaintenanceRecord[]>,
      apiClient.getMachineUtilization(orgId, id) as Promise<MachineUtilization>,
      apiClient.listRentals(orgId) as Promise<Rental[]>,
      apiClient.listRenterOrganizations(orgId) as Promise<Organization[]>,
    ]);
    const machine = machines.find((m) => m.id === id) ?? null;
    if (!machine) {
      setError("Machine not found");
      return;
    }
    const products = (await apiClient.listProducts()) as Product[];
    const product = products.find((p) => p.id === machine.productId) ?? null;
    const rental = currentRentalFor(machine.id, rentals);
    const logsheets = rental
      ? ((await apiClient.listLogsheetsForRental(orgId, rental.id)) as Logsheet[])
      : [];
    setData({
      machine,
      product,
      rentals,
      maintenance,
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
  }, [organizationId, id]);

  async function handleMarkStatus(status: Machine["status"]) {
    if (!organizationId) return;
    await apiClient.updateMachineStatus(organizationId, id, status);
    await load(organizationId);
  }

  async function handleSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const endDate = form.get("endDate");
    await apiClient.createMaintenance(organizationId, {
      machineId: id,
      maintenanceType: String(form.get("maintenanceType")) as MaintenanceType,
      startDate: String(form.get("startDate")),
      endDate: endDate ? String(endDate) : undefined,
      notes: form.get("notes") ? String(form.get("notes")) : undefined,
    });
    formElement.reset();
    setScheduleOpen(false);
    await load(organizationId);
  }

  async function handleMaintenanceStatus(maintenanceId: string, status: MaintenanceRecord["status"]) {
    if (!organizationId) return;
    await apiClient.updateMaintenanceStatus(organizationId, maintenanceId, status);
    await load(organizationId);
  }

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Loading machine…" />;

  const { machine, product, rentals, maintenance, utilization, logsheets, renterNames } = data;
  const rental = currentRentalFor(machine.id, rentals);
  const rentalName = rental
    ? (rental.renterOrganizationId && renterNames.get(rental.renterOrganizationId)) ||
      rental.clientSnapshot?.name ||
      "Renter"
    : null;
  const specRows = flattenSpecifications(product?.specifications);
  const utilPct = utilization
    ? Math.round(
        (utilization.totalOperatingHours /
          Math.max(1, utilization.totalOperatingHours + utilization.totalIdleHours)) *
          100,
      )
    : 0;

  return (
    <div className="flex flex-col gap-4">
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
            <Button variant="secondary" disabled title="Editing machine fields isn't supported yet">
              Edit
            </Button>
            <Button disabled={Boolean(rental)} title={rental ? "Already on rent" : "Not built yet"}>
              Rent machine
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={machine.status} map={MACHINE_STATUS_MAP} />
        {rental && (
          <Badge tone="info">
            On rent {rental.endDate ? `until ${formatDate(rental.endDate)}` : "(open-ended)"}
          </Badge>
        )}
        <span className="font-mono text-sm text-ink-muted">{machine.assetCode}</span>
      </div>

      <Tabs items={TABS} active={tab} onChange={setTab} />

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.5fr_1fr]">
          <div className="flex flex-col gap-3.5">
            {rental && (
              <Card className="border-l-[3px] border-l-info">
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-ink">Currently on rent</h2>
                  <span className="font-mono text-xs text-info">RN-{rental.id.slice(0, 8).toUpperCase()}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field label="Renter" value={rentalName ?? "—"} />
                  <Field
                    label="Period"
                    value={`${formatDate(rental.startDate)} → ${rental.endDate ? formatDate(rental.endDate) : "open"}`}
                    mono
                  />
                  <Field label="Rate" value={`₹${rental.rate.toLocaleString("en-IN")} / ${rental.rateUnit}`} mono />
                  <Field label="Site" value={rental.projectLocation ?? rental.projectName ?? "—"} />
                </div>
              </Card>
            )}

            <Card>
              <h2 className="mb-3 text-sm font-semibold text-ink">Identity &amp; specifications</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="Asset code" value={machine.assetCode} mono />
                <Field label="Registration number" value={machine.registrationNumber} mono />
                <Field label="Chassis number" value={machine.chassisNumber ?? "—"} mono />
                <Field label="Manufacturer" value={product?.manufacturer ?? "—"} />
                <Field label="Product" value={product?.name ?? "—"} />
                <Field label="Year of manufacture" value={String(machine.yearOfManufacture ?? "—")} mono />
                {specRows.map((row) => (
                  <Field key={row.label} label={row.label} value={row.value} mono />
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="text-sm font-semibold text-ink">Utilization</h2>
              <span className="text-xs text-meta-light">logged history</span>
            </div>
            {utilization ? (
              <div className="flex flex-col gap-2">
                <div className="h-2.5 overflow-hidden rounded-xs bg-neutral-bg">
                  <div className="h-full bg-success" style={{ width: `${utilPct}%` }} />
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-lg font-medium text-ink">{utilPct}%</span>
                  <span className="text-xs text-meta">
                    {utilization.totalOperatingHours} operating of{" "}
                    {utilization.totalOperatingHours + utilization.totalIdleHours} hrs
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 border-t border-border pt-3">
                  <Field label="Operating" value={`${utilization.totalOperatingHours} h`} mono />
                  <Field label="Idle" value={`${utilization.totalIdleHours} h`} mono />
                  <Field label="Logged days" value={String(utilization.loggedDayCount)} mono />
                </div>
              </div>
            ) : (
              <p className="text-sm text-meta">No utilization data yet.</p>
            )}
          </Card>
        </div>
      )}

      {tab === "rentals" && (
        <Card padding={rentals.filter((r) => r.machineId === machine.id).length === 0 ? "md" : "none"}>
          {rentals.filter((r) => r.machineId === machine.id).length === 0 ? (
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
                {rentals
                  .filter((r) => r.machineId === machine.id)
                  .map((r) => (
                    <Tr key={r.id}>
                      <Td className="font-mono">RN-{r.id.slice(0, 8).toUpperCase()}</Td>
                      <Td>
                        {(r.renterOrganizationId && renterNames.get(r.renterOrganizationId)) ||
                          r.clientSnapshot?.name ||
                          "—"}
                      </Td>
                      <Td className="font-mono">
                        {formatDate(r.startDate)} → {r.endDate ? formatDate(r.endDate) : "open"}
                      </Td>
                      <Td className="font-mono">
                        ₹{r.rate.toLocaleString("en-IN")}/{r.rateUnit}
                      </Td>
                      <Td>
                        <Badge tone={r.status === "active" ? "info" : r.status === "cancelled" ? "danger" : "neutral"}>
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

      {tab === "maintenance" && (
        <div className="flex flex-col gap-3">
          <div>
            <Button onClick={() => setScheduleOpen(true)}>Schedule maintenance</Button>
          </div>
          <Card padding={maintenance.length === 0 ? "md" : "none"}>
            {maintenance.length === 0 ? (
              <EmptyState title="No maintenance records" description="Schedule one above." />
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Type</Th>
                    <Th>Period</Th>
                    <Th>Status</Th>
                    <Th>Notes</Th>
                    <Th />
                  </Tr>
                </Thead>
                <Tbody>
                  {maintenance.map((record) => (
                    <Tr key={record.id}>
                      <Td className="capitalize">{record.maintenanceType}</Td>
                      <Td className="font-mono">
                        {formatDate(record.startDate)} → {record.endDate ? formatDate(record.endDate) : "ongoing"}
                      </Td>
                      <Td>
                        <StatusBadge status={record.status} map={MAINTENANCE_STATUS_MAP} />
                      </Td>
                      <Td className="text-meta">{record.notes ?? "—"}</Td>
                      <Td>
                        <div className="flex gap-2">
                          {legalNextMaintenanceStatuses(record.status).map((next) => (
                            <button
                              key={next}
                              onClick={() => void handleMaintenanceStatus(record.id, next)}
                              className="text-xs font-medium text-accent-text"
                            >
                              Mark {next.replace("_", " ")}
                            </button>
                          ))}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Card>
        </div>
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

      <Dialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} title="Schedule maintenance">
        <form onSubmit={handleSchedule} className="flex flex-col gap-4 text-left">
          <Select
            label="Type"
            name="maintenanceType"
            required
            options={[
              { value: "scheduled", label: "Scheduled" },
              { value: "breakdown", label: "Breakdown" },
              { value: "inspection", label: "Inspection" },
              { value: "other", label: "Other" },
            ]}
          />
          <Input label="Start date" name="startDate" type="date" required />
          <Input label="End date (leave blank if ongoing)" name="endDate" type="date" />
          <Input label="Notes" name="notes" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setScheduleOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Schedule</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border pb-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-meta">{label}</span>
      <span className={["text-sm text-ink", mono && "font-mono"].filter(Boolean).join(" ")}>{value}</span>
    </div>
  );
}
