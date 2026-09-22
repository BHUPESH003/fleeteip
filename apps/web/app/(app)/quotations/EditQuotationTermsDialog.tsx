"use client";

import type {
  CommercialQuotation,
  ResponsibleParty,
  UpdateCommercialQuotationTermsRequest,
} from "@fleetip/contracts/quotation";
import type { OperatorScope, RateUnit } from "@fleetip/contracts/rental";
import { Button, Dialog, Input, Select } from "@fleetip/ui";
import { type FormEvent, useState } from "react";
import { apiClient } from "../../../lib/api-client";

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

const OPERATOR_SCOPE_OPTIONS = [
  { value: "", label: "Not specified" },
  { value: "with_operator", label: "With operator" },
  { value: "without_operator", label: "Without operator" },
];

export interface EditQuotationTermsDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  quotation: CommercialQuotation;
  onUpdated: (updated: CommercialQuotation) => void;
}

// The updateTerms backend deliberately excludes party/machine/dates/rate
// (those change the negotiation itself, via QuotationOffer or the alternate-
// dates request) — this dialog only ever edits the same field set
// updateCommercialQuotationTermsRequestSchema allows.
export function EditQuotationTermsDialog({
  open,
  onClose,
  organizationId,
  quotation,
  onUpdated,
}: EditQuotationTermsDialogProps) {
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const updates: UpdateCommercialQuotationTermsRequest = {
      mobilizationCharge: form.get("mobilizationCharge")
        ? Number(form.get("mobilizationCharge"))
        : undefined,
      demobilizationCharge: form.get("demobilizationCharge")
        ? Number(form.get("demobilizationCharge"))
        : undefined,
      overtimeRate: form.get("overtimeRate") ? Number(form.get("overtimeRate")) : undefined,
      paymentTerms: form.get("paymentTerms") ? String(form.get("paymentTerms")) : undefined,
      shiftStructure: form.get("shiftStructure") ? String(form.get("shiftStructure")) : undefined,
      sundayCondition: form.get("sundayCondition") ? String(form.get("sundayCondition")) : undefined,
      fuelNorms: form.get("fuelNorms") ? String(form.get("fuelNorms")) : undefined,
      fuelScope: form.get("fuelScope") ? (String(form.get("fuelScope")) as ResponsibleParty) : undefined,
      dehireTerms: form.get("dehireTerms") ? String(form.get("dehireTerms")) : undefined,
      operatorScope: form.get("operatorScope")
        ? (String(form.get("operatorScope")) as OperatorScope)
        : undefined,
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
      noticePeriodDays: form.get("noticePeriodDays")
        ? Number(form.get("noticePeriodDays"))
        : undefined,
      commercialNotes: form.get("commercialNotes") ? String(form.get("commercialNotes")) : undefined,
      companyTerms: form.get("companyTerms") ? String(form.get("companyTerms")) : undefined,
    };
    try {
      const updated = (await apiClient.updateQuotationTerms(
        organizationId,
        quotation.id,
        updates,
      )) as CommercialQuotation;
      onUpdated(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update terms");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Edit quotation terms">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-meta">
            Working terms &amp; responsibilities
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input
              label="Mobilization charge"
              name="mobilizationCharge"
              type="number"
              step="0.01"
              min={0}
              defaultValue={quotation.mobilizationCharge ?? undefined}
            />
            <Input
              label="Demobilization charge"
              name="demobilizationCharge"
              type="number"
              step="0.01"
              min={0}
              defaultValue={quotation.demobilizationCharge ?? undefined}
            />
            <Input
              label="Overtime rate"
              name="overtimeRate"
              type="number"
              step="0.01"
              min={0}
              defaultValue={quotation.overtimeRate ?? undefined}
            />
            <Input
              label="Working hours / shift"
              name="workingHours"
              type="number"
              step="0.5"
              defaultValue={quotation.workingHours ?? undefined}
            />
            <Input
              label="Working days / week"
              name="workingDaysPerWeek"
              type="number"
              min={1}
              max={7}
              defaultValue={quotation.workingDaysPerWeek ?? undefined}
            />
            <Select
              label="Operator"
              name="operatorScope"
              options={OPERATOR_SCOPE_OPTIONS}
              defaultValue={quotation.operatorScope ?? ""}
            />
            <Select
              label="Fuel scope"
              name="fuelScope"
              options={RESPONSIBLE_PARTY_OPTIONS}
              defaultValue={quotation.fuelScope ?? ""}
            />
            <Select
              label="Accommodation scope"
              name="accommodationScope"
              options={RESPONSIBLE_PARTY_OPTIONS}
              defaultValue={quotation.accommodationScope ?? ""}
            />
            <Input
              label="Minimum rental period"
              name="minimumRentalPeriodValue"
              type="number"
              min={1}
              defaultValue={quotation.minimumRentalPeriodValue ?? undefined}
            />
            <Select
              label="Period unit"
              name="minimumRentalPeriodUnit"
              options={RATE_UNIT_OPTIONS}
              defaultValue={quotation.minimumRentalPeriodUnit ?? ""}
            />
            <Input
              label="Notice period (days)"
              name="noticePeriodDays"
              type="number"
              min={0}
              defaultValue={quotation.noticePeriodDays ?? undefined}
            />
          </div>
          <Input
            label="GST terms"
            name="gstTerms"
            placeholder="e.g. GST extra @ 18%"
            defaultValue={quotation.gstTerms ?? undefined}
          />
          <Input
            label="Payment terms"
            name="paymentTerms"
            defaultValue={quotation.paymentTerms ?? undefined}
          />
          <Input
            label="Shift structure"
            name="shiftStructure"
            defaultValue={quotation.shiftStructure ?? undefined}
          />
          <Input
            label="Sunday condition"
            name="sundayCondition"
            defaultValue={quotation.sundayCondition ?? undefined}
          />
          <Input
            label="Fuel norms"
            name="fuelNorms"
            defaultValue={quotation.fuelNorms ?? undefined}
          />
          <Input
            label="De-hire terms"
            name="dehireTerms"
            defaultValue={quotation.dehireTerms ?? undefined}
          />
        </div>

        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-meta">
            Terms &amp; conditions
          </p>
          <Input
            label="Special / site conditions"
            name="commercialNotes"
            defaultValue={quotation.commercialNotes ?? undefined}
          />
          <Input
            label="Company-specific T&Cs"
            name="companyTerms"
            defaultValue={quotation.companyTerms ?? undefined}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save terms</Button>
        </div>
      </form>
    </Dialog>
  );
}
