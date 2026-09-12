"use client";

import type { Machine } from "@fleetip/contracts/equipment";
import { Button, Dialog, Input } from "@fleetip/ui";
import { type FormEvent, useState } from "react";
import { apiClient } from "../../../lib/api-client";

export interface EditMachineDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  machine: Machine;
  onUpdated: (machine: Machine) => void;
}

export function EditMachineDialog({
  open,
  onClose,
  organizationId,
  machine,
  onUpdated,
}: EditMachineDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const assetCode = String(form.get("assetCode") ?? "").trim();
    const registrationNumber = String(form.get("registrationNumber") ?? "").trim();
    const chassisNumber = String(form.get("chassisNumber") ?? "").trim();
    const yearOfManufacture = form.get("yearOfManufacture");

    setSubmitting(true);
    try {
      const updated = await apiClient.updateMachine(organizationId, machine.id, {
        ...(assetCode !== machine.assetCode ? { assetCode } : {}),
        ...(registrationNumber !== machine.registrationNumber ? { registrationNumber } : {}),
        ...(chassisNumber !== (machine.chassisNumber ?? "") ? { chassisNumber } : {}),
        ...(yearOfManufacture && Number(yearOfManufacture) !== machine.yearOfManufacture
          ? { yearOfManufacture: Number(yearOfManufacture) }
          : {}),
      });
      if (updated) onUpdated(updated as Machine);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update machine");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Edit machine">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Asset code" name="assetCode" defaultValue={machine.assetCode} required />
          <Input
            label="Registration number"
            name="registrationNumber"
            defaultValue={machine.registrationNumber}
            required
          />
          <Input
            label="Chassis number"
            name="chassisNumber"
            defaultValue={machine.chassisNumber ?? ""}
          />
          <Input
            label="Year of manufacture"
            name="yearOfManufacture"
            type="number"
            defaultValue={machine.yearOfManufacture ?? undefined}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
