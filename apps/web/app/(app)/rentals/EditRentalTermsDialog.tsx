"use client";

import { OperatorScope, RateUnit, type Rental, type UpdateRentalTermsRequest } from "@fleetip/contracts/rental";
import { Alert, Button, Dialog, FormBanner, FormSection, Input, Select, Textarea, useToast } from "@fleetip/ui";
import { useEffect, useMemo } from "react";
import { z } from "zod";
import { apiClient } from "../../../lib/api-client";
import { useForm } from "../../../lib/form";
import { formatDateRange, rentalRef } from "../../../lib/format";

type TextKey =
  | "projectName"
  | "projectLocation"
  | "paymentTerms"
  | "shiftStructure"
  | "sundayCondition"
  | "fuelNorms"
  | "dehireTerms";
type NumberKey = "rate" | "mobilizationCharge" | "demobilizationCharge" | "overtimeRate" | "noticePeriodDays";
type Key = TextKey | NumberKey | "rateUnit" | "operatorScope";

const TEXT_KEYS: TextKey[] = ["projectName", "projectLocation", "paymentTerms", "shiftStructure", "sundayCondition", "fuelNorms", "dehireTerms"];
const NUMBER_KEYS: NumberKey[] = ["rate", "mobilizationCharge", "demobilizationCharge", "overtimeRate", "noticePeriodDays"];

const LABEL: Record<Key, string> = {
  projectName: "project name",
  projectLocation: "site location",
  paymentTerms: "payment terms",
  shiftStructure: "shift structure",
  sundayCondition: "Sunday condition",
  fuelNorms: "fuel norms",
  dehireTerms: "dehire terms",
  rate: "rate",
  mobilizationCharge: "mobilization charge",
  demobilizationCharge: "demobilization charge",
  overtimeRate: "overtime rate",
  noticePeriodDays: "notice period",
  rateUnit: "rate unit",
  operatorScope: "operator",
};

function initial(rental: Rental): Record<Key, string> {
  const out = {} as Record<Key, string>;
  for (const key of TEXT_KEYS) out[key] = rental[key] ?? "";
  for (const key of NUMBER_KEYS) out[key] = rental[key] === null || rental[key] === undefined ? "" : String(rental[key]);
  out.rateUnit = rental.rateUnit;
  out.operatorScope = rental.operatorScope ?? "";
  return out;
}

type Values = Record<Key, string>;

/** Only what changed. Emptying a recorded term sends null, which removes it. */
function changesFrom(values: Values, original: Values): UpdateRentalTermsRequest {
  const changes: Record<string, unknown> = {};
  for (const key of TEXT_KEYS) {
    const v = values[key].trim();
    if (v !== original[key]) changes[key] = v || null;
  }
  for (const key of NUMBER_KEYS) {
    const v = values[key].trim();
    if (v ? Number(v) !== Number(original[key] || NaN) : Boolean(original[key])) changes[key] = v ? Number(v) : null;
  }
  if (values.rateUnit !== original.rateUnit) changes.rateUnit = values.rateUnit as RateUnit;
  if (values.operatorScope !== original.operatorScope) changes.operatorScope = (values.operatorScope as OperatorScope) || null;
  return changes as UpdateRentalTermsRequest;
}

/** Optional terms can be emptied to remove them; the rate is required. */
function editTermsSchema(rental: Rental) {
  const original = initial(rental);
  const number = (check: (n: number) => boolean, message: string) =>
    z.string().refine((v) => !v.trim() || check(Number(v.trim())), message);
  const text = Object.fromEntries(TEXT_KEYS.map((key) => [key, z.string()])) as Record<TextKey, z.ZodString>;
  return z
    .object({
      ...text,
      rate: z
        .string()
        .refine((v) => Boolean(v.trim()), "Enter the rate. A rental always has one.")
        .refine((v) => !v.trim() || Number(v.trim()) > 0, "Enter a rate above ₹0."),
      mobilizationCharge: number((n) => n >= 0, "Enter 0 or more."),
      demobilizationCharge: number((n) => n >= 0, "Enter 0 or more."),
      overtimeRate: number((n) => n >= 0, "Enter 0 or more."),
      noticePeriodDays: number((n) => Number.isInteger(n) && n >= 0, "Enter whole days, e.g. 15."),
      rateUnit: z.string(),
      operatorScope: z.string(),
    })
    .transform((values) => changesFrom(values, original));
}

