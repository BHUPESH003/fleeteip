"use client";

import type {
  CommercialQuotation,
  ResponsibleParty,
  UpdateCommercialQuotationTermsRequest,
} from "@fleetip/contracts/quotation";
import type { OperatorScope, RateUnit } from "@fleetip/contracts/rental";
import { Alert, Button, Dialog, FormBanner, FormSection, Input, Select, Textarea, useToast } from "@fleetip/ui";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { apiClient } from "../../../lib/api-client";
import { OFFLINE_HINT } from "../../../lib/errors";
import { formatDateRange, formatRate } from "../../../lib/format";
import { useForm } from "../../../lib/form";
import { DURATION_UNIT_OPTIONS } from "../requirements/shared";
import { OPERATOR_OPTIONS, RESPONSIBLE_PARTY_OPTIONS } from "./shared";

export interface EditQuotationTermsDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  quotation: CommercialQuotation;
  onUpdated: (updated: CommercialQuotation) => void;
}

type TextKey = "paymentTerms" | "shiftStructure" | "sundayCondition" | "fuelNorms" | "dehireTerms" | "gstTerms" | "commercialNotes" | "companyTerms";
type NumberKey =
  | "mobilizationCharge"
  | "demobilizationCharge"
  | "overtimeRate"
  | "workingHours"
  | "workingDaysPerWeek"
  | "minimumRentalPeriodValue"
  | "noticePeriodDays";
type ChoiceKey = "operatorScope" | "fuelScope" | "accommodationScope" | "minimumRentalPeriodUnit";
type Key = TextKey | NumberKey | ChoiceKey;

const TEXT_KEYS: TextKey[] = ["paymentTerms", "shiftStructure", "sundayCondition", "fuelNorms", "dehireTerms", "gstTerms", "commercialNotes", "companyTerms"];
const NUMBER_KEYS: NumberKey[] = [
  "mobilizationCharge",
  "demobilizationCharge",
  "overtimeRate",
  "workingHours",
  "workingDaysPerWeek",
  "minimumRentalPeriodValue",
  "noticePeriodDays",
];
const CHOICE_KEYS: ChoiceKey[] = ["operatorScope", "fuelScope", "accommodationScope", "minimumRentalPeriodUnit"];
const FIELD_ORDER: Key[] = [
  "mobilizationCharge",
  "demobilizationCharge",
  "overtimeRate",
  "minimumRentalPeriodValue",
  "minimumRentalPeriodUnit",
  "noticePeriodDays",
  "gstTerms",
  "paymentTerms",
  "operatorScope",
  "workingHours",
  "workingDaysPerWeek",
  "fuelScope",
  "accommodationScope",
  "shiftStructure",
  "sundayCondition",
  "fuelNorms",
  "dehireTerms",
  "commercialNotes",
  "companyTerms",
];

const MAX: Record<TextKey, number> = {
  paymentTerms: 1000,
  shiftStructure: 500,
  sundayCondition: 500,
  fuelNorms: 500,
  dehireTerms: 1000,
  gstTerms: 500,
  commercialNotes: 2000,
  companyTerms: 2000,
};

const WORD: Record<Key, string> = {
  paymentTerms: "payment terms",
  shiftStructure: "shift structure",
  sundayCondition: "Sunday condition",
  fuelNorms: "fuel norms",
  dehireTerms: "dehire terms",
  gstTerms: "GST terms",
  commercialNotes: "site conditions",
  companyTerms: "company terms",
  mobilizationCharge: "mobilization charge",
  demobilizationCharge: "demobilization charge",
  overtimeRate: "overtime rate",
  workingHours: "working hours",
  workingDaysPerWeek: "working days",
  minimumRentalPeriodValue: "minimum period",
  noticePeriodDays: "notice period",
  operatorScope: "operator",
  fuelScope: "fuel scope",
  accommodationScope: "accommodation scope",
  minimumRentalPeriodUnit: "minimum period unit",
};

type Values = Record<Key, string>;

function initial(q: CommercialQuotation): Values {
  const out = {} as Values;
  for (const key of TEXT_KEYS) out[key] = q[key] ?? "";
  for (const key of NUMBER_KEYS) out[key] = q[key] == null ? "" : String(q[key]);
  for (const key of CHOICE_KEYS) out[key] = q[key] ?? "";
  return out;
}

