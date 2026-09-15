"use client";

import { Button, Dialog, Input } from "@fleetip/ui";
import { type FormEvent, useState } from "react";
import { apiClient } from "../../../lib/api-client";

export interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  onCreated: () => void;
}

export function CreateProjectDialog({
  open,
  onClose,
  organizationId,
  onCreated,
}: CreateProjectDialogProps) {
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const startDate = String(form.get("startDate"));
    const endDate = form.get("endDate") ? String(form.get("endDate")) : undefined;
    if (endDate && endDate < startDate) {
      setError("End date cannot be before the start date");
      return;
    }
    try {
      await apiClient.createProject(organizationId, {
        projectType: String(form.get("projectType")),
        projectName: String(form.get("projectName")),
        siteLocation: String(form.get("siteLocation")),
        state: form.get("state") ? String(form.get("state")) : undefined,
        district: form.get("district") ? String(form.get("district")) : undefined,
        startDate,
        endDate,
      });
      formElement.reset();
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New project">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Project name" name="projectName" required />
          <Input label="Project type" name="projectType" placeholder="e.g. Urban Infra" required />
          <Input label="Site location" name="siteLocation" required />
          <Input label="State" name="state" />
          <Input label="District" name="district" />
          <Input label="Start date" name="startDate" type="date" required />
          <Input label="Expected end date" name="endDate" type="date" />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Create project</Button>
        </div>
      </form>
    </Dialog>
  );
}
