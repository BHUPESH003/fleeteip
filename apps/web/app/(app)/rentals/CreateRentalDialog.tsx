"use client";

import type { Machine } from "@fleetip/contracts/equipment";
import type { OperatorScope, RateUnit } from "@fleetip/contracts/rental";
import { Button, Dialog, Input, Select } from "@fleetip/ui";
import { type FormEvent, useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";

const RATE_UNIT_OPTIONS = [
  { value: "shift", label: "Per shift" },
  { value: "day", label: "Per day" },
  { value: "week", label: "Per week" },
  { value: "month", label: "Per month" },
];

const OPERATOR_SCOPE_OPTIONS = [
  { value: "", label: "Not specified" },
  { value: "with_operator", label: "With operator" },
  { value: "without_operator", label: "Without operator" },
];

export interface CreateRentalDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  onCreated: () => void;
}

export function CreateRentalDialog({ open, onClose, organizationId, onCreated }: CreateRentalDialogProps) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [customerMode, setCustomerMode] = useState<"external" | "renter">("external");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void apiClient.listMachines(organizationId).then((list) => setMachines(list as Machine[]));
  }, [open, organizationId]);

  const activeMachines = machines.filter((m) => m.status === "active");

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const mobilizationCharge = form.get("mobilizationCharge");
    const demobilizationCharge = form.get("demobilizationCharge");
    const overtimeRate = form.get("overtimeRate");
    const noticePeriodDays = form.get("noticePeriodDays");
    const operatorScope = form.get("operatorScope");
    const endDate = form.get("endDate");
    try {
      await apiClient.createRental(organizationId, {
        machineId: String(form.get("machineId")),
        ...(customerMode === "renter"
          ? { renterOrganizationId: String(form.get("renterOrganizationId")) }
          : {
              clientSnapshot: {
                name: String(form.get("clientName")),
                contactPerson: form.get("clientContactPerson") ? String(form.get("clientContactPerson")) : undefined,
                phone: form.get("clientPhone") ? String(form.get("clientPhone")) : undefined,
                email: form.get("clientEmail") ? String(form.get("clientEmail")) : undefined,
              },
            }),
        projectName: form.get("projectName") ? String(form.get("projectName")) : undefined,
        projectLocation: form.get("projectLocation") ? String(form.get("projectLocation")) : undefined,
        startDate: String(form.get("startDate")),
        endDate: endDate ? String(endDate) : undefined,
        rate: Number(form.get("rate")),
        rateUnit: String(form.get("rateUnit")) as RateUnit,
        mobilizationCharge: mobilizationCharge ? Number(mobilizationCharge) : undefined,
        demobilizationCharge: demobilizationCharge ? Number(demobilizationCharge) : undefined,
        paymentTerms: form.get("paymentTerms") ? String(form.get("paymentTerms")) : undefined,
        shiftStructure: form.get("shiftStructure") ? String(form.get("shiftStructure")) : undefined,
        overtimeRate: overtimeRate ? Number(overtimeRate) : undefined,
        sundayCondition: form.get("sundayCondition") ? String(form.get("sundayCondition")) : undefined,
        fuelNorms: form.get("fuelNorms") ? String(form.get("fuelNorms")) : undefined,
        operatorScope: operatorScope ? (String(operatorScope) as OperatorScope) : undefined,
        noticePeriodDays: noticePeriodDays ? Number(noticePeriodDays) : undefined,
        dehireTerms: form.get("dehireTerms") ? String(form.get("dehireTerms")) : undefined,
      });
      formElement.reset();
      setCustomerMode("external");
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create rental");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Create a rental">
      <form onSubmit={handleCreate} className="flex flex-col gap-4 text-left">
        {error && <p className="text-sm text-danger">{error}</p>}
        {activeMachines.length === 0 ? (
          <p className="text-sm text-meta">Register a machine and mark it active before creating a rental.</p>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-meta">Customer</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Select
                  label="Machine"
                  name="machineId"
                  required
                  options={[
                    { value: "", label: "Select a machine" },
                    ...activeMachines.map((m) => ({ value: m.id, label: m.assetCode })),
                  ]}
                />
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-ink-muted">Customer type</span>
                  <div className="flex gap-4 text-sm text-ink-muted">
                    <label className="flex items-center gap-1.5">
                      <input type="radio" checked={customerMode === "external"} onChange={() => setCustomerMode("external")} />
                      External client
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="radio" checked={customerMode === "renter"} onChange={() => setCustomerMode("renter")} />
                      FleetIP Renter
                    </label>
                  </div>
                </div>
              </div>
              {customerMode === "external" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input label="Client name" name="clientName" required />
                  <Input label="Contact person" name="clientContactPerson" />
                  <Input label="Phone" name="clientPhone" />
                  <Input label="Email" name="clientEmail" type="email" />
                </div>
              ) : (
                <Input label="Renter organization ID" name="renterOrganizationId" required placeholder="Paste the Renter organization's ID" />
              )}
            </div>

            <div className="flex flex-col gap-1 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-meta">Project &amp; commercial terms</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input label="Project name" name="projectName" />
                <Input label="Project location" name="projectLocation" />
                <Input label="Start date" name="startDate" type="date" required />
                <Input label="End date (leave blank if open-ended)" name="endDate" type="date" />
                <Input label="Rate" name="rate" type="number" step="0.01" required />
                <Select label="Rate unit" name="rateUnit" required options={RATE_UNIT_OPTIONS} />
                <Input label="Mobilization charge" name="mobilizationCharge" type="number" step="0.01" />
                <Input label="Demobilization charge" name="demobilizationCharge" type="number" step="0.01" />
                <Input label="Notice period (days)" name="noticePeriodDays" type="number" />
                <Input label="Payment terms" name="paymentTerms" />
              </div>
            </div>

            <div className="flex flex-col gap-1 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-meta">Operating terms</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Select label="Operator" name="operatorScope" options={OPERATOR_SCOPE_OPTIONS} />
                <Input label="Overtime rate" name="overtimeRate" type="number" step="0.01" />
                <Input label="Shift structure" name="shiftStructure" />
                <Input label="Sunday condition" name="sundayCondition" />
                <Input label="Fuel norms" name="fuelNorms" />
                <Input label="Dehire terms" name="dehireTerms" />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">Create rental</Button>
            </div>
          </>
        )}
      </form>
    </Dialog>
  );
}