/** Only the fields that changed (also drives the Save button). */
function changesOf(values: Values, quotation: CommercialQuotation): UpdateCommercialQuotationTermsRequest {
  const original = initial(quotation);
  const changes: UpdateCommercialQuotationTermsRequest = {};
  for (const key of TEXT_KEYS) {
    const v = values[key].trim();
    if (v && v !== original[key]) changes[key] = v;
  }
  for (const key of NUMBER_KEYS) {
    const v = values[key].trim();
    if (v && Number(v) !== Number(original[key] || NaN)) changes[key] = Number(v);
  }
  if (values.operatorScope && values.operatorScope !== original.operatorScope) changes.operatorScope = values.operatorScope as OperatorScope;
  if (values.fuelScope && values.fuelScope !== original.fuelScope) changes.fuelScope = values.fuelScope as ResponsibleParty;
  if (values.accommodationScope && values.accommodationScope !== original.accommodationScope)
    changes.accommodationScope = values.accommodationScope as ResponsibleParty;
  if (values.minimumRentalPeriodUnit && values.minimumRentalPeriodUnit !== original.minimumRentalPeriodUnit)
    changes.minimumRentalPeriodUnit = values.minimumRentalPeriodUnit as RateUnit;
  return changes;
}

/** What a filled-in number must be, per field (anything else: 0 or more). */
const NUMBER_RULE: Partial<Record<NumberKey, [(n: number) => boolean, string]>> = {
  workingHours: [(n) => n > 0, "Enter hours per shift above 0, e.g. 10."],
  workingDaysPerWeek: [(n) => Number.isInteger(n) && n >= 1 && n <= 7, "Enter whole days from 1 to 7."],
  minimumRentalPeriodValue: [(n) => Number.isInteger(n) && n >= 1, "Enter a whole number above 0, e.g. 1."],
  noticePeriodDays: [(n) => Number.isInteger(n) && n >= 0, "Enter whole days, e.g. 15."],
};

/** A recorded term can be corrected but not cleared. Keys in form order (first invalid gets focus). */
function termsSchema(quotation: CommercialQuotation) {
  const original = initial(quotation);
  const shape = {} as Record<Key, z.ZodType<string>>;
  for (const key of FIELD_ORDER) {
    const keep = (value: string) => Boolean(value.trim()) || !original[key];
    if ((TEXT_KEYS as Key[]).includes(key)) {
      const max = MAX[key as TextKey];
      shape[key] = z
        .string()
        .refine(keep, `The ${WORD[key]} can be corrected but not removed.`)
        .refine((value) => value.trim().length <= max, `This is up to ${max.toLocaleString("en-IN")} characters.`);
    } else if ((NUMBER_KEYS as Key[]).includes(key)) {
      const [ok, message] = NUMBER_RULE[key as NumberKey] ?? [(n: number) => n >= 0, "Enter 0 or more."];
      shape[key] = z
        .string()
        .refine(keep, `The ${WORD[key]} can be corrected but not removed.`)
        .refine((value) => !value.trim() || ok(Number(value.trim())), message);
    } else {
      shape[key] = z.string().refine((value) => Boolean(value) || !original[key], `The ${WORD[key]} can be changed but not removed.`);
    }
  }
  return z.object(shape).transform((values) => changesOf(values, quotation));
}

/**
 * The updateTerms endpoint deliberately excludes party, machine, dates and
 * rate (those change the negotiation itself — via a counter-offer or the
 * alternate-dates request) — this dialog only edits the field set
 * updateCommercialQuotationTermsRequestSchema allows. Only changed fields
 * are sent, and nothing is sent when nothing changed: every save clears
 * the customer's acceptance (renterAcceptedAt) on the server.
 */
