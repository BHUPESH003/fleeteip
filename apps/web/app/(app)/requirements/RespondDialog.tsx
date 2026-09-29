"use client";

import { QuotationResponseStatus, type QuotationResponse, type SubmitQuotationResponseRequest } from "@fleetip/contracts/quotation";
import type { RateUnit } from "@fleetip/contracts/rental";
import type { Requirement } from "@fleetip/contracts/rfq";
import {
  Button,
  DescriptionList,
  Dialog,
  FormBanner,
  Icon,
  Input,
  RadioGroup,
  Select,
  Textarea,
  useToast,
} from "@fleetip/ui";
import { useEffect, useMemo } from "react";
import { z } from "zod";
import { apiClient } from "../../../lib/api-client";
import { OFFLINE_HINT } from "../../../lib/errors";
import { formatDate, formatRate, formatRateUnit, todayIsoDate } from "../../../lib/format";
import { useForm } from "../../../lib/form";
import { Status } from "../../../lib/status";
import { RATE_UNIT_OPTIONS, durationLabel, equipmentLine, requirementRef, validityInfo } from "./shared";

export interface RespondDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  requirement: Requirement;
  subcategoryName: string | null;
  /** This company's current reply, if any — re-submitting updates it. */
  existing: QuotationResponse | null;
  /**
   * Machines of this equipment type the company has registered (not
   * counting retired ones). null when the role can't see the fleet
   * (equipment.manage) — then no shortfall hint is shown, never a false "0".
   */
  machineCount: number | null;
  onSaved: (response: QuotationResponse) => void;
}

type Answer = typeof QuotationResponseStatus.interested | typeof QuotationResponseStatus.not_interested;
type Values = { status: Answer; indicativeRate: string; indicativeRateUnit: string; notes: string };

/** Mirrors submitQuotationResponseRequestSchema: a rate and unit are required when interested. */
function respondSchema(lockedUnit: RateUnit | null) {
  return z
    .object({
      status: z.enum([QuotationResponseStatus.interested, QuotationResponseStatus.not_interested]),
      indicativeRate: z.string(),
      indicativeRateUnit: z.string(),
      notes: z.string().trim().max(1000, "Notes are up to 1,000 characters."),
    })
    .superRefine((values, ctx) => {
      if (values.status !== QuotationResponseStatus.interested) return;
      if (!values.indicativeRate.trim())
        ctx.addIssue({ code: "custom", path: ["indicativeRate"], message: "Enter your indicative rate — it's how the customer compares replies." });
      else if (!(Number(values.indicativeRate) > 0)) ctx.addIssue({ code: "custom", path: ["indicativeRate"], message: "Enter a rate above ₹0." });
      if (!(lockedUnit ?? values.indicativeRateUnit)) ctx.addIssue({ code: "custom", path: ["indicativeRateUnit"], message: "Choose what the rate is per." });
    })
    .transform((values): SubmitQuotationResponseRequest => {
      const interested = values.status === QuotationResponseStatus.interested;
      const unit = (lockedUnit ?? values.indicativeRateUnit) as RateUnit | "";
      return {
        status: values.status,
        indicativeRate: interested ? Number(values.indicativeRate) : undefined,
        indicativeRateUnit: interested && unit ? unit : undefined,
        notes: values.notes || undefined,
      };
    });
}

function initialValues(existing: QuotationResponse | null, lockedUnit: RateUnit | null): Values {
  return {
    status: existing?.status === QuotationResponseStatus.not_interested ? QuotationResponseStatus.not_interested : QuotationResponseStatus.interested,
    indicativeRate: existing?.indicativeRate != null ? String(existing.indicativeRate) : "",
    indicativeRateUnit: lockedUnit ?? existing?.indicativeRateUnit ?? "",
    notes: existing?.notes ?? "",
  };
}

/**
 * The Open Market reply (a QuotationResponse — the lightweight answer, not
 * the formal CommercialQuotation). A Dialog on purpose: it used to be a
 * form appended after the whole table, which meant scrolling to reach it
 * from an early row (docs/decisions.md).
 */
