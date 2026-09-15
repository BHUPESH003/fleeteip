"use client";

import type { AuctionDetail } from "@fleetip/contracts/auction";
import type { ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
import type { Organization } from "@fleetip/contracts/organization";
import type { ResponsibleParty } from "@fleetip/contracts/quotation";
import type { RateUnit } from "@fleetip/contracts/rental";
import type { Requirement } from "@fleetip/contracts/rfq";
import { Button, Dialog, EmptyState, Input, LoadingState, Select } from "@fleetip/ui";
import { type FormEvent, useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { todayIsoDate } from "../../../lib/format";

const RATE_UNIT_OPTIONS = [
  { value: "shift", label: "Per shift" },
  { value: "day", label: "Per day" },
  { value: "week", label: "Per week" },
  { value: "month", label: "Per month" },
];

const RESPONSIBLE_PARTY_OPTIONS = [
  { value: "", label: "Not specified" },
  { value: "client", label: "Client scope" },
  { value: "company", label: "Company scope" },
];

export interface CreateQuotationDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  requirementIdParam: string | null;
  sourceAuctionIdParam: string | null;
  onCreated: () => void;
}

function RequirementContext({
  requirement,
  subcategoryName,
  renterName,
}: {
  requirement: Requirement;
  subcategoryName: string | null;
  renterName: string;
}) {
  const reference = `RFQ-${requirement.id.slice(0, 8).toUpperCase()}`;
  const duration =
    requirement.expectedDurationValue && requirement.expectedDurationUnit
      ? `${requirement.expectedDurationValue} ${requirement.expectedDurationUnit}(s)`
      : "—";

  return (
    <div className="rounded-panel border border-info/25 bg-info-bg p-4">
      <p className="mb-3 text-sm font-medium text-info">
        Quoting against requirement {reference} — this quotation stays tied to it.
      </p>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        {[
          ["Renter", renterName],
          ["Equipment", subcategoryName ?? "—"],
          ["Quantity", String(requirement.quantity)],
          ["Capacity", requirement.capacity ? `${requirement.capacity} ${requirement.capacityUnit ?? ""}` : "—"],
          ["Project", requirement.projectName ?? "—"],
          ["Location", requirement.projectLocation ?? "—"],
          ["Requested start", requirement.requestedStartDate],
          ["Duration needed", duration],
          ["Requirement valid until", requirement.validityDate],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-info/80">{label}</dt>
            <dd className="text-info">{value}</dd>
          </div>
        ))}
      </dl>
      {requirement.notes && <p className="mt-3 text-sm text-info">Notes: {requirement.notes}</p>}
    </div>
  );
}

