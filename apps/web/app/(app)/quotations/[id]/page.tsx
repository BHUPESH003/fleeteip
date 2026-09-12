"use client";

import type { Product } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
import type { Organization } from "@fleetip/contracts/organization";
import type { CommercialQuotation, QuotationOffer } from "@fleetip/contracts/quotation";
import type { RateUnit } from "@fleetip/contracts/rental";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Select,
  StatusBadge,
} from "@fleetip/ui";
import { useParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { apiClient } from "../../../../lib/api-client";
import { formatCurrencyINR, formatDate, formatRelativeTime } from "../../../../lib/format";
import { useSession } from "../../../../lib/session-context";
import {
  contractValue,
  needsRenterAcceptance,
  OFFER_STATUS_MAP,
  QUOTATION_STATUS_MAP,
  rateDelta,
} from "../shared";

const RATE_UNIT_OPTIONS = [
  { value: "shift", label: "Per shift" },
  { value: "day", label: "Per day" },
  { value: "week", label: "Per week" },
  { value: "month", label: "Per month" },
];

interface Loaded {
  quotation: CommercialQuotation;
  offers: QuotationOffer[];
  machine: Machine | null;
  product: Product | null;
  counterpartyName: string;
}

export default function QuotationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentMembership } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCounterForm, setShowCounterForm] = useState(false);

  async function load(orgId: string, orgType: "renter" | "rental_company") {
    const [quotation, offers] = await Promise.all([
      apiClient.getQuotation(orgId, id) as Promise<CommercialQuotation>,
      apiClient.listOffers(orgId, id) as Promise<QuotationOffer[]>,
    ]);

    let machine: Machine | null = null;
    let product: Product | null = null;
    let counterpartyName = quotation.clientSnapshot?.name ?? "Counterparty";

    if (orgType === "rental_company") {
      // Machine/product lookups need equipment.manage (Rental Company
      // only); resolving the renter's name needs quotation.manage.
      const [machines, products, renterOrgs] = await Promise.all([
        apiClient.listMachines(orgId) as Promise<Machine[]>,
        apiClient.listProducts() as Promise<Product[]>,
        apiClient.listRenterOrganizations(orgId) as Promise<Organization[]>,
      ]);
      const foundMachine = machines.find((m) => m.id === quotation.machineId) ?? null;
      machine = foundMachine;
      product = foundMachine ? products.find((p) => p.id === foundMachine.productId) ?? null : null;
      if (quotation.renterOrganizationId) {
        counterpartyName =
          renterOrgs.find((o) => o.id === quotation.renterOrganizationId)?.name ?? counterpartyName;
      }
    } else {
      // A Renter has no equipment.manage on the Rental Company's org, so
      // machine/product identity can't be resolved here — see
      // docs/frontend-backend-gap-report.md (CommercialQuotation has no
      // server-resolved machine snapshot the way Rental does).
      const rentalCompanyOrgs = (await apiClient.listRentalCompanyOrganizations(
        orgId,
      )) as Organization[];
      counterpartyName =
        rentalCompanyOrgs.find((o) => o.id === quotation.rentalCompanyOrganizationId)?.name ??
        counterpartyName;
    }

    setData({ quotation, offers, machine, product, counterpartyName });
  }

  useEffect(() => {
    if (!organizationId || !organizationType) return;
    void (async () => {
      try {
        await load(organizationId, organizationType);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load quotation");
      }
    })();
  }, [organizationId, organizationType, id]);

  async function handleAction(action: "send" | "withdraw" | "accept" | "reject" | "award") {
    if (!organizationId || !organizationType) return;
    setError(null);
    try {
      if (action === "send") await apiClient.sendQuotation(organizationId, id);
      if (action === "withdraw") await apiClient.withdrawQuotation(organizationId, id);
      if (action === "accept") await apiClient.acceptQuotation(organizationId, id);
      if (action === "reject") await apiClient.rejectQuotation(organizationId, id);
      if (action === "award") await apiClient.awardQuotation(organizationId, id);
      await load(organizationId, organizationType);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} quotation`);
    }
  }

  async function handleOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || !organizationType || !data) return;
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await apiClient.makeOffer(organizationId, id, {
        rate: Number(form.get("rate")),
        rateUnit: String(form.get("rateUnit")) as RateUnit,
        startDate: data.quotation.startDate,
        notes: form.get("notes") ? String(form.get("notes")) : undefined,
      });
      setShowCounterForm(false);
      await load(organizationId, organizationType);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit offer");
    }
  }

  async function handleAcceptOffer(offerId: string) {
    if (!organizationId || !organizationType) return;
    setError(null);
    try {
      await apiClient.acceptOffer(organizationId, id, offerId);
      await load(organizationId, organizationType);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept offer");
    }
  }

  if (error) return <ErrorState message={error} />;
  if (!data || !organizationId || !organizationType) return <LoadingState label="Loading quotation…" />;

  const { quotation, offers, machine, product, counterpartyName } = data;
  const isOwner = quotation.rentalCompanyOrganizationId === organizationId;
  const canNegotiate = quotation.status === "sent" || quotation.status === "negotiating";
  const needsAcceptance = needsRenterAcceptance(quotation);
  const canAccept = !isOwner && organizationType === "renter" && canNegotiate && needsAcceptance;
  const delta = rateDelta(quotation, offers);
  const value = contractValue(quotation);

  const sections = [
    {
      title: "Equipment & rental period",
      rows: [
        ["Machine", product ? `${product.manufacturer} ${product.name}` : "—"],
        ["Asset code", machine?.assetCode ?? "—"],
        ["Registration", machine?.registrationNumber ?? "—"],
        ["Start date", formatDate(quotation.startDate)],
        ["End date", quotation.endDate ? formatDate(quotation.endDate) : "Open-ended"],
        [
          "Against requirement",
          quotation.requirementId ? `RFQ-${quotation.requirementId.slice(0, 8).toUpperCase()}` : "Direct",
        ],
      ],
    },
    {
      title: "Commercial terms",
      rows: [
        ["Rate", `${quotation.rate} / ${quotation.rateUnit}`],
        ["Mobilization", quotation.mobilizationCharge != null ? formatCurrencyINR(quotation.mobilizationCharge) : "—"],
        ["Demobilization", quotation.demobilizationCharge != null ? formatCurrencyINR(quotation.demobilizationCharge) : "—"],
        ["Overtime rate", quotation.overtimeRate != null ? formatCurrencyINR(quotation.overtimeRate) : "—"],
        ["Payment terms", quotation.paymentTerms ?? "—"],
        ["Validity", formatDate(quotation.validityDate)],
      ],
    },
    {
      title: "Operating terms",
      rows: [
        ["Operator scope", quotation.operatorScope?.replace(/_/g, " ") ?? "—"],
        ["Shift structure", quotation.shiftStructure ?? "—"],
        ["Sunday condition", quotation.sundayCondition ?? "—"],
        ["Fuel norms", quotation.fuelNorms ?? "—"],
        ["Notice period", quotation.noticePeriodDays != null ? `${quotation.noticePeriodDays} days` : "—"],
        ["De-hire terms", quotation.dehireTerms ?? "—"],
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumbs={[{ label: "Quotations", href: "/quotations" }, { label: quotation.referenceNumber }]}
        title={`Quotation ${quotation.referenceNumber}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled title="PDF export isn't available yet">
              Download PDF
            </Button>
            <Button variant="secondary" disabled title="Sharing isn't available yet">
              Share
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={quotation.status} map={QUOTATION_STATUS_MAP} />
        {quotation.renterOrganizationId && !quotation.sourceAuctionId && (
          <Badge tone={quotation.renterAcceptedAt ? "success" : "warning"}>
            {quotation.renterAcceptedAt ? "Accepted" : "Not yet accepted"}
          </Badge>
        )}
        <span className="text-sm text-meta">
          From <span className="font-medium text-ink">{counterpartyName}</span>
          {quotation.requirementId && (
            <>
              {" "}
              · against requirement{" "}
              <span className="font-mono">RFQ-{quotation.requirementId.slice(0, 8).toUpperCase()}</span>
            </>
          )}{" "}
          · validity {formatDate(quotation.validityDate)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-panel border border-border bg-surface-sunk p-3.5 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-meta">Current rate</span>
          <span className="font-mono text-xl font-medium text-ink">{quotation.rate}</span>
          {delta && (
            <span className={["text-[11px]", delta.tone === "success" ? "text-success" : delta.tone === "warning" ? "text-warning" : "text-meta"].join(" ")}>
              {delta.amount === 0 ? "unchanged from the opening offer" : `${delta.amount < 0 ? "down" : "up"} ${Math.abs(delta.amount)} from the opening offer`}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-meta">Rate unit</span>
          <span className="text-lg font-medium text-ink">per {quotation.rateUnit}</span>
          {quotation.shiftStructure && <span className="text-[11px] text-meta-light">{quotation.shiftStructure}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-meta">Contract value</span>
          <span className="font-mono text-lg font-medium text-ink">{value != null ? formatCurrencyINR(value) : "—"}</span>
          {quotation.mobilizationCharge != null && (
            <span className="text-[11px] text-meta-light">+ {formatCurrencyINR(quotation.mobilizationCharge)} mobilization</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-meta">Machine</span>
          <span className="text-sm font-medium text-ink">{product ? `${product.manufacturer} ${product.name}` : "—"}</span>
          <span className="font-mono text-[11px] text-meta-light">{machine?.assetCode ?? "—"}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1fr_340px]">
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

        <div className="flex flex-col gap-3.5">
          <Card>
            {canAccept ? (
              <div className="flex flex-col gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-ink">Your decision</h2>
                  <p className="mt-1 text-xs text-meta">
                    {counterpartyName} {offers.length > 0 ? "countered at" : "sent"} {quotation.rate}/{quotation.rateUnit}.
                    Accepting records your acceptance; the rental company then awards it and the rental is created.
                  </p>
                </div>
                {!showCounterForm ? (
                  <div className="flex flex-col gap-2">
                    <Button onClick={() => void handleAction("accept")}>Accept these terms</Button>
                    <Button variant="secondary" onClick={() => setShowCounterForm(true)}>
                      Send counter offer
                    </Button>
                    <Button variant="tertiary" className="text-danger" onClick={() => void handleAction("reject")}>
                      Decline quotation
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleOffer} className="flex flex-col gap-3">
                    <Input label="Rate" name="rate" type="number" step="0.01" required />
                    <Select label="Unit" name="rateUnit" options={RATE_UNIT_OPTIONS} defaultValue={quotation.rateUnit} />
                    <Input label="Notes" name="notes" />
                    <div className="flex gap-2">
                      <Button type="submit">Send counter offer</Button>
                      <Button type="button" variant="secondary" onClick={() => setShowCounterForm(false)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}
                <div className="flex gap-2 rounded-control bg-warning-bg px-3 py-2.5">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                  <span className="text-[11px] text-warning">
                    Any change to the terms after you accept clears your acceptance and it must be given again.
                  </span>
                </div>
              </div>
            ) : isOwner ? (
              <div className="flex flex-col gap-2">
                <h2 className="mb-1 text-sm font-semibold text-ink">Actions</h2>
                {quotation.status === "draft" && <Button onClick={() => void handleAction("send")}>Send</Button>}
                {(quotation.status === "draft" || quotation.status === "sent") && (
                  <Button variant="secondary" onClick={() => void handleAction("withdraw")}>
                    Withdraw
                  </Button>
                )}
                {canNegotiate && !needsAcceptance && <Button onClick={() => void handleAction("award")}>Award</Button>}
                {canNegotiate && needsAcceptance && (
                  <p className="text-xs text-meta">Awaiting the Renter&rsquo;s acceptance.</p>
                )}
                {!canNegotiate && quotation.status !== "draft" && (
                  <p className="text-xs text-meta">
                    This quotation is {quotation.status} — no further action needed here.
                  </p>
                )}
              </div>
            ) : (
              <div>
                <h2 className="mb-1 text-sm font-semibold text-ink">Status</h2>
                <p className="text-xs text-meta">
                  {organizationType === "renter" && quotation.renterAcceptedAt && canNegotiate
                    ? "You accepted — awaiting award."
                    : `This quotation is ${quotation.status}.`}
                </p>
                {!isOwner && organizationType === "renter" && canNegotiate && !quotation.renterAcceptedAt && (
                  <Button variant="tertiary" className="mt-2 text-danger" onClick={() => void handleAction("reject")}>
                    Decline quotation
                  </Button>
                )}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-ink">Offer trail</h2>
            {offers.length === 0 ? (
              <p className="text-sm text-meta">No offers yet.</p>
            ) : (
              <div className="flex flex-col">
                {offers.map((offer, index) => (
                  <div key={offer.id} className="flex gap-2.5">
                    <div className="flex flex-none flex-col items-center gap-0.5">
                      <span className="h-2 w-2 rounded-full bg-ink-strong" />
                      {index < offers.length - 1 && <span className="w-px flex-1 bg-border" />}
                    </div>
                    <div className="flex flex-1 flex-col gap-1 pb-3.5">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-semibold text-ink">
                          {offer.offeredByOrganizationId === organizationId ? "You" : counterpartyName}
                        </span>
                        <span className="ml-auto text-[11px] text-meta-light">{formatRelativeTime(offer.createdAt)}</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-base font-medium text-ink">{offer.rate}</span>
                        <span className="text-[11px] text-meta-light">/ {offer.rateUnit}</span>
                        <StatusBadge status={offer.status} map={OFFER_STATUS_MAP} className="ml-auto" />
                      </div>
                      {offer.notes && <span className="text-[11px] text-meta">{offer.notes}</span>}
                      {offer.status === "pending" && offer.offeredByOrganizationId !== organizationId && (
                        <Button size="sm" className="mt-1 w-fit" onClick={() => void handleAcceptOffer(offer.id)}>
                          Accept this offer
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
