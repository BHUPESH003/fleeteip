"use client";

import type { Requirement } from "@fleetip/contracts/rfq";
import { Button, Dialog, Input } from "@fleetip/ui";
import { type FormEvent, useState } from "react";
import { apiClient } from "../../../lib/api-client";

export interface EditRequirementDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  requirement: Requirement;
  onUpdated: (requirement: Requirement) => void;
}

export function EditRequirementDialog({
  open,
  onClose,
  organizationId,
  requirement,
  onUpdated,
}: EditRequirementDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const projectName = String(form.get("projectName") ?? "").trim();
    const projectLocation = String(form.get("projectLocation") ?? "").trim();
    const quantity = Number(form.get("quantity"));
    const requestedStartDate = String(form.get("requestedStartDate") ?? "");

    setSubmitting(true);
    try {
      const updated = await apiClient.updateRequirement(organizationId, requirement.id, {
        ...(projectName !== (requirement.projectName ?? "") ? { projectName } : {}),
        ...(projectLocation !== (requirement.projectLocation ?? "") ? { projectLocation } : {}),
        ...(quantity && quantity !== requirement.quantity ? { quantity } : {}),
        ...(requestedStartDate !== requirement.requestedStartDate
          ? { requestedStartDate }
          : {}),
      });
      if (updated) onUpdated(updated as Requirement);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update requirement");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Edit requirement">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Project name"
            name="projectName"
            defaultValue={requirement.projectName ?? ""}
          />
          <Input
            label="Project location"
            name="projectLocation"
            defaultValue={requirement.projectLocation ?? ""}
          />
          <Input
            label="Quantity"
            name="quantity"
            type="number"
            min={1}
            defaultValue={requirement.quantity}
            required
          />
          <Input
            label="Requested start date"
            name="requestedStartDate"
            type="date"
            defaultValue={requirement.requestedStartDate}
            required
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
