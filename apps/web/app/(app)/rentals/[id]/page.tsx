"use client";

import type { Product } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
import type { Invoice } from "@fleetip/contracts/billing";
import type { Rental, RentalStatus } from "@fleetip/contracts/rental";
import {
  Alert,
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
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiClient } from "../../../../lib/api-client";
import { formatCurrencyINR, formatDate } from "../../../../lib/format";
import { useSession } from "../../../../lib/session-context";
import { INVOICE_STATUS_MAP } from "../../billing/shared";
import { MaintenancePanel } from "../../machines/panels";
import { LogsheetPanel, TransportPanel } from "../panels";
import { legalNextRentalStatuses, RENTAL_STATUS_MAP } from "../shared";

/** "What happens next" guidance — a hint, not a workflow engine; mirrors
 * legalNextRentalStatuses purely for copy, not enforcement. */
function nextStepHint(status: RentalStatus): string | null {
  switch (status) {
    case "confirmed":
      return "Next: plan mobilization (Transport tab), then mark Active once the machine is on site.";
    case "active":
      return "Keep logsheets current while the machine is on site. Mark Off-rent once the customer is done with it.";
    case "off_rent":
      return "Next: plan demobilization (Transport tab), then mark Completed once billing is settled.";
    default:
      return null;
  }
}

interface Loaded {
  rental: Rental;
  product: Product | null;
  machine: Machine | null;
  invoices: Invoice[];
}

export default function RentalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { currentMembership } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  const isRenter = organizationType === "renter";

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(searchParams.get("tab") ?? "overview");

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
    { key: "maintenance", label: "Maintenance", disabled: isRenter, title: isRenter ? renterExplanation : undefined },
    { key: "activity", label: "Activity" },
  ];
  const hint = !isRenter ? nextStepHint(rental.status) : null;

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

      {hint && <Alert tone="info">{hint}</Alert>}

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

      {tab === "maintenance" && !isRenter && machine && (
        <MaintenancePanel organizationId={organizationId} machineId={machine.id} />
      )}
      {tab === "maintenance" && !isRenter && !machine && (
        <EmptyState title="No machine on this rental" description="Maintenance is tracked per machine." />
      )}

      {tab === "activity" && (
        <Card>
          <p className="text-sm text-meta">
            There is no per-rental activity/audit log yet — status changes, transport updates,
            logsheet submissions and invoices don&apos;t write any log entry today. See the
            frontend/backend gap report.
          </p>
        </Card>
      )}
    </div>
  );
}