/**
 * Terms are editable only while the rental is Confirmed (the API enforces
 * it too). Dates change through "Change dates" (the Renter approves);
 * machine and customer can't change.
 */
export function EditRentalTermsDialog({
  open,
  onClose,
  organizationId,
  rental,
  onUpdated,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  rental: Rental;
  onUpdated: (rental: Rental) => void;
}) {
  const toast = useToast();
  const schema = useMemo(() => editTermsSchema(rental), [rental]);
  const form = useForm({ schema, initial: initial(rental), failTitle: "Terms weren't saved" });
  const { reset } = form;

  useEffect(() => {
    if (open) reset(initial(rental));
  }, [open, rental, reset]);

  const dirty = Object.keys(changesFrom(form.values, initial(rental))).length > 0;
  const bind = form.field;

  const handleSubmit = form.submit(async (changes) => {
    if (!Object.keys(changes).length) return;
    const updated = (await apiClient.updateRentalTerms(organizationId, rental.id, changes)) as Rental;
    onUpdated(updated);
    const removed = Object.entries(changes).filter(([, v]) => v === null).map(([k]) => LABEL[k as Key]);
    const changed = Object.entries(changes).filter(([, v]) => v !== null).map(([k]) => LABEL[k as Key]);
    toast.success({
      title: `Terms updated on ${rentalRef(rental.id)}`,
      body: [changed.length ? `Changed: ${changed.join(", ")}.` : "", removed.length ? `Removed: ${removed.join(", ")}.` : ""].filter(Boolean).join(" "),
    });
    onClose();
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Edit terms on ${rentalRef(rental.id)}`}
      description="Terms can be corrected until the rental starts. Changes are saved on the rental only — a work order keeps the terms it was issued with."
      icon="edit"
      size="lg"
      dismissible={!form.busy}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose} disabled={form.busy}>
            Cancel
          </Button>
          <Button type="submit" busy={form.busy} busyLabel="Saving…" disabled={!dirty}>
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
      <Alert tone="neutral" icon="lock">
        Dates ({formatDateRange(rental.startDate, rental.endDate)}) change through &ldquo;Change dates&rdquo; in the rental&apos;s More menu.
        Machine and customer can&apos;t be changed. Empty an optional term to remove it.
      </Alert>
      <FormSection title="Rate">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Rate" required prefix="₹" mono inputMode="decimal" {...bind("rate")} />
          <Select
            label="Rate is"
            required
            options={[
              { value: RateUnit.shift, label: "Per shift" },
              { value: RateUnit.day, label: "Per day" },
              { value: RateUnit.week, label: "Per week" },
              { value: RateUnit.month, label: "Per month" },
            ]}
            {...bind("rateUnit")}
          />
        </div>
      </FormSection>
      <FormSection title="Project" className="border-t border-border pt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Project name" {...bind("projectName")} />
          <Input label="Site location" {...bind("projectLocation")} />
        </div>
      </FormSection>
      <FormSection title="Commercial and operating terms" className="border-t border-border pt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Mobilization charge" prefix="₹" mono inputMode="decimal" {...bind("mobilizationCharge")} />
          <Input label="Demobilization charge" prefix="₹" mono inputMode="decimal" {...bind("demobilizationCharge")} />
          <Input label="Overtime rate" prefix="₹" suffix="per h" mono inputMode="decimal" {...bind("overtimeRate")} />
          <Input label="Notice period" suffix="days" mono inputMode="numeric" {...bind("noticePeriodDays")} />
          <Select
            label="Operator"
            placeholder="Not specified"
            options={[
              { value: OperatorScope.with_operator, label: "With operator" },
              { value: OperatorScope.without_operator, label: "Without operator" },
            ]}
            {...bind("operatorScope")}
          />
          <Input label="Shift structure" {...bind("shiftStructure")} />
          <Input label="Sunday condition" {...bind("sundayCondition")} />
          <Input label="Fuel norms" {...bind("fuelNorms")} />
        </div>
        <Textarea label="Payment terms" rows={2} {...bind("paymentTerms")} />
        <Textarea label="Dehire terms" rows={2} {...bind("dehireTerms")} />
      </FormSection>
    </Dialog>
  );
}
