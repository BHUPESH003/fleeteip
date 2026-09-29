"use client";

import type { Machine, UpdateMachineRequest } from "@fleetip/contracts/equipment";
import { Alert, Button, Dialog, FormBanner, Input, useToast } from "@fleetip/ui";
import { useEffect, useMemo } from "react";
import { z } from "zod";
import { apiClient } from "../../../lib/api-client";
import { OFFLINE_HINT } from "../../../lib/errors";
import { useForm } from "../../../lib/form";

export interface EditMachineDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  machine: Machine;
  /** Product line shown read-only ("Putzmeister M36-4 · Boom pump"). */
  productLabel?: string | null;
  onUpdated: (machine: Machine) => void;
}

const THIS_YEAR = new Date().getFullYear();

type Values = Record<"assetCode" | "registrationNumber" | "chassisNumber" | "yearOfManufacture", string>;

const FIELD_WORD: Record<keyof Values, string> = {
  assetCode: "asset code",
  registrationNumber: "registration number",
  chassisNumber: "chassis number",
  yearOfManufacture: "year built",
};

/**
 * The rules, in the words the user reads. The product is fixed at
 * registration, and a chassis number or year can be corrected but not
 * removed once recorded (the API rejects empty values). Produces only
 * the fields that changed.
 */
function editMachineSchema(machine: Machine) {
  return z
    .object({
      assetCode: z
        .string()
        .trim()
        .min(1, "Enter the asset code your team uses for this machine.")
        .max(50, "Asset codes are up to 50 characters."),
      registrationNumber: z
        .string()
        .trim()
        .min(1, "Enter the registration number.")
        .max(50, "Registration numbers are up to 50 characters."),
      chassisNumber: z
        .string()
        .trim()
        .max(50, "Chassis numbers are up to 50 characters.")
        .refine((value) => value || !machine.chassisNumber, "A recorded chassis number can be corrected but not removed."),
      yearOfManufacture: z
        .string()
        .trim()
        .refine((value) => value || !machine.yearOfManufacture, "A recorded year can be corrected but not removed.")
        .refine((value) => !value || isYearBuilt(value), `Enter a year between 1980 and ${THIS_YEAR}.`),
    })
    .transform((values): UpdateMachineRequest => {
      const changes: UpdateMachineRequest = {};
      if (values.assetCode !== machine.assetCode) changes.assetCode = values.assetCode;
      if (values.registrationNumber !== machine.registrationNumber) changes.registrationNumber = values.registrationNumber;
      if (values.chassisNumber && values.chassisNumber !== (machine.chassisNumber ?? "")) changes.chassisNumber = values.chassisNumber;
      const year = Number(values.yearOfManufacture);
      if (values.yearOfManufacture && year !== machine.yearOfManufacture) changes.yearOfManufacture = year;
      return changes;
    });
}

function isYearBuilt(value: string): boolean {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1980 && year <= THIS_YEAR;
}

function initialValues(machine: Machine): Values {
  return {
    assetCode: machine.assetCode,
    registrationNumber: machine.registrationNumber,
    chassisNumber: machine.chassisNumber ?? "",
    yearOfManufacture: machine.yearOfManufacture ? String(machine.yearOfManufacture) : "",
  };
}

/** Corrects a machine's identifiers. Only fields that changed are sent. */
export function EditMachineDialog({ open, onClose, organizationId, machine, productLabel, onUpdated }: EditMachineDialogProps) {
  const toast = useToast();
  const schema = useMemo(() => editMachineSchema(machine), [machine]);
  const form = useForm({
    schema,
    initial: initialValues(machine),
    failTitle: "Changes weren't saved",
    conflicts: { assetCode: "That asset code is already used by another machine in your organization." },
  });
  const { reset } = form;

  useEffect(() => {
    if (open) reset(initialValues(machine));
  }, [open, machine, reset]);

  const save = form.submit(async (changes) => {
    if (!Object.keys(changes).length) return;
    const updated = (await apiClient.updateMachine(organizationId, machine.id, changes)) as Machine;
    onUpdated(updated);
    const changed = Object.keys(changes).map((key) => FIELD_WORD[key as keyof Values]);
    toast.success({ title: `${updated.assetCode} updated`, body: `Changed: ${changed.join(", ")}.` });
    onClose();
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Edit ${machine.assetCode}`}
      description="Correct how this machine is identified. Changes apply everywhere the machine appears."
      icon="edit"
      size="md"
      dismissible={!form.busy}
      onSubmit={save}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose} disabled={form.busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            busy={form.busy}
            busyLabel="Saving…"
            disabled={!form.dirty || !form.online}
            title={form.online ? undefined : OFFLINE_HINT}
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
        <span className="font-medium text-ink">{productLabel ?? "Catalogue product"}</span> — the product can&apos;t be
        changed. It&apos;s fixed when a machine is registered.
      </Alert>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Asset code" required mono maxLength={60} {...form.field("assetCode")} hint="Your own fleet code, e.g. KPH-BP-036." />
        <Input label="Registration number" required mono maxLength={60} {...form.field("registrationNumber")} />
        <Input label="Chassis number" mono maxLength={60} {...form.field("chassisNumber")} />
        <Input label="Year built" mono inputMode="numeric" maxLength={4} {...form.field("yearOfManufacture")} hint={`1980 to ${THIS_YEAR}.`} />
      </div>
    </Dialog>
  );
}
