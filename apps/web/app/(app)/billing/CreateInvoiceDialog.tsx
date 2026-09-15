"use client";

import type { CreateInvoiceLineItem } from "@fleetip/contracts/billing";
import type { Rental } from "@fleetip/contracts/rental";
import { Button, Dialog, Input, Select } from "@fleetip/ui";
import { type FormEvent, useState } from "react";
import { apiClient } from "../../../lib/api-client";

export interface CreateInvoiceDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  rentals: Rental[];
  onCreated: () => void;
}

function rentalLabel(rental: Rental): string {
  const customer = rental.clientSnapshot?.name ?? `Renter ${rental.renterOrganizationId?.slice(0, 8) ?? ""}…`;
  return `${rental.machineAssetCode ?? rental.machineId.slice(0, 8)} · ${customer} · ${rental.startDate}`;
}

export function CreateInvoiceDialog({ open, onClose, organizationId, rentals, onCreated }: CreateInvoiceDialogProps) {
  const [lineItems, setLineItems] = useState<CreateInvoiceLineItem[]>([{ description: "", quantity: 1, rate: 0 }]);
  const [error, setError] = useState<string | null>(null);

  function updateLineItem(index: number, patch: Partial<CreateInvoiceLineItem>) {
    setLineItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function reset() {
    setLineItems([{ description: "", quantity: 1, rate: 0 }]);
    setError(null);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const taxAmount = form.get("taxAmount");
    const adjustmentAmount = form.get("adjustmentAmount");
    const billingPeriodStart = String(form.get("billingPeriodStart"));
    const billingPeriodEnd = String(form.get("billingPeriodEnd"));
    const dueDate = String(form.get("dueDate"));
    if (billingPeriodEnd < billingPeriodStart) {
      setError("Billing period end cannot be before the billing period start");
      return;
    }
    if (dueDate < billingPeriodEnd) {
      setError("Due date cannot be before the billing period ends");
      return;
    }
    try {
      await apiClient.createInvoice(organizationId, {
        rentalId: String(form.get("rentalId")),
        billingPeriodStart,
        billingPeriodEnd,
        dueDate,
        taxAmount: taxAmount ? Number(taxAmount) : undefined,
        adjustmentAmount: adjustmentAmount ? Number(adjustmentAmount) : undefined,
        lineItems: lineItems.filter((item) => item.description),
      });
      formElement.reset();
      reset();
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Create an invoice"
    >
      <form onSubmit={handleCreate} className="flex flex-col gap-4 text-left">
        {error && <p className="text-sm text-danger">{error}</p>}
        {rentals.length === 0 ? (
          <p className="text-sm text-meta">Create a rental before invoicing it.</p>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-meta">Rental &amp; period</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Select
                  label="Rental"
                  name="rentalId"
                  required
                  className="sm:col-span-2"
                  options={rentals.map((rental) => ({ value: rental.id, label: rentalLabel(rental) }))}
                />
                <Input label="Billing period start" name="billingPeriodStart" type="date" required />
                <Input label="Billing period end" name="billingPeriodEnd" type="date" required />
                <Input label="Due date" name="dueDate" type="date" required />
                <Input label="Tax amount" name="taxAmount" type="number" step="0.01" />
                <Input label="Adjustment (+/-)" name="adjustmentAmount" type="number" step="0.01" />
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-meta">Line items</p>
              <div className="flex flex-col gap-2">
                {lineItems.map((item, index) => (
                  <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_1fr]">
                    <Input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateLineItem(index, { description: e.target.value })}
                    />
                    <Input
                      type="number"
                      placeholder="Quantity"
                      value={item.quantity}
                      onChange={(e) => updateLineItem(index, { quantity: Number(e.target.value) })}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Rate"
                      value={item.rate}
                      onChange={(e) => updateLineItem(index, { rate: Number(e.target.value) })}
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setLineItems((prev) => [...prev, { description: "", quantity: 1, rate: 0 }])}
                className="w-fit text-xs font-medium text-accent-text hover:underline"
              >
                + Add line item
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">Create invoice</Button>
            </div>
          </>
        )}
      </form>
    </Dialog>
  );
}
