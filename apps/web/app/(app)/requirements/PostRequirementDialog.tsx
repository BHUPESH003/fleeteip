"use client";

import type { ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import type { RateUnit } from "@fleetip/contracts/rental";
import { Button, Dialog, Input, Select } from "@fleetip/ui";
import { type FormEvent, useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";

const DURATION_UNIT_OPTIONS = [
  { value: "", label: "Not specified" },
  { value: "shift", label: "Shifts" },
  { value: "day", label: "Days" },
  { value: "week", label: "Weeks" },
  { value: "month", label: "Months" },
];

export interface PostRequirementDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  onPosted: () => void;
}

export function PostRequirementDialog({
  open,
  onClose,
  organizationId,
  onPosted,
}: PostRequirementDialogProps) {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [subcategories, setSubcategories] = useState<ProductSubcategory[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      setCategories((await apiClient.listProductCategories()) as ProductCategory[]);
    })();
  }, [open]);

  async function handleCategoryChange(value: string) {
    setCategoryId(value);
    setSubcategories(
      value ? ((await apiClient.listProductSubcategories(value)) as ProductSubcategory[]) : [],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const capacity = form.get("capacity");
    const durationValue = form.get("expectedDurationValue");
    const durationUnit = form.get("expectedDurationUnit");
    try {
      await apiClient.createRequirement(organizationId, {
        productSubcategoryId: String(form.get("productSubcategoryId")),
        capacity: capacity ? Number(capacity) : undefined,
        capacityUnit: form.get("capacityUnit") ? String(form.get("capacityUnit")) : undefined,
        quantity: Number(form.get("quantity") || 1),
        projectName: form.get("projectName") ? String(form.get("projectName")) : undefined,
        projectLocation: form.get("projectLocation")
          ? String(form.get("projectLocation"))
          : undefined,
        requestedStartDate: String(form.get("requestedStartDate")),
        expectedDurationValue: durationValue ? Number(durationValue) : undefined,
        expectedDurationUnit: durationUnit ? (String(durationUnit) as RateUnit) : undefined,
        shiftRequirement: form.get("shiftRequirement")
          ? String(form.get("shiftRequirement"))
          : undefined,
        validityDate: String(form.get("validityDate")),
        notes: form.get("notes") ? String(form.get("notes")) : undefined,
      });
      formElement.reset();
      setCategoryId("");
      setSubcategories([]);
      onPosted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post requirement");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Post a requirement">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-meta">Equipment</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label="Category"
              value={categoryId}
              onChange={(e) => void handleCategoryChange(e.target.value)}
              options={[
                { value: "", label: "Select a category" },
                ...categories.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            <Select
              label="Subcategory"
              name="productSubcategoryId"
              required
              disabled={!categoryId}
              options={[
                { value: "", label: subcategories.length ? "Select a subcategory" : "—" },
                ...subcategories.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-meta">
            Project &amp; schedule
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Quantity" name="quantity" type="number" defaultValue={1} min={1} />
            <Input label="Capacity" name="capacity" type="number" step="0.01" />
            <Input label="Capacity unit" name="capacityUnit" placeholder="e.g. Ton, Meter" />
            <Input label="Project name" name="projectName" />
            <Input label="Project location" name="projectLocation" />
            <Input label="Requested start date" name="requestedStartDate" type="date" required />
            <Input label="Validity date" name="validityDate" type="date" required />
            <Input label="Expected duration" name="expectedDurationValue" type="number" />
            <Select label="Duration unit" name="expectedDurationUnit" options={DURATION_UNIT_OPTIONS} />
          </div>
          <Input label="Shift requirement" name="shiftRequirement" />
          <Input label="Notes" name="notes" />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Post requirement</Button>
        </div>
      </form>
    </Dialog>
  );
}
