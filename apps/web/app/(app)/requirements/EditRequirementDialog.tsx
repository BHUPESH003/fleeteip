"use client";

import type { Requirement, UpdateRequirementRequest } from "@fleetip/contracts/rfq";
import { Alert, Button, Dialog, FormBanner, Input, Textarea, useToast } from "@fleetip/ui";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { apiClient } from "../../../lib/api-client";
import { OFFLINE_HINT } from "../../../lib/errors";
import { formatDate, todayIsoDate } from "../../../lib/format";
import { useForm } from "../../../lib/form";
import { requirementRef, underField } from "./shared";

export interface EditRequirementDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  requirement: Requirement;
  /** "Crawler crane · 50 t" — shown read-only (the equipment type can't change). */
  equipmentLabel: string;
  onUpdated: (requirement: Requirement) => void;
}

type Key = "quantity" | "requestedStartDate" | "validityDate" | "notes";
type Values = Record<Key, string>;
const WORD: Record<Key, string> = {
  quantity: "quantity",
  requestedStartDate: "start date",
  validityDate: "validity date",
  notes: "notes",
};

function initial(requirement: Requirement): Values {
  return {
    quantity: String(requirement.quantity),
    requestedStartDate: requirement.requestedStartDate,
    validityDate: requirement.validityDate,
    notes: requirement.notes ?? "",
  };
}

/** Only the fields that changed (also drives the Save button). */
function changesOf(values: Values, requirement: Requirement): UpdateRequirementRequest {
  const original = initial(requirement);
  const quantity = Number(values.quantity);
  const notes = values.notes.trim();
  return {
    ...(quantity !== requirement.quantity && Number.isInteger(quantity) ? { quantity } : {}),
    ...(values.requestedStartDate !== original.requestedStartDate && values.requestedStartDate ? { requestedStartDate: values.requestedStartDate } : {}),
    ...(values.validityDate !== original.validityDate && values.validityDate ? { validityDate: values.validityDate } : {}),
    ...(notes && notes !== original.notes ? { notes } : {}),
  };
}

/**
 * An unchanged date that has already passed is fine (it isn't sent); a new
 * one can't be in the past. Validity must stay on or before the start date,
 * checked against the merged values like RequirementService.updateRequirement.
 */
function editRequirementSchema(requirement: Requirement, today: string) {
  const original = initial(requirement);
  const notPast = (was: string) => (value: string) => value === was || value >= today;
  const pastMessage = (what: string) => `A new ${what} can't be in the past. The earliest is today, ${formatDate(today)}.`;
  return z
    .object({
      quantity: z
        .string()
        .refine((value) => {
          const quantity = Number(value);
          return value.trim() !== "" && Number.isInteger(quantity) && quantity >= 1;
        }, "Enter how many machines you need — 1 or more, in whole numbers."),
      requestedStartDate: z
        .string()
        .min(1, "Pick the day the equipment is needed on site.")
        .refine(notPast(original.requestedStartDate), pastMessage("start date")),
      validityDate: z
        .string()
        .min(1, "Pick the last day rental companies can respond.")
        .refine(notPast(original.validityDate), pastMessage("validity date")),
      notes: z
        .string()
        .refine((value) => value.trim() || !original.notes, "Notes can be corrected but not removed.")
        .refine((value) => value.trim().length <= 2000, "Notes are up to 2,000 characters."),
    })
    .refine((values) => !values.requestedStartDate || values.validityDate <= values.requestedStartDate, {
      message: "Validity date can't be after the requested start date. Move one of the two dates.",
      path: ["validityDate"],
    })
    .transform((values) => changesOf(values, requirement));
}

/**
 * Corrects an open requirement (the API refuses edits once it's closed or
 * cancelled). Only changed fields are sent. The equipment type and project
 * are fixed (updateRequirementRequestSchema excludes them).
 */
export function EditRequirementDialog({ open, onClose, organizationId, requirement, equipmentLabel, onUpdated }: EditRequirementDialogProps) {
  const toast = useToast();
  const today = todayIsoDate();
  const schema = useMemo(() => editRequirementSchema(requirement, today), [requirement, today]);
  const form = useForm({ schema, initial: initial(requirement), failTitle: "Changes weren't saved" });
  const { busy, online, reset, values } = form;
  const [nothingChanged, setNothingChanged] = useState(false);

  useEffect(() => {
    if (!open) return;
    reset(initial(requirement));
    setNothingChanged(false);
  }, [open, requirement, reset]);

  const dirty = Object.keys(changesOf(values, requirement)).length > 0;

  const handleSubmit = form.submit(async (changes) => {
    if (!Object.keys(changes).length) {
      setNothingChanged(true);
      return;
    }
    // The merged-dates check comes back without a field path.
    const updated = (await apiClient.updateRequirement(organizationId, requirement.id, changes).catch(underField(/validity/i, "validityDate"))) as Requirement;
    onUpdated(updated);
    toast.success({
      title: `${requirementRef(requirement.id)} updated`,
      body: `Changed: ${(Object.keys(changes) as Key[]).map((k) => WORD[k]).join(", ")}. Rental companies see the change in the Open Market.`,
    });
    onClose();
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Edit ${requirementRef(requirement.id)}`}
      description="Correct the requirement while it's open. Responses already received stay as they are."
      icon="edit"
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
            busyLabel="Saving…"
            disabled={!dirty || !online}
            title={!online ? OFFLINE_HINT : undefined}
          >
            Save changes
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
        <span className="font-medium text-ink">{equipmentLabel}</span> for{" "}
        <span className="font-medium text-ink">{requirement.projectName ?? "its project"}</span> — the equipment type and
        project can&apos;t be changed after posting.
      </Alert>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div data-field="quantity">
          <Input label="Quantity" required mono inputMode="numeric" suffix="machines" {...form.field("quantity")} />
        </div>
        <div data-field="requestedStartDate">
          <Input
            label="Needed on site from"
            required
            type="date"
            mono
            // The earlier of "today" and the current value — a requirement
            // whose start date has already passed can still be saved with
            // it unchanged (e.g. to bump the quantity), while a new date
            // still can't go into the past (docs/decisions.md).
            min={requirement.requestedStartDate < today ? requirement.requestedStartDate : today}
            {...form.field("requestedStartDate")}
          />
        </div>
        <div data-field="validityDate">
          <Input
            label="Responses accepted until"
            required
            type="date"
            mono
            min={requirement.validityDate < today ? requirement.validityDate : today}
            max={values.requestedStartDate || undefined}
            {...form.field("validityDate")}
            hint="Move it later to give rental companies more time. On or before the start date."
          />
        </div>
      </div>
      <div data-field="notes">
        <Textarea label="Notes for rental companies" rows={3} {...form.field("notes")} />
      </div>
      {nothingChanged && !dirty && form.valid && <p className="m-0 text-xs text-meta">Nothing has changed yet.</p>}
    </Dialog>
  );
}
