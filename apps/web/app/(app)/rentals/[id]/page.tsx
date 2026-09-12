"use client";

import type { Product } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
import type { Invoice } from "@fleetip/contracts/billing";
import type { Logsheet, RentalUtilization } from "@fleetip/contracts/logsheet";
import type { Rental } from "@fleetip/contracts/rental";
import type { TransportLeg, TransportRecord, TransportStatus } from "@fleetip/contracts/transport";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
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
import Link from "next/link";
import { useParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { apiClient } from "../../../../lib/api-client";
import { formatCurrencyINR, formatDate } from "../../../../lib/format";
import { useSession } from "../../../../lib/session-context";
import { INVOICE_STATUS_MAP } from "../../billing/shared";
import { legalNextRentalStatuses, legalNextTransportStatuses, RENTAL_STATUS_MAP, TRANSPORT_STATUS_MAP } from "../shared";

const LEGS: TransportLeg[] = ["mobilization", "demobilization"];

interface Loaded {
  rental: Rental;
  product: Product | null;
  machine: Machine | null;
  invoices: Invoice[];
}

function TransportPanel({ organizationId, rentalId }: { organizationId: string; rentalId: string }) {
  const [records, setRecords] = useState<TransportRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setRecords((await apiClient.listTransportForRental(organizationId, rentalId)) as TransportRecord[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transport records");
    }
  }

  useEffect(() => {
    void refresh();
  }, [organizationId, rentalId]);

  async function handleCreate(leg: TransportLeg) {
    try {
      await apiClient.createTransport(organizationId, rentalId, { leg });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create transport record");
    }
  }

  async function handleStatus(leg: TransportLeg, status: TransportStatus) {
    try {
      await apiClient.updateTransport(organizationId, rentalId, leg, {
        status,
        ...(status === "delivered" ? { actualDate: new Date().toISOString().slice(0, 10) } : {}),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update transport record");
    }
  }

  return (
    <Card>
      {error && <ErrorState message={error} />}
      <div className="flex flex-col gap-3">
        {LEGS.map((leg) => {
          const record = records.find((r) => r.leg === leg);
          return (
            <div
              key={leg}
              className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border p-3"
            >
              <div>
                <p className="text-sm font-medium capitalize text-ink">{leg}</p>
                {record ? (
                  <p className="text-xs text-meta">
                    {record.pickupLocation ?? "—"} → {record.destination ?? "—"} · planned{" "}
                    {record.plannedDate ?? "—"}
                  </p>
                ) : (
                  <p className="text-xs text-meta">Not yet planned</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {record ? (
                  <>
                    <StatusBadge status={record.status} map={TRANSPORT_STATUS_MAP} />
                    {legalNextTransportStatuses(record.status).map((next) => (
                      <Button key={next} size="sm" variant="secondary" onClick={() => void handleStatus(leg, next)}>
                        Mark {next}
                      </Button>
                    ))}
                  </>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => void handleCreate(leg)}>
                    Plan
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function LogsheetPanel({ organizationId, rentalId }: { organizationId: string; rentalId: string }) {
  const [logsheets, setLogsheets] = useState<Logsheet[]>([]);
  const [utilization, setUtilization] = useState<RentalUtilization | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const [list, util] = await Promise.all([
        apiClient.listLogsheetsForRental(organizationId, rentalId),
        apiClient.getRentalUtilization(organizationId, rentalId),
      ]);
      setLogsheets(list as Logsheet[]);
      setUtilization(util as RentalUtilization);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logsheets");
    }
  }

  useEffect(() => {
    void refresh();
  }, [organizationId, rentalId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const operatingHours = form.get("operatingHours");
    const idleHours = form.get("idleHours");
    const overtimeHours = form.get("overtimeHours");
    try {
      await apiClient.submitLogsheet(organizationId, rentalId, {
        logDate: String(form.get("logDate")),
        operatingHours: operatingHours ? Number(operatingHours) : undefined,
        idleHours: idleHours ? Number(idleHours) : undefined,
        overtimeHours: overtimeHours ? Number(overtimeHours) : undefined,
      });
      formElement.reset();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit logsheet");
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      {error && <ErrorState message={error} />}
      {utilization && (
        <Card>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Rental days", utilization.totalRentalDays],
              ["Operating hrs", utilization.totalOperatingHours],
              ["Idle hrs", utilization.totalIdleHours],
              ["Logged days", utilization.loggedDayCount],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-meta">{label}</span>
                <span className="font-mono text-lg font-medium text-ink">{value}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card>
        <form onSubmit={handleSubmit} className="mb-4 flex flex-wrap items-end gap-3">
          <Input label="Date" name="logDate" type="date" required />
          <Input label="Operating hrs" name="operatingHours" type="number" step="0.5" />
          <Input label="Idle hrs" name="idleHours" type="number" step="0.5" />
          <Input label="Overtime hrs" name="overtimeHours" type="number" step="0.5" />
          <Button type="submit">Submit logsheet</Button>
        </form>
        {logsheets.length === 0 ? (
          <EmptyState title="No logsheets yet" description="Submit one above." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Date</Th>
                <Th>Operating</Th>
                <Th>Idle</Th>
                <Th>Overtime</Th>
              </Tr>
            </Thead>
            <Tbody>
              {logsheets.map((log) => (
                <Tr key={log.id}>
                  <Td className="font-mono">{formatDate(log.logDate)}</Td>
                  <Td>{log.operatingHours ?? "—"}</Td>
                  <Td>{log.idleHours ?? "—"}</Td>
                  <Td>{log.overtimeHours ?? "—"}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

export default function RentalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentMembership } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  const isRenter = organizationType === "renter";

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");

  async function load(orgId: string) {
    const [rentals, invoices] = await Promise.all([
      apiClient.listRentals(orgId) as Promise<Rental[]>,
      apiClient.listInvoices(orgId) as Promise<Invoice[]>,
    ]);
    const rental = rentals.find((r) => r.id === id);
    if (!rental) throw new Error("Rental not found");

    let product: Product | null = null;
    let machine: Machine | null = null;
    if (!isRenter) {
      // Product/machine identity needs equipment.manage — Rental Company only.
      const [machines, products] = await Promise.all([
        apiClient.listMachines(orgId) as Promise<Machine[]>,
        apiClient.listProducts() as Promise<Product[]>,
      ]);
      machine = machines.find((m) => m.id === rental.machineId) ?? null;
      product = machine ? (products.find((p) => p.id === machine!.productId) ?? null) : null;
    }

    setData({ rental, product, machine, invoices: invoices.filter((inv) => inv.rentalId === rental.id) });
  }

  useEffect(() => {
    if (!organizationId) return;
    void (async () => {
      try {
        await load(organizationId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load rental");
      }
    })();
  }, [organizationId, id]);

  async function handleStatus(status: Rental["status"]) {
    if (!organizationId) return;
    setError(null);
    try {
      await apiClient.updateRentalStatus(organizationId, id, status);
      await load(organizationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update rental status");
    }
  }

  if (error) return <ErrorState message={error} />;
  if (!data || !organizationId) return <LoadingState label="Loading rental…" />;

  const { rental, product, machine, invoices } = data;
  const customerName = isRenter
    ? (rental.rentalCompanyOrganizationName ?? "Rental company")
    : (rental.clientSnapshot?.name ?? `Renter ${rental.renterOrganizationId?.slice(0, 8) ?? ""}…`);

  const sections = [
    {
      title: "Equipment & period",
      rows: [
        ["Machine", product ? `${product.manufacturer} ${product.name}` : (rental.machineAssetCode ?? "—")],
        ["Asset code", machine?.assetCode ?? rental.machineAssetCode ?? "—"],
        ["Project", rental.projectName ?? "—"],
        ["Location", rental.projectLocation ?? "—"],
        ["Start date", formatDate(rental.startDate)],
        ["End date", rental.endDate ? formatDate(rental.endDate) : "Open-ended"],
      ],
    },
    {
      title: "Commercial terms",
      rows: [
        ["Rate", `${rental.rate} / ${rental.rateUnit}`],
        ["Mobilization", rental.mobilizationCharge != null ? formatCurrencyINR(rental.mobilizationCharge) : "—"],
        ["Demobilization", rental.demobilizationCharge != null ? formatCurrencyINR(rental.demobilizationCharge) : "—"],
        ["Payment terms", rental.paymentTerms ?? "—"],
        ["Notice period", rental.noticePeriodDays != null ? `${rental.noticePeriodDays} days` : "—"],
        ["De-hire terms", rental.dehireTerms ?? "—"],
      ],
    },
    {
      title: "Operating terms",
      rows: [
        ["Operator scope", rental.operatorScope?.replace(/_/g, " ") ?? "—"],
        ["Shift structure", rental.shiftStructure ?? "—"],
        ["Overtime rate", rental.overtimeRate != null ? formatCurrencyINR(rental.overtimeRate) : "—"],
        ["Sunday condition", rental.sundayCondition ?? "—"],
        ["Fuel norms", rental.fuelNorms ?? "—"],
      ],
    },
  ];

  const renterExplanation = "Managed by the rental company — not visible to Renters yet.";
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "billing", label: "Billing" },
    { key: "transport", label: "Transport", disabled: isRenter, title: isRenter ? renterExplanation : undefined },
    {
      key: "logsheets",
      label: "Logsheets & utilization",
      disabled: isRenter,
      title: isRenter ? renterExplanation : undefined,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumbs={[{ label: "Rentals", href: "/rentals" }, { label: customerName }]}
        title={`Rental · ${customerName}`}
        description={
          machine
            ? `${machine.assetCode} · ${formatDate(rental.startDate)} → ${rental.endDate ? formatDate(rental.endDate) : "open-ended"}`
            : `${formatDate(rental.startDate)} → ${rental.endDate ? formatDate(rental.endDate) : "open-ended"}`
        }
        actions={
          !isRenter && machine ? (
            <Link href={`/machines/${machine.id}`} className="text-xs font-medium text-accent-text">
              View machine →
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={rental.status} map={RENTAL_STATUS_MAP} />
        <span className="text-sm text-meta">
          {rental.rate}/{rental.rateUnit} · {customerName}
        </span>
        {!isRenter &&
          legalNextRentalStatuses(rental.status).map((next) => (
            <Button key={next} size="sm" variant="secondary" onClick={() => void handleStatus(next)}>
              Mark {next.replace("_", " ")}
            </Button>
          ))}
      </div>

      <Tabs items={tabs} active={tab} onChange={setTab} />

      {tab === "overview" && (
        <div className="flex flex-col gap-3.5">
          {sections.map((section) => (
            <Card key={section.title}>
              <h2 className="mb-3 text-sm font-semibold text-ink">{section.title}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {section.rows.map(([label, value]) => (
                  <div key={label} className="flex flex-col gap-0.5 border-b border-border pb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-meta">{label}</span>
                    <span className="text-sm text-ink">{value}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "billing" && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Invoices for this rental</h2>
            <Link href="/billing" className="text-xs font-medium text-accent-text">
              Open Billing →
            </Link>
          </div>
          {invoices.length === 0 ? (
            <EmptyState title="No invoices yet" description="Invoices raised against this rental will show up here." />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Invoice</Th>
                  <Th>Period</Th>
                  <Th>Amount</Th>
                  <Th>Due</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {invoices.map((invoice) => (
                  <Tr key={invoice.id}>
                    <Td className="font-mono">{invoice.invoiceNumber}</Td>
                    <Td className="font-mono">
                      {formatDate(invoice.billingPeriodStart)} → {formatDate(invoice.billingPeriodEnd)}
                    </Td>
                    <Td className="font-mono">{formatCurrencyINR(invoice.totalAmount)}</Td>
                    <Td className="font-mono">{formatDate(invoice.dueDate)}</Td>
                    <Td>
                      <StatusBadge status={invoice.status} map={INVOICE_STATUS_MAP} />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === "transport" && !isRenter && <TransportPanel organizationId={organizationId} rentalId={id} />}
      {tab === "logsheets" && !isRenter && <LogsheetPanel organizationId={organizationId} rentalId={id} />}
    </div>
  );
}
