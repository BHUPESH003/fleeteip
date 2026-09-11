"use client";

import type { Machine } from "@fleetip/contracts/equipment";
import type {
  CommercialQuotation,
  CommercialQuotationStatus,
  QuotationOffer,
} from "@fleetip/contracts/quotation";
import type { RateUnit } from "@fleetip/contracts/rental";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Select,
} from "@fleetip/ui";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { useSession } from "../../../lib/session-context";

const STATUS_TONE: Record<CommercialQuotationStatus, "success" | "warning" | "neutral" | "danger"> =
  {
    draft: "neutral",
    sent: "warning",
    negotiating: "warning",
    awarded: "success",
    rejected: "danger",
    expired: "danger",
    withdrawn: "danger",
  };

const RATE_UNIT_OPTIONS = [
  { value: "shift", label: "Per shift" },
  { value: "day", label: "Per day" },
  { value: "week", label: "Per week" },
  { value: "month", label: "Per month" },
];

function QuotationRow({
  quotation,
  organizationId,
  organizationType,
  machinesById,
  onChanged,
}: {
  quotation: CommercialQuotation;
  organizationId: string;
  organizationType: "renter" | "rental_company";
  machinesById: Record<string, Machine>;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [offers, setOffers] = useState<QuotationOffer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const isOwner = quotation.rentalCompanyOrganizationId === organizationId;

  async function loadOffers() {
    try {
      setOffers((await apiClient.listOffers(organizationId, quotation.id)) as QuotationOffer[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load offers");
    }
  }

  async function toggle() {
    setExpanded((prev) => !prev);
    if (!expanded) await loadOffers();
  }

  async function handleOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiClient.makeOffer(organizationId, quotation.id, {
        rate: Number(form.get("rate")),
        rateUnit: String(form.get("rateUnit")) as RateUnit,
        startDate: quotation.startDate,
        notes: form.get("notes") ? String(form.get("notes")) : undefined,
      });
      event.currentTarget.reset();
      await loadOffers();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit offer");
    }
  }

  async function handleAccept(offerId: string) {
    setError(null);
    try {
      await apiClient.acceptOffer(organizationId, quotation.id, offerId);
      await loadOffers();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept offer");
    }
  }

  async function handleAction(action: "send" | "withdraw" | "reject" | "award") {
    setError(null);
    try {
      if (action === "send") await apiClient.sendQuotation(organizationId, quotation.id);
      if (action === "withdraw") await apiClient.withdrawQuotation(organizationId, quotation.id);
      if (action === "reject") await apiClient.rejectQuotation(organizationId, quotation.id);
      if (action === "award") await apiClient.awardQuotation(organizationId, quotation.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} quotation`);
    }
  }

  const customer = quotation.clientSnapshot
    ? quotation.clientSnapshot.name
    : `Renter ${quotation.renterOrganizationId?.slice(0, 8)}…`;
  const canNegotiate = quotation.status === "sent" || quotation.status === "negotiating";

  return (
    <>
      <tr className="border-b border-gray-100">
        <td className="py-2 pr-4 font-medium text-gray-900">
          {quotation.referenceNumber}
          <span className="block text-xs font-normal text-gray-500 sm:hidden">{customer}</span>
        </td>
        <td className="hidden py-2 pr-4 sm:table-cell">
          {machinesById[quotation.machineId]?.assetCode ?? "—"}
        </td>
        <td className="hidden py-2 pr-4 sm:table-cell">{customer}</td>
        <td className="py-2 pr-4">
          {quotation.rate} / {quotation.rateUnit}
        </td>
        <td className="py-2 pr-4">
          <Badge tone={STATUS_TONE[quotation.status]}>{quotation.status}</Badge>
        </td>
        <td className="py-2 pr-4">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-2">
            <button
              onClick={() => void toggle()}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              {expanded ? "Hide" : "Details"}
            </button>
            {isOwner && quotation.status === "draft" && (
              <button
                onClick={() => void handleAction("send")}
                className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                Send
              </button>
            )}
            {isOwner && (quotation.status === "draft" || quotation.status === "sent") && (
              <button
                onClick={() => void handleAction("withdraw")}
                className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                Withdraw
              </button>
            )}
            {isOwner && canNegotiate && (
              <button
                onClick={() => void handleAction("award")}
                className="rounded-md border border-green-300 bg-green-50 px-2 py-1 text-xs text-green-700 hover:bg-green-100"
              >
                Award
              </button>
            )}
            {!isOwner && organizationType === "renter" && canNegotiate && (
              <button
                onClick={() => void handleAction("reject")}
                className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                Reject
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-100 bg-gray-50">
          <td colSpan={6} className="px-4 py-4">
            {error && <ErrorState message={error} />}
            <p className="mb-2 text-sm text-gray-700">
              {quotation.startDate} → {quotation.endDate ?? "open-ended"} · Validity{" "}
              {quotation.validityDate}
            </p>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Negotiation</h3>
            {offers.length === 0 ? (
              <p className="mb-3 text-sm text-gray-500">No offers yet.</p>
            ) : (
              <ul className="mb-3 flex flex-col gap-2">
                {offers.map((offer) => (
                  <li key={offer.id} className="flex items-center gap-3 text-sm">
                    <Badge
                      tone={
                        offer.status === "accepted"
                          ? "success"
                          : offer.status === "pending"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {offer.status}
                    </Badge>
                    <span>
                      {offer.rate} / {offer.rateUnit} from{" "}
                      {offer.offeredByOrganizationId === organizationId ? "you" : "the other side"}
                    </span>
                    {offer.status === "pending" &&
                      offer.offeredByOrganizationId !== organizationId && (
                        <button
                          onClick={() => void handleAccept(offer.id)}
                          className="rounded-md border border-green-300 bg-green-50 px-2 py-0.5 text-xs text-green-700 hover:bg-green-100"
                        >
                          Accept
                        </button>
                      )}
                  </li>
                ))}
              </ul>
            )}
            {canNegotiate && (
              <form
                onSubmit={(event) => void handleOffer(event)}
                className="flex flex-wrap items-end gap-3"
              >
                <Input label="Rate" name="rate" type="number" step="0.01" required />
                <Select label="Unit" name="rateUnit" options={RATE_UNIT_OPTIONS} />
                <Input label="Notes" name="notes" />
                <Button type="submit">Make offer</Button>
              </form>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function CreateQuotationForm({
  organizationId,
  requirementIdParam,
  onCreated,
}: {
  organizationId: string;
  requirementIdParam: string | null;
  onCreated: () => void;
}) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [customerMode, setCustomerMode] = useState<"external" | "renter">("external");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiClient.listMachines(organizationId).then((list) => setMachines(list as Machine[]));
  }, [organizationId]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const endDate = form.get("endDate");

    try {
      await apiClient.createQuotation(organizationId, {
        machineId: String(form.get("machineId")),
        requirementId: requirementIdParam ?? undefined,
        ...(customerMode === "renter"
          ? { renterOrganizationId: String(form.get("renterOrganizationId")) }
          : { clientSnapshot: { name: String(form.get("clientName")) } }),
        startDate: String(form.get("startDate")),
        endDate: endDate ? String(endDate) : undefined,
        rate: Number(form.get("rate")),
        rateUnit: String(form.get("rateUnit")) as RateUnit,
        validityDate: String(form.get("validityDate")),
        commercialNotes: form.get("commercialNotes")
          ? String(form.get("commercialNotes"))
          : undefined,
      });
      formElement.reset();
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create quotation");
    }
  }

  const activeMachines = machines.filter((m) => m.status === "active");

  return (
    <Card className="mb-8 mt-4">
      <h2 className="mb-4 text-lg font-medium text-gray-900">Create a quotation</h2>
      {error && <ErrorState message={error} />}
      {activeMachines.length === 0 ? (
        <EmptyState
          title="No available machines"
          description="Register a machine and mark it active before quoting."
        />
      ) : (
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Machine"
              name="machineId"
              required
              options={[
                { value: "", label: "Select a machine" },
                ...activeMachines.map((m) => ({ value: m.id, label: m.assetCode })),
              ]}
            />
            <div>
              <span className="mb-1 block text-sm font-medium text-gray-700">Customer</span>
              <div className="flex gap-4 pt-2 text-sm text-gray-700">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={customerMode === "external"}
                    onChange={() => setCustomerMode("external")}
                  />
                  External client
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={customerMode === "renter"}
                    onChange={() => setCustomerMode("renter")}
                  />
                  FleetIP Renter
                </label>
              </div>
            </div>
          </div>
          {customerMode === "external" ? (
            <Input label="Client name" name="clientName" required />
          ) : (
            <Input label="Renter organization ID" name="renterOrganizationId" required />
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Start date" name="startDate" type="date" required />
            <Input label="End date (leave blank if open-ended)" name="endDate" type="date" />
            <Input label="Rate" name="rate" type="number" step="0.01" required />
            <Select label="Rate unit" name="rateUnit" required options={RATE_UNIT_OPTIONS} />
            <Input label="Valid until" name="validityDate" type="date" required />
          </div>
          <Input label="Commercial notes" name="commercialNotes" />
          <div>
            <Button type="submit">Create quotation</Button>
          </div>
        </form>
      )}
    </Card>
  );
}

export default function QuotationsPage() {
  const { currentMembership } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  const searchParams = useSearchParams();
  const requirementIdParam = searchParams.get("requirementId");

  const [quotations, setQuotations] = useState<CommercialQuotation[]>([]);
  const [machinesById, setMachinesById] = useState<Record<string, Machine>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!organizationId) return;
    try {
      setQuotations((await apiClient.listQuotations(organizationId)) as CommercialQuotation[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quotations");
    }
  }

  useEffect(() => {
    if (!organizationId) return;
    void (async () => {
      try {
        setQuotations((await apiClient.listQuotations(organizationId)) as CommercialQuotation[]);
        if (organizationType === "rental_company") {
          const machines = (await apiClient.listMachines(organizationId)) as Machine[];
          setMachinesById(Object.fromEntries(machines.map((m) => [m.id, m])));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load quotations");
      } finally {
        setLoading(false);
      }
    })();
  }, [organizationId, organizationType]);

  if (!organizationId || !organizationType) return null;

  return (
    <>
      <PageHeader
        title="Quotations"
        description="Formal commercial offers, negotiation, and award."
      />
      {loading ? (
        <LoadingState label="Loading quotations…" />
      ) : (
        <>
          {error && <ErrorState message={error} />}
          {organizationType === "rental_company" && (
            <CreateQuotationForm
              organizationId={organizationId}
              requirementIdParam={requirementIdParam}
              onCreated={() => void refresh()}
            />
          )}
          <Card>
            <h2 className="mb-4 text-lg font-medium text-gray-900">
              {organizationType === "rental_company" ? "Your quotations" : "Quotations for you"}
            </h2>
            {quotations.length === 0 ? (
              <EmptyState title="No quotations yet" description="Nothing to show yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500">
                      <th className="py-2 pr-4 font-medium">Reference</th>
                      <th className="hidden py-2 pr-4 font-medium sm:table-cell">Machine</th>
                      <th className="hidden py-2 pr-4 font-medium sm:table-cell">Customer</th>
                      <th className="py-2 pr-4 font-medium">Rate</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotations.map((quotation) => (
                      <QuotationRow
                        key={quotation.id}
                        quotation={quotation}
                        organizationId={organizationId}
                        organizationType={organizationType}
                        machinesById={machinesById}
                        onChanged={() => void refresh()}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