export function CreateQuotationDialog({
  open,
  onClose,
  organizationId,
  requirementIdParam,
  sourceAuctionIdParam,
  onCreated,
}: CreateQuotationDialogProps) {
  const isFromRequirement = Boolean(requirementIdParam);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [renterOrganizations, setRenterOrganizations] = useState<Organization[]>([]);
  const [requirement, setRequirement] = useState<Requirement | null>(null);
  // This rental company's own "interested" response to the requirement, if
  // any — recorded on the created quotation as quotationResponseId so the
  // Renter's requirement page can link back to it, and so this response
  // drops off the Quotations page's "Requested" filter once formalized.
  const [responseId, setResponseId] = useState<string | null>(null);
  const [subcategoryName, setSubcategoryName] = useState<string | null>(null);
  const [prefilledRate, setPrefilledRate] = useState<number | null>(null);
  const [customerMode, setCustomerMode] = useState<"external" | "renter">(
    isFromRequirement ? "renter" : "external",
  );
  const [loadingContext, setLoadingContext] = useState(isFromRequirement);
  const [loadingAuctionPrefill, setLoadingAuctionPrefill] = useState(Boolean(sourceAuctionIdParam));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void apiClient.listMachines(organizationId).then((list) => setMachines(list as Machine[]));
    void apiClient
      .listRenterOrganizations(organizationId)
      .then((list) => setRenterOrganizations(list as Organization[]));
  }, [open, organizationId]);

  useEffect(() => {
    if (!open || !requirementIdParam) return;
    // This dialog stays mounted (only `open` toggles) — a notification for
    // a *different* requirement arriving after this effect already settled
    // to false once needs to flip it back to true, not just rely on the
    // initializer above, which only ran at first mount.
    setLoadingContext(true);
    setResponseId(null);
    void (async () => {
      try {
        const req = (await apiClient.getRequirementForDiscovery(
          organizationId,
          requirementIdParam,
        )) as Requirement;
        setRequirement(req);
        const categories = (await apiClient.listProductCategories()) as ProductCategory[];
        const subcategoryLists = await Promise.all(
          categories.map((c) => apiClient.listProductSubcategories(c.id)),
        );
        const match = (subcategoryLists.flat() as ProductSubcategory[]).find(
          (s) => s.id === req.productSubcategoryId,
        );
        setSubcategoryName(match?.name ?? null);
        // Best-effort — creating a quotation without ever having submitted
        // an "interested" response first (e.g. straight from Open Market)
        // is valid; there's just nothing to link back to in that case.
        try {
          const response = (await apiClient.getMyResponse(
            organizationId,
            requirementIdParam,
          )) as { id: string };
          setResponseId(response.id);
        } catch {
          // No response on file for this requirement — fine.
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load the requirement");
      } finally {
        setLoadingContext(false);
      }
    })();
  }, [open, organizationId, requirementIdParam]);

  useEffect(() => {
    if (!open || !sourceAuctionIdParam) return;
    // Same reasoning as loadingContext above — this dialog stays mounted.
    setLoadingAuctionPrefill(true);
    void (async () => {
      try {
        const detail = (await apiClient.getAuctionDetail(
          organizationId,
          sourceAuctionIdParam,
        )) as AuctionDetail;
        const ownParticipantId = detail.participants[0]?.id;
        const ownBids = detail.bids.filter((bid) => bid.participantId === ownParticipantId);
        const lastBid = ownBids[ownBids.length - 1];
        if (lastBid) setPrefilledRate(lastBid.amount);
      } catch {
        // Best-effort pre-fill only — the form still works without it.
      } finally {
        setLoadingAuctionPrefill(false);
      }
    })();
  }, [open, organizationId, sourceAuctionIdParam]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const endDate = form.get("endDate");
    const startDate = String(form.get("startDate"));
    const validityDate = String(form.get("validityDate"));
    if (endDate && String(endDate) < startDate) {
      setError("End date cannot be before the start date");
      return;
    }
    if (validityDate > startDate) {
      setError("Valid until date cannot be after the start date");
      return;
    }
    const machineIds = form.getAll("machineId").map(String);
    if (machineIds.length === 0) {
      setError("Select at least one machine");
      return;
    }
    const commonFields = {
      requirementId: requirementIdParam ?? undefined,
      quotationResponseId: responseId ?? undefined,
      sourceAuctionId: sourceAuctionIdParam ?? undefined,
      ...(customerMode === "renter"
        ? { renterOrganizationId: String(form.get("renterOrganizationId")) }
        : { clientSnapshot: { name: String(form.get("clientName")) } }),
      startDate,
      endDate: endDate ? String(endDate) : undefined,
      rate: Number(form.get("rate")),
      rateUnit: (lockedRateUnit ?? String(form.get("rateUnit"))) as RateUnit,
      validityDate,
      fuelScope: form.get("fuelScope") ? (String(form.get("fuelScope")) as ResponsibleParty) : undefined,
      accommodationScope: form.get("accommodationScope")
        ? (String(form.get("accommodationScope")) as ResponsibleParty)
        : undefined,
      workingHours: form.get("workingHours") ? Number(form.get("workingHours")) : undefined,
      workingDaysPerWeek: form.get("workingDaysPerWeek")
        ? Number(form.get("workingDaysPerWeek"))
        : undefined,
      minimumRentalPeriodValue: form.get("minimumRentalPeriodValue")
        ? Number(form.get("minimumRentalPeriodValue"))
        : undefined,
      minimumRentalPeriodUnit: form.get("minimumRentalPeriodUnit")
        ? (String(form.get("minimumRentalPeriodUnit")) as RateUnit)
        : undefined,
      gstTerms: form.get("gstTerms") ? String(form.get("gstTerms")) : undefined,
      commercialNotes: form.get("commercialNotes") ? String(form.get("commercialNotes")) : undefined,
      companyTerms: form.get("companyTerms") ? String(form.get("companyTerms")) : undefined,
    };

    // A requirement can ask for more than one machine (quantity > 1) — one
    // quotation per machine is what the data model already supports
    // (commercial_quotations has no unique constraint on requirementId
    // alone), the dialog just used to only ever let you pick one. Same
    // terms across all selected machines: the Renter asked for N of the
    // same equipment type, not N different deals.
    const failures: string[] = [];
    for (const machineId of machineIds) {
      try {
        await apiClient.createQuotation(organizationId, { ...commonFields, machineId });
      } catch (err) {
        const assetCode = activeMachines.find((m) => m.id === machineId)?.assetCode ?? machineId;
        failures.push(`${assetCode}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }
    onCreated();
    if (failures.length === 0) {
      formElement.reset();
      onClose();
    } else {
      setError(
        `Created ${machineIds.length - failures.length} of ${machineIds.length} quotations. Failed — ${failures.join("; ")}`,
      );
    }
  }

  // Locked to the requirement's own unit when it has one — see
  // CommercialQuotationService.createQuotation, which enforces this
  // server-side regardless; this just avoids showing a picker whose choice
  // would be silently overridden.
  const lockedRateUnit = requirement?.expectedDurationUnit ?? null;
  const activeMachines = machines.filter((m) => m.status === "active");
  const renterName = (id: string) =>
    renterOrganizations.find((o) => o.id === id)?.name ?? `Renter ${id.slice(0, 8)}…`;

  return (
    <Dialog open={open} onClose={onClose} title="Create a quotation">
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {loadingContext || loadingAuctionPrefill ? (
        <LoadingState label="Loading requirement…" />
      ) : activeMachines.length === 0 ? (
        <EmptyState title="No available machines" description="Register a machine and mark it active before quoting." />
      ) : (
        <form key={requirement?.id ?? "no-requirement"} onSubmit={handleCreate} className="flex flex-col gap-4 text-left">
          {requirement && (
            <RequirementContext
              requirement={requirement}
              subcategoryName={subcategoryName}
              renterName={renterName(requirement.renterOrganizationId)}
            />
          )}

          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-meta">Customer</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-ink-muted">
                  Machine{requirement && requirement.quantity > 1 ? ` — needs ${requirement.quantity}` : ""}
                </span>
                <div className="flex max-h-[136px] flex-col gap-1 overflow-y-auto rounded-control border border-border-strong px-2.5 py-2">
                  {activeMachines.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 text-sm text-ink">
                      <input type="checkbox" name="machineId" value={m.id} />
                      {m.assetCode}
                    </label>
                  ))}
                </div>
                {requirement && requirement.quantity > 1 && (
                  <span className="text-[11px] text-meta">
                    Select more than one to quote several machines in one go — one quotation is created per
                    machine selected, all with the same terms below.
                  </span>
                )}
              </div>
              {!isFromRequirement && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-ink-muted">Customer type</span>
                  <div className="flex gap-4 text-sm text-ink-muted">
                    <label className="flex items-center gap-1.5">
                      <input type="radio" checked={customerMode === "external"} onChange={() => setCustomerMode("external")} />
                      External client
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="radio" checked={customerMode === "renter"} onChange={() => setCustomerMode("renter")} />
                      FleetIP Renter
                    </label>
                  </div>
                </div>
              )}
            </div>
            {isFromRequirement && requirement ? (
              <div>
                <span className="mb-1 block text-xs font-medium text-ink-muted">Renter organization</span>
                <p className="rounded-control border border-border bg-surface-sunk px-2.5 py-2 text-sm text-ink-muted">
                  {renterName(requirement.renterOrganizationId)} (locked to this requirement)
                </p>
                <input type="hidden" name="renterOrganizationId" value={requirement.renterOrganizationId} />
              </div>
            ) : customerMode === "external" ? (
              <Input label="Client name" name="clientName" required />
            ) : (
              <Select
                label="Renter organization"
                name="renterOrganizationId"
                required
                options={[
                  { value: "", label: "Select a renter" },
                  ...renterOrganizations.map((o) => ({ value: o.id, label: o.name })),
                ]}
              />
            )}
          </div>

          <div className="flex flex-col gap-1 border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-meta">Schedule &amp; rate</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Start date"
                name="startDate"
                type="date"
                min={todayIsoDate()}
                required
                defaultValue={requirement?.requestedStartDate}
              />
              <Input label="End date (leave blank if open-ended)" name="endDate" type="date" />
              <Input label="Rate" name="rate" type="number" step="0.01" required defaultValue={prefilledRate ?? undefined} />
              {lockedRateUnit ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-ink-muted">Rate unit</span>
                  <p className="flex h-[34px] items-center text-sm text-ink capitalize">{lockedRateUnit}</p>
                  <input type="hidden" name="rateUnit" value={lockedRateUnit} />
                </div>
              ) : (
                <Select label="Rate unit" name="rateUnit" required options={RATE_UNIT_OPTIONS} />
              )}
              <Input
                label="Valid until"
                name="validityDate"
                type="date"
                min={todayIsoDate()}
                required
                defaultValue={requirement?.validityDate}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1 border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-meta">
              Working terms &amp; responsibilities
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input label="Working hours / shift" name="workingHours" type="number" step="0.5" />
              <Input label="Working days / week" name="workingDaysPerWeek" type="number" min={1} max={7} />
              <Select label="Fuel scope" name="fuelScope" options={RESPONSIBLE_PARTY_OPTIONS} />
              <Select label="Accommodation scope" name="accommodationScope" options={RESPONSIBLE_PARTY_OPTIONS} />
              <Input label="Minimum rental period" name="minimumRentalPeriodValue" type="number" min={1} />
              <Select label="Period unit" name="minimumRentalPeriodUnit" options={RATE_UNIT_OPTIONS} />
            </div>
            <Input label="GST terms" name="gstTerms" placeholder="e.g. GST extra @ 18%" />
          </div>

          <div className="flex flex-col gap-1 border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-meta">
              Terms &amp; conditions
            </p>
            <Input label="Special / site conditions" name="commercialNotes" />
            <Input label="Company-specific T&Cs" name="companyTerms" />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Create quotation</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
