"use client";

import type { Product } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
import type { Organization } from "@fleetip/contracts/organization";
import type {
  CommercialQuotation,
  QuotationOffer,
  QuotationScopeItem,
} from "@fleetip/contracts/quotation";
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
import Link from "next/link";
import { useParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { apiClient } from "../../../../lib/api-client";
import { formatCurrencyINR, formatDate, formatRelativeTime } from "../../../../lib/format";
import { useSession } from "../../../../lib/session-context";
import { EditQuotationTermsDialog } from "../EditQuotationTermsDialog";
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

// Category/equipment-specific responsibilities (wire rope scope, ground
// preparation, support crane, ...) — a structured collection rather than an
// ever-growing set of *Scope columns. Only the drafting Rental Company can
// add/remove; either party can read.
function ScopeItemsCard({
  organizationId,
  quotationId,
  canEdit,
}: {
  organizationId: string;
  quotationId: string;
  canEdit: boolean;
}) {
  const [items, setItems] = useState<QuotationScopeItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      setItems(
        (await apiClient.listScopeItems(organizationId, quotationId)) as QuotationScopeItem[],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scope items");
    }
  }

  useEffect(() => {
    void load();
  }, [organizationId, quotationId]);

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await apiClient.addScopeItem(organizationId, quotationId, {
        item: String(form.get("item")),
        responsibleParty: form.get("responsibleParty") === "company" ? "company" : "client",
        notes: form.get("notes") ? String(form.get("notes")) : undefined,
      });
      formElement.reset();
      setAdding(false);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add scope item");
    }
  }

  async function handleRemove(scopeItemId: string) {
    try {
      await apiClient.removeScopeItem(organizationId, quotationId, scopeItemId);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove scope item");
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Category-specific responsibilities</h2>
        {canEdit && !adding && (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            Add item
          </Button>
        )}
      </div>
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      {items === null ? (
        <LoadingState label="Loading…" />
      ) : items.length === 0 && !adding ? (
        <p className="text-sm text-meta">
          No equipment-specific responsibilities recorded (e.g. wire rope scope, ground
          preparation).
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((scopeItem) => (
            <li
              key={scopeItem.id}
              className="flex items-start justify-between gap-2 border-b border-border pb-2 text-sm"
            >
              <div>
                <span className="font-medium text-ink">{scopeItem.item}</span>
                <span className="ml-2 text-meta">
                  — {scopeItem.responsibleParty === "client" ? "Client scope" : "Company scope"}
                </span>
                {scopeItem.notes && <p className="text-xs text-meta-light">{scopeItem.notes}</p>}
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void handleRemove(scopeItem.id)}
                  className="shrink-0 text-xs font-medium text-danger"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <form onSubmit={handleAdd} className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input label="Item" name="item" placeholder="e.g. Wire rope" required />
            <Select
              label="Responsible party"
              name="responsibleParty"
              options={[
                { value: "client", label: "Client scope" },
                { value: "company", label: "Company scope" },
              ]}
            />
            <Input label="Notes" name="notes" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      )}
    </Card>
  );
}

export default function QuotationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  // Machine/product lookups are enrichment, not the point of this page
  // (quotation.manage is) — a role without equipment.manage still gets a
  // fully working page, just without the machine resolved (machineLabel/
  // machineAssetCode already fall back to the server-resolved quotation
  // fields below). Gating the fetch itself also skips a request that would 403.
  const canListMachines = hasPermission("equipment.manage");

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCounterForm, setShowCounterForm] = useState(false);
  const [workOrderId, setWorkOrderId] = useState<string | null>(null);
  const [showEditTerms, setShowEditTerms] = useState(false);
  const [showAlternateDatesForm, setShowAlternateDatesForm] = useState(false);
  const [alternateDatesError, setAlternateDatesError] = useState<string | null>(null);

  async function load(orgId: string, orgType: "renter" | "rental_company") {
    const [quotation, offers] = await Promise.all([
      apiClient.getQuotation(orgId, id) as Promise<CommercialQuotation>,
      apiClient.listOffers(orgId, id) as Promise<QuotationOffer[]>,
    ]);

    let machine: Machine | null = null;
    let product: Product | null = null;
    let counterpartyName = quotation.clientSnapshot?.name ?? "Counterparty";

    if (orgType === "rental_company") {
      // Machine lookup needs equipment.manage (Rental Company only);
      // resolving the renter's name needs quotation.manage. listProducts is
      // an open read, but it's only useful here paired with the machine.
      const [machines, products, renterOrgs] = await Promise.all([
        canListMachines
          ? (apiClient.listMachines(orgId) as Promise<Machine[]>)
          : Promise.resolve([]),
        apiClient.listProducts() as Promise<Product[]>,
        apiClient.listRenterOrganizations(orgId) as Promise<Organization[]>,
      ]);
      const foundMachine = machines.find((m) => m.id === quotation.machineId) ?? null;
      machine = foundMachine;
      product = foundMachine
        ? (products.find((p) => p.id === foundMachine.productId) ?? null)
        : null;
      if (quotation.renterOrganizationId) {
        counterpartyName =
          renterOrgs.find((o) => o.id === quotation.renterOrganizationId)?.name ?? counterpartyName;
      }
    } else {
      // A Renter has no equipment.manage on the Rental Company's org, so
      // machine/product can't be looked up here — but CommercialQuotation
      // now carries machineAssetCode/productName resolved server-side just
      // for the Renter party (see machineLabel/machineAssetCode below).
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
  }, [organizationId, organizationType, id, canListMachines]);

  useEffect(() => {
    if (!organizationId || data?.quotation.status !== "awarded") return;
    void apiClient
      .getWorkOrderByQuotationId(organizationId, id)
      .then((workOrder) => setWorkOrderId((workOrder as { id: string } | null)?.id ?? null))
      .catch(() => setWorkOrderId(null));
  }, [organizationId, id, data?.quotation.status]);

  async function handleAction(action: "send" | "withdraw" | "accept" | "reject" | "award") {
    if (!organizationId || !organizationType) return;
    setError(null);
    try {
      if (action === "send") await apiClient.sendQuotation(organizationId, id);
      if (action === "withdraw") await apiClient.withdrawQuotation(organizationId, id);
      // acceptQuotation itself applies any pending counter-offer from the
      // other party before recording acceptance, so "Accept these terms"
      // always attaches to whatever is actually on the table right now, not
      // a stale pre-negotiation rate — see the server-side comment.
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

  async function handleProposeAlternateDates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || !organizationType) return;
    setAlternateDatesError(null);
    const form = new FormData(event.currentTarget);
    const endDate = form.get("endDate");
    try {
      await apiClient.proposeAlternateDates(organizationId, id, {
        startDate: String(form.get("startDate")),
        endDate: endDate ? String(endDate) : undefined,
        reason: form.get("reason") ? String(form.get("reason")) : undefined,
      });
      setShowAlternateDatesForm(false);
      await load(organizationId, organizationType);
    } catch (err) {
      setAlternateDatesError(
        err instanceof Error ? err.message : "Failed to propose alternate dates",
      );
    }
  }

  async function handleRespondToAlternateDates(decision: "accepted" | "rejected") {
    if (!organizationId || !organizationType) return;
    setAlternateDatesError(null);
    try {
      await apiClient.respondToAlternateDates(organizationId, id, decision);
      await load(organizationId, organizationType);
    } catch (err) {
      setAlternateDatesError(
        err instanceof Error
          ? err.message
          : `Failed to ${decision === "accepted" ? "accept" : "reject"} the proposed dates`,
      );
    }
  }

  if (error) return <ErrorState message={error} />;
  if (!data || !organizationId || !organizationType)
    return <LoadingState label="Loading quotation…" />;

  const { quotation, offers, machine, product, counterpartyName } = data;
  // Rental Company side resolves machine/product via listMachines/listProducts
  // (equipment.manage); the Renter side has no such permission, so
  // CommercialQuotation carries these server-resolved just for them
  // (null for the Rental Company) — prefer whichever is populated.
  const machineLabel =
    quotation.productName ?? (product ? `${product.manufacturer} ${product.name}` : null);
  const machineAssetCode = quotation.machineAssetCode ?? machine?.assetCode ?? null;
  const isOwner = quotation.rentalCompanyOrganizationId === organizationId;
  const canNegotiate = quotation.status === "sent" || quotation.status === "negotiating";
  const needsAcceptance = needsRenterAcceptance(quotation);
  const canAccept = !isOwner && organizationType === "renter" && canNegotiate && needsAcceptance;
  // There is at most one "pending" offer at a time — a new one supersedes
  // whichever was pending before, from either party (offerRepository.
  // supersedePending). quotation.rate only reflects an *accepted* offer, so
  // while one is still pending it's stale — the pending offer's own rate is
  // the actual number on the table right now.
  const pendingOffer = offers.find((o) => o.status === "pending") ?? null;
  const pendingFromCounterparty =
    Boolean(pendingOffer) && pendingOffer!.offeredByOrganizationId !== organizationId;
  const decisionRate = pendingFromCounterparty ? pendingOffer!.rate : quotation.rate;
  const decisionRateUnit = pendingFromCounterparty ? pendingOffer!.rateUnit : quotation.rateUnit;
  const delta = rateDelta(quotation, offers);
  const value = contractValue(quotation);

  const sections = [
    {
      title: "Equipment & rental period",
      rows: [
        ["Machine", machineLabel ?? "—"],
        ["Asset code", machineAssetCode ?? "—"],
        ["Registration", machine?.registrationNumber ?? "—"],
        ["Start date", formatDate(quotation.startDate)],
        ["End date", quotation.endDate ? formatDate(quotation.endDate) : "Open-ended"],
        [
          "Against requirement",
          quotation.requirementId
            ? `RFQ-${quotation.requirementId.slice(0, 8).toUpperCase()}`
            : "Direct",
        ],
      ],
    },
    {
      title: "Commercial terms",
      rows: [
        ["Rate", `${quotation.rate} / ${quotation.rateUnit}`],
        [
          "Mobilization",
          quotation.mobilizationCharge != null
            ? formatCurrencyINR(quotation.mobilizationCharge)
            : "—",
        ],
        [
          "Demobilization",
          quotation.demobilizationCharge != null
            ? formatCurrencyINR(quotation.demobilizationCharge)
            : "—",
        ],
        [
          "Overtime rate",
          quotation.overtimeRate != null ? formatCurrencyINR(quotation.overtimeRate) : "—",
        ],
        ["Payment terms", quotation.paymentTerms ?? "—"],
        [
          "Minimum rental period",
          quotation.minimumRentalPeriodValue != null
            ? `${quotation.minimumRentalPeriodValue} ${quotation.minimumRentalPeriodUnit}(s)`
            : "—",
        ],
        ["GST terms", quotation.gstTerms ?? "—"],
        ["Validity", formatDate(quotation.validityDate)],
      ],
    },
    {
      title: "Operating terms",
      rows: [
        ["Operator scope", quotation.operatorScope?.replace(/_/g, " ") ?? "—"],
        ["Fuel scope", quotation.fuelScope ?? "—"],
        ["Accommodation scope", quotation.accommodationScope ?? "—"],
        ["Shift structure", quotation.shiftStructure ?? "—"],
        [
          "Working hours / days",
          quotation.workingHours != null || quotation.workingDaysPerWeek != null
            ? `${quotation.workingHours ?? "—"} hrs/shift, ${quotation.workingDaysPerWeek ?? "—"} days/week`
            : "—",
        ],
        ["Sunday condition", quotation.sundayCondition ?? "—"],
        ["Fuel norms", quotation.fuelNorms ?? "—"],
        [
          "Notice period",
          quotation.noticePeriodDays != null ? `${quotation.noticePeriodDays} days` : "—",
        ],
        ["De-hire terms", quotation.dehireTerms ?? "—"],
      ],
    },
    {
      title: "Terms & conditions",
      rows: [
        ["Special / site conditions", quotation.commercialNotes ?? "—"],
        ["Company-specific T&Cs", quotation.companyTerms ?? "—"],
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumbs={[
          { label: "Quotations", href: "/quotations" },
          { label: quotation.referenceNumber },
        ]}
        title={`Quotation ${quotation.referenceNumber}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {workOrderId && organizationId ? (
              <a
                href={apiClient.workOrderPrintUrl(organizationId, workOrderId)}
                target="_blank"
                rel="noreferrer"
              >
                <Button variant="secondary">Download PDF</Button>
              </a>
            ) : (
              <Button
                variant="secondary"
                disabled
                title="Available once the quotation is awarded and a Work Order exists"
              >
                Download PDF
              </Button>
            )}
            <Button variant="secondary" disabled title="Sharing isn't available yet">
              Share
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={quotation.status} map={QUOTATION_STATUS_MAP} />
        {quotation.renterOrganizationId && (
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
              <Link
                href={`/requirements/${quotation.requirementId}`}
                className="font-mono text-accent-text"
              >
                RFQ-{quotation.requirementId.slice(0, 8).toUpperCase()}
              </Link>
            </>
          )}{" "}
          · validity {formatDate(quotation.validityDate)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-panel border border-border bg-surface-sunk p-3.5 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-meta">
            Current rate
          </span>
          <span className="font-mono text-xl font-medium text-ink">{quotation.rate}</span>
          {delta && (
            <span
              className={[
                "text-[11px]",
                delta.tone === "success"
                  ? "text-success"
                  : delta.tone === "warning"
                    ? "text-warning"
                    : "text-meta",
              ].join(" ")}
            >
              {delta.amount === 0
                ? "unchanged from the opening offer"
                : `${delta.amount < 0 ? "down" : "up"} ${Math.abs(delta.amount)} from the opening offer`}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-meta">
            Rate unit
          </span>
          <span className="text-lg font-medium text-ink">per {quotation.rateUnit}</span>
          {quotation.shiftStructure && (
            <span className="text-[11px] text-meta-light">{quotation.shiftStructure}</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-meta">
            Contract value
          </span>
          <span className="font-mono text-lg font-medium text-ink">
            {value != null ? formatCurrencyINR(value) : "—"}
          </span>
          {quotation.mobilizationCharge != null && (
            <span className="text-[11px] text-meta-light">
              + {formatCurrencyINR(quotation.mobilizationCharge)} mobilization
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-meta">
            Machine
          </span>
          <span className="text-sm font-medium text-ink">{machineLabel ?? "—"}</span>
          <span className="font-mono text-[11px] text-meta-light">{machineAssetCode ?? "—"}</span>
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
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-meta">
                      {label}
                    </span>
                    <span className="text-sm text-ink">{value}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
          {organizationId && (
            <ScopeItemsCard
              organizationId={organizationId}
              quotationId={quotation.id}
              canEdit={isOwner && (quotation.status === "draft" || canNegotiate)}
            />
          )}
        </div>

        <div className="flex flex-col gap-3.5">
          <Card>
            {canAccept ? (
              <div className="flex flex-col gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-ink">Your decision</h2>
                  <p className="mt-1 text-xs text-meta">
                    {pendingFromCounterparty
                      ? `${counterpartyName} countered at ${decisionRate}/${decisionRateUnit}. Accepting records your acceptance; the rental company then awards it and the rental is created.`
                      : pendingOffer
                        ? `You countered at ${decisionRate}/${decisionRateUnit} — waiting for ${counterpartyName} to respond.`
                        : `${counterpartyName} sent ${decisionRate}/${decisionRateUnit}. Accepting records your acceptance; the rental company then awards it and the rental is created.`}
                  </p>
                </div>
                {!showCounterForm ? (
                  <div className="flex flex-col gap-2">
                    {(!pendingOffer || pendingFromCounterparty) && (
                      <Button onClick={() => void handleAction("accept")}>
                        Accept these terms
                      </Button>
                    )}
                    <Button variant="secondary" onClick={() => setShowCounterForm(true)}>
                      Send counter offer
                    </Button>
                    <Button
                      variant="tertiary"
                      className="text-danger"
                      onClick={() => void handleAction("reject")}
                    >
                      Decline quotation
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleOffer} className="flex flex-col gap-3">
                    <Input label="Rate" name="rate" type="number" step="0.01" required />
                    <Select
                      label="Unit"
                      name="rateUnit"
                      options={RATE_UNIT_OPTIONS}
                      defaultValue={decisionRateUnit}
                    />
                    <Input label="Notes" name="notes" />
                    <div className="flex gap-2">
                      <Button type="submit">Send counter offer</Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setShowCounterForm(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}
                <div className="flex gap-2 rounded-control bg-warning-bg px-3 py-2.5">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                  <span className="text-[11px] text-warning">
                    Any change to the terms after you accept clears your acceptance and it must be
                    given again.
                  </span>
                </div>
              </div>
            ) : isOwner ? (
              <div className="flex flex-col gap-3">
                <div>
                  <h2 className="mb-1 text-sm font-semibold text-ink">Actions</h2>
                  <div className="flex flex-col gap-2">
                    {quotation.status === "draft" && (
                      <Button onClick={() => void handleAction("send")}>Send</Button>
                    )}
                    {(quotation.status === "draft" ||
                      quotation.status === "sent" ||
                      quotation.status === "negotiating") && (
                      <Button variant="secondary" onClick={() => setShowEditTerms(true)}>
                        Edit terms
                      </Button>
                    )}
                    {(quotation.status === "draft" || quotation.status === "sent") && (
                      <Button variant="secondary" onClick={() => void handleAction("withdraw")}>
                        Withdraw
                      </Button>
                    )}
                    {canNegotiate && !needsAcceptance && (
                      <Button onClick={() => void handleAction("award")}>Award</Button>
                    )}
                    {canNegotiate && needsAcceptance && (
                      <p className="text-xs text-meta">Awaiting the Renter&rsquo;s acceptance.</p>
                    )}
                    {!canNegotiate && quotation.status !== "draft" && (
                      <p className="text-xs text-meta">
                        This quotation is {quotation.status} — no further action needed here.
                      </p>
                    )}
                  </div>
                </div>
                {canNegotiate &&
                  (!showCounterForm ? (
                    <Button variant="secondary" onClick={() => setShowCounterForm(true)}>
                      Send counter offer
                    </Button>
                  ) : (
                    <form onSubmit={handleOffer} className="flex flex-col gap-3">
                      <Input label="Rate" name="rate" type="number" step="0.01" required />
                      <Select
                        label="Unit"
                        name="rateUnit"
                        options={RATE_UNIT_OPTIONS}
                        defaultValue={decisionRateUnit}
                      />
                      <Input label="Notes" name="notes" />
                      <div className="flex gap-2">
                        <Button type="submit">Send counter offer</Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setShowCounterForm(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ))}
              </div>
            ) : (
              <div>
                <h2 className="mb-1 text-sm font-semibold text-ink">Status</h2>
                <p className="text-xs text-meta">
                  {organizationType === "renter" && quotation.renterAcceptedAt && canNegotiate
                    ? "You accepted — awaiting award."
                    : `This quotation is ${quotation.status}.`}
                </p>
                {!isOwner &&
                  organizationType === "renter" &&
                  canNegotiate &&
                  !quotation.renterAcceptedAt && (
                    <Button
                      variant="tertiary"
                      className="mt-2 text-danger"
                      onClick={() => void handleAction("reject")}
                    >
                      Decline quotation
                    </Button>
                  )}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-ink">Alternate dates</h2>
            {alternateDatesError && (
              <p className="mb-2 text-sm text-danger">{alternateDatesError}</p>
            )}
            {!canNegotiate ? (
              <p className="text-sm text-meta">
                Available once this quotation has been sent — start and end dates are locked to the
                requirement until then.
              </p>
            ) : quotation.alternateDateStatus === "pending" ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-ink">
                  {formatDate(quotation.proposedAlternateStartDate ?? "")} –{" "}
                  {quotation.proposedAlternateEndDate
                    ? formatDate(quotation.proposedAlternateEndDate)
                    : "open-ended"}
                </p>
                {quotation.alternateDateReason && (
                  <p className="text-xs text-meta">{quotation.alternateDateReason}</p>
                )}
                {!isOwner && organizationType === "renter" ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => void handleRespondToAlternateDates("accepted")}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void handleRespondToAlternateDates("rejected")}
                    >
                      Reject
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-meta">Waiting for {counterpartyName} to respond.</p>
                )}
              </div>
            ) : isOwner ? (
              !showAlternateDatesForm ? (
                <Button variant="secondary" onClick={() => setShowAlternateDatesForm(true)}>
                  Propose alternate dates
                </Button>
              ) : (
                <form onSubmit={handleProposeAlternateDates} className="flex flex-col gap-3">
                  <Input label="Start date" name="startDate" type="date" required />
                  <Input label="End date (leave blank if open-ended)" name="endDate" type="date" />
                  <Input label="Reason" name="reason" />
                  <div className="flex gap-2">
                    <Button type="submit">Propose</Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowAlternateDatesForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )
            ) : (
              <p className="text-sm text-meta">No alternate dates proposed.</p>
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
                          {offer.offeredByOrganizationId === organizationId
                            ? "You"
                            : counterpartyName}
                        </span>
                        <span className="ml-auto text-[11px] text-meta-light">
                          {formatRelativeTime(offer.createdAt)}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-base font-medium text-ink">
                          {offer.rate}
                        </span>
                        <span className="text-[11px] text-meta-light">/ {offer.rateUnit}</span>
                        <StatusBadge
                          status={offer.status}
                          map={OFFER_STATUS_MAP}
                          className="ml-auto"
                        />
                      </div>
                      {offer.notes && <span className="text-[11px] text-meta">{offer.notes}</span>}
                      {offer.status === "pending" &&
                        offer.offeredByOrganizationId !== organizationId && (
                          <Button
                            size="sm"
                            className="mt-1 w-fit"
                            onClick={() => void handleAcceptOffer(offer.id)}
                          >
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

      {organizationId && (
        <EditQuotationTermsDialog
          open={showEditTerms}
          onClose={() => setShowEditTerms(false)}
          organizationId={organizationId}
          quotation={quotation}
          onUpdated={(updated) =>
            setData((prev) => (prev ? { ...prev, quotation: updated } : prev))
          }
        />
      )}
    </div>
  );
}