export function RespondDialog({ open, onClose, organizationId, requirement, subcategoryName, existing, machineCount, onSaved }: RespondDialogProps) {
  const toast = useToast();
  // Locked to the requirement's own unit when it has one — the server
  // (QuotationResponseService.submitResponse) forces it regardless; this
  // just avoids a picker whose choice would be silently overridden.
  const lockedUnit = requirement.expectedDurationUnit ?? null;
  const schema = useMemo(() => respondSchema(lockedUnit), [lockedUnit]);
  const form = useForm({ schema, initial: initialValues(existing, lockedUnit), failTitle: "Your response wasn't sent" });
  const { busy, online, reset } = form;

  useEffect(() => {
    if (open) reset(initialValues(existing, lockedUnit));
  }, [open, existing, lockedUnit, reset]);

  const status = form.values.status;
  const interested = status === QuotationResponseStatus.interested;

  const handleSubmit = form.submit(async (input) => {
    const saved = (await apiClient.submitResponse(organizationId, requirement.id, input)) as QuotationResponse;
    toast.success({
      title: `${existing ? "Response updated" : "Response sent"} for ${requirementRef(requirement.id)}`,
      body: interested
        ? `Interested at ${formatRate(saved.indicativeRate ?? input.indicativeRate ?? 0, saved.indicativeRateUnit ?? input.indicativeRateUnit ?? "")}. The customer sees it next to the other replies.`
        : "Marked not interested. The customer sees that you declined, and it leaves your Needs response list.",
    });
    onSaved(saved);
    onClose();
  });

  const validity = validityInfo(requirement.validityDate, todayIsoDate());
  const short = machineCount !== null && machineCount < requirement.quantity;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Respond to ${requirementRef(requirement.id)}`}
      description={`${equipmentLine(requirement, subcategoryName)} · Qty ${requirement.quantity}${requirement.projectLocation ? ` · ${requirement.projectLocation}` : ""}`}
      icon="requirement"
      tone="info"
      size="md"
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
            busyLabel="Sending…"
            disabled={!online}
            title={!online ? OFFLINE_HINT : undefined}
          >
            {existing ? "Update response" : "Send response"}
          </Button>
        </>
      }
    >
      {form.banner && (
        <FormBanner tone="error" title={form.banner.title}>
          {form.banner.body}
        </FormBanner>
      )}
      <DescriptionList
        layout="inline"
        items={[
          { label: "Needed from", value: formatDate(requirement.requestedStartDate), mono: true },
          { label: "Duration", value: durationLabel(requirement.expectedDurationValue, requirement.expectedDurationUnit) },
          { label: "Responses until", value: `${formatDate(requirement.validityDate)} (${validity.label.toLowerCase()})`, mono: true },
        ]}
      />
      {existing && (
        <p className="m-0 flex flex-wrap items-center gap-2 text-xs text-meta">
          Your current reply
          <Status domain="quotation_response" value={existing.status} size="sm" />
          {existing.indicativeRate != null && existing.indicativeRateUnit && (
            <span className="font-mono text-ink">{formatRate(existing.indicativeRate, existing.indicativeRateUnit)}</span>
          )}
          <span>· sending again replaces it.</span>
        </p>
      )}
      {short && (
        <FormBanner tone="warning" title={`This requirement needs ${requirement.quantity}; you have ${machineCount}`}>
          You have {machineCount} {subcategoryName ?? "matching"} {machineCount === 1 ? "machine" : "machines"} registered, not counting
          retired ones. You can still respond.
        </FormBanner>
      )}
      <RadioGroup
        label="Your answer"
        required
        name={`respond-${requirement.id}`}
        value={status}
        onChange={(value) => form.set("status", value as Answer)}
        options={[
          { value: QuotationResponseStatus.interested, label: "Interested", description: "Give an indicative rate. It isn't binding — a formal quotation follows." },
          { value: QuotationResponseStatus.not_interested, label: "Not interested", description: "Tells the customer you've seen it and declined." },
        ]}
      />
      {interested && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div data-field="indicativeRate">
            <Input label="Indicative rate" required prefix="₹" mono inputMode="decimal" {...form.field("indicativeRate")} />
          </div>
          <div data-field="indicativeRateUnit">
            {lockedUnit ? (
              <Input
                label="Rate is"
                value={formatRateUnit(lockedUnit).replace(/^per/, "Per")}
                readOnly
                disabled
                suffix={<Icon name="lock" size={12} />}
                hint={`Set by the requirement, so every reply is ${formatRateUnit(lockedUnit)} and compares like for like.`}
              />
            ) : (
              <Select label="Rate is" required placeholder="Choose a unit" options={RATE_UNIT_OPTIONS} {...form.field("indicativeRateUnit")} />
            )}
          </div>
        </div>
      )}
      <div data-field="notes">
        <Textarea label="Notes for the customer" rows={2} {...form.field("notes")} hint="Availability, what the rate includes, anything that affects it." />
      </div>
    </Dialog>
  );
}