export function EditQuotationTermsDialog({ open, onClose, organizationId, quotation, onUpdated }: EditQuotationTermsDialogProps) {
  const toast = useToast();
  const schema = useMemo(() => termsSchema(quotation), [quotation]);
  const form = useForm({ schema, initial: initial(quotation), failTitle: "Terms weren't saved" });
  const { busy, online, reset, values } = form;
  const [nothingChanged, setNothingChanged] = useState(false);

  useEffect(() => {
    if (!open) return;
    reset(initial(quotation));
    setNothingChanged(false);
  }, [open, quotation, reset]);

  const dirty = Object.keys(changesOf(values, quotation)).length > 0;
  const bind = form.field;

  const handleSubmit = form.submit(async (changes) => {
    if (!Object.keys(changes).length) {
      setNothingChanged(true);
      return;
    }
    const updated = (await apiClient.updateQuotationTerms(organizationId, quotation.id, changes)) as CommercialQuotation;
    onUpdated(updated);
    toast.success({
      title: `Terms updated on ${quotation.referenceNumber}`,
      body: `Changed: ${(Object.keys(changes) as Key[]).map((k) => WORD[k]).join(", ")}.${quotation.renterAcceptedAt ? " The customer's acceptance was cleared — they need to accept again." : ""}`,
    });
    onClose();
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Edit terms on ${quotation.referenceNumber}`}
      description="Correct the commercial and operating terms. Only what you change is saved."
      icon="edit"
      size="lg"
      dismissible={!busy}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            busy={busy}
            busyLabel="Saving…"
            disabled={!dirty || !online}
            title={!online ? OFFLINE_HINT : undefined}
          >
            Save terms
          </Button>
        </>
      }
    >
      {form.banner && (
        <FormBanner tone="error" title={form.banner.title}>
          {form.banner.body}
        </FormBanner>
      )}
      {quotation.renterAcceptedAt && (
        <FormBanner tone="warning" title="Saving clears the customer's acceptance">
          They accepted these terms. After any change they need to accept again before you can award it.
        </FormBanner>
      )}
      <Alert tone="neutral" icon="lock">
        Rate ({formatRate(quotation.rate, quotation.rateUnit)}) and dates ({formatDateRange(quotation.startDate, quotation.endDate)}) aren&apos;t
        edited here — change the rate with a counter-offer, and the dates by proposing new dates. Machine and customer are fixed.
      </Alert>
      <FormSection title="Charges and commercial terms">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div data-field="mobilizationCharge">
            <Input label="Mobilization charge" prefix="₹" mono inputMode="decimal" {...bind("mobilizationCharge")} />
          </div>
          <div data-field="demobilizationCharge">
            <Input label="Demobilization charge" prefix="₹" mono inputMode="decimal" {...bind("demobilizationCharge")} />
          </div>
          <div data-field="overtimeRate">
            <Input label="Overtime rate" prefix="₹" suffix="per h" mono inputMode="decimal" {...bind("overtimeRate")} />
          </div>
          <div data-field="minimumRentalPeriodValue">
            <Input label="Minimum rental period" mono inputMode="numeric" {...bind("minimumRentalPeriodValue")} />
          </div>
          <div data-field="minimumRentalPeriodUnit">
            <Select label="Period unit" placeholder="Not specified" options={DURATION_UNIT_OPTIONS} {...bind("minimumRentalPeriodUnit")} />
          </div>
          <div data-field="noticePeriodDays">
            <Input label="Notice period" suffix="days" mono inputMode="numeric" {...bind("noticePeriodDays")} />
          </div>
        </div>
        <div data-field="gstTerms">
          <Input label="GST terms" placeholder="e.g. GST extra @ 18%" {...bind("gstTerms")} />
        </div>
        <div data-field="paymentTerms">
          <Textarea label="Payment terms" rows={2} {...bind("paymentTerms")} />
        </div>
      </FormSection>
      <FormSection title="Operating terms" className="border-t border-border pt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div data-field="operatorScope">
            <Select label="Operator" placeholder="Not specified" options={OPERATOR_OPTIONS} {...bind("operatorScope")} />
          </div>
          <div data-field="workingHours">
            <Input label="Working hours" suffix="per shift" mono inputMode="decimal" {...bind("workingHours")} />
          </div>
          <div data-field="workingDaysPerWeek">
            <Input label="Working days" suffix="per week" mono inputMode="numeric" {...bind("workingDaysPerWeek")} />
          </div>
          <div data-field="fuelScope">
            <Select label="Fuel" placeholder="Not specified" options={RESPONSIBLE_PARTY_OPTIONS} {...bind("fuelScope")} />
          </div>
          <div data-field="accommodationScope">
            <Select label="Accommodation" placeholder="Not specified" options={RESPONSIBLE_PARTY_OPTIONS} {...bind("accommodationScope")} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div data-field="shiftStructure">
            <Input label="Shift structure" {...bind("shiftStructure")} />
          </div>
          <div data-field="sundayCondition">
            <Input label="Sunday condition" {...bind("sundayCondition")} />
          </div>
          <div data-field="fuelNorms">
            <Input label="Fuel norms" {...bind("fuelNorms")} />
          </div>
          <div data-field="dehireTerms">
            <Input label="Dehire terms" {...bind("dehireTerms")} />
          </div>
        </div>
      </FormSection>
      <FormSection title="Conditions" className="border-t border-border pt-4">
        <div data-field="commercialNotes">
          <Textarea label="Special and site conditions" rows={2} {...bind("commercialNotes")} />
        </div>
        <div data-field="companyTerms">
          <Textarea label="Company terms and conditions" rows={2} {...bind("companyTerms")} />
        </div>
      </FormSection>
      {nothingChanged && !dirty && form.valid && <p className="m-0 text-xs text-meta">Nothing has changed yet.</p>}
    </Dialog>
  );
}
