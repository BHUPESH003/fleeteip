"use client";

import type { AuthenticatedSession } from "@fleetip/contracts/identity";
import type { Machine } from "@fleetip/contracts/equipment";
import type { OperatorScope, RateUnit, Rental, RentalStatus } from "@fleetip/contracts/rental";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Select,
} from "@fleetip/ui";
import { useRouter } from "next/navigation";
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

// Recommendation, not legacy evidence — see docs/rental-domain-design.md §4.
// This deliberately mirrors RentalService's canTransition, purely so the UI
// doesn't offer a button guaranteed to 409; the server remains the real
// enforcement point regardless of what's rendered here.
function legalNextStatuses(current: RentalStatus): RentalStatus[] {
  if (current === "confirmed") return ["active", "cancelled"];
  if (current === "active") return ["off_rent", "cancelled"];
  if (current === "off_rent") return ["completed", "cancelled"];
  return [];
}

const STATUS_LABEL: Record<RentalStatus, string> = {
  confirmed: "Confirmed",
  active: "Active",
  off_rent: "Off-rent",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<RentalStatus, "success" | "warning" | "neutral" | "danger"> = {
  confirmed: "neutral",
  active: "success",
  off_rent: "warning",
  completed: "neutral",
  cancelled: "danger",
};

export default function RentalsPage() {
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationType, setOrganizationType] = useState<"rental_company" | "renter" | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [machines, setMachines] = useState<Machine[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [customerMode, setCustomerMode] = useState<"external" | "renter">("external");

  useEffect(() => {
    void (async () => {
      try {
        const session = (await apiClient.me()) as AuthenticatedSession;
        const firstMembership = session.memberships[0];
        if (!firstMembership) {
          router.replace("/");
          return;
        }
        setOrganizationId(firstMembership.organization.id);
        setOrganizationType(firstMembership.organization.organizationTypeCode);
      } catch {
        router.replace("/");
      }
    })();
  }, [router]);

  useEffect(() => {
    if (!organizationId || !organizationType) return;
    void (async () => {
      try {
        // A Renter has no equipment.manage permission on the Rental
        // Company's org and can't list its machines — listRentals already
        // resolves the machine/company names it needs server-side.
        const [machineList, rentalList] = await Promise.all([
          organizationType === "rental_company"
            ? apiClient.listMachines(organizationId)
            : Promise.resolve([]),
          apiClient.listRentals(organizationId),
        ]);
        setMachines(machineList as Machine[]);
        setRentals(rentalList as Rental[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load rentals");
      } finally {
        setLoading(false);
      }
    })();
  }, [organizationId, organizationType]);

  async function refreshRentals() {
    if (!organizationId) return;
    try {
      setRentals((await apiClient.listRentals(organizationId)) as Rental[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rentals");
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId) return;
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
                contactPerson: form.get("clientContactPerson")
                  ? String(form.get("clientContactPerson"))
                  : undefined,
                phone: form.get("clientPhone") ? String(form.get("clientPhone")) : undefined,
                email: form.get("clientEmail") ? String(form.get("clientEmail")) : undefined,
              },
            }),
        projectName: form.get("projectName") ? String(form.get("projectName")) : undefined,
        projectLocation: form.get("projectLocation")
          ? String(form.get("projectLocation"))
          : undefined,
        startDate: String(form.get("startDate")),
        endDate: endDate ? String(endDate) : undefined,
        rate: Number(form.get("rate")),
        rateUnit: String(form.get("rateUnit")) as RateUnit,
        mobilizationCharge: mobilizationCharge ? Number(mobilizationCharge) : undefined,
        demobilizationCharge: demobilizationCharge ? Number(demobilizationCharge) : undefined,
        paymentTerms: form.get("paymentTerms") ? String(form.get("paymentTerms")) : undefined,
        shiftStructure: form.get("shiftStructure") ? String(form.get("shiftStructure")) : undefined,
        overtimeRate: overtimeRate ? Number(overtimeRate) : undefined,
        sundayCondition: form.get("sundayCondition")
          ? String(form.get("sundayCondition"))
          : undefined,
        fuelNorms: form.get("fuelNorms") ? String(form.get("fuelNorms")) : undefined,
        operatorScope: operatorScope ? (String(operatorScope) as OperatorScope) : undefined,
        noticePeriodDays: noticePeriodDays ? Number(noticePeriodDays) : undefined,
        dehireTerms: form.get("dehireTerms") ? String(form.get("dehireTerms")) : undefined,
      });
      formElement.reset();
      setCustomerMode("external");
      await refreshRentals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create rental");
    }
  }

  async function handleStatusChange(rentalId: string, status: RentalStatus) {
    if (!organizationId) return;
    setError(null);
    try {
      await apiClient.updateRentalStatus(organizationId, rentalId, status);
      await refreshRentals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  const activeMachines = machines.filter((machine) => machine.status === "active");

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <LoadingState label="Loading rentals…" />
      </div>
    );
  }

  const isRenter = organizationType === "renter";

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        title="Rentals"
        description={
          isRenter
            ? "Machines you currently have on rent."
            : "Machines currently committed to a customer."
        }
      />

      {error && <ErrorState message={error} />}

      {isRenter ? null : (
      <Card className="mb-8 mt-4">
        <h2 className="mb-4 text-lg font-medium text-gray-900">Create a rental</h2>

        {activeMachines.length === 0 ? (
          <EmptyState
            title="No available machines"
            description="Register a machine and mark it active before creating a rental."
          />
        ) : (
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Machine"
                name="machineId"
                required
                options={[
                  { value: "", label: "Select a machine" },
                  ...activeMachines.map((machine) => ({
                    value: machine.id,
                    label: machine.assetCode,
                  })),
                ]}
              />
              <div>
                <span className="mb-1 block text-sm font-medium text-gray-700">Customer</span>
                <div className="flex gap-4 pt-2 text-sm text-gray-700">
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="customerMode"
                      checked={customerMode === "external"}
                      onChange={() => setCustomerMode("external")}
                    />
                    External client
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="customerMode"
                      checked={customerMode === "renter"}
                      onChange={() => setCustomerMode("renter")}
                    />
                    FleetIP Renter
                  </label>
                </div>
              </div>
            </div>

            {customerMode === "external" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Client name" name="clientName" required />
                <Input label="Contact person" name="clientContactPerson" />
                <Input label="Phone" name="clientPhone" />
                <Input label="Email" name="clientEmail" type="email" />
              </div>
            ) : (
              <Input
                label="Renter organization ID"
                name="renterOrganizationId"
                required
                placeholder="Paste the Renter organization's ID"
              />
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Project name" name="projectName" />
              <Input label="Project location" name="projectLocation" />
              <Input label="Start date" name="startDate" type="date" required />
              <Input label="End date (leave blank if open-ended)" name="endDate" type="date" />
              <Input label="Rate" name="rate" type="number" step="0.01" required />
              <Select label="Rate unit" name="rateUnit" required options={RATE_UNIT_OPTIONS} />
              <Input
                label="Mobilization charge"
                name="mobilizationCharge"
                type="number"
                step="0.01"
              />
              <Input
                label="Demobilization charge"
                name="demobilizationCharge"
                type="number"
                step="0.01"
              />
              <Input label="Overtime rate" name="overtimeRate" type="number" step="0.01" />
              <Input label="Notice period (days)" name="noticePeriodDays" type="number" />
              <Input label="Payment terms" name="paymentTerms" />
              <Input label="Shift structure" name="shiftStructure" />
              <Input label="Sunday condition" name="sundayCondition" />
              <Input label="Fuel norms" name="fuelNorms" />
              <Select label="Operator" name="operatorScope" options={OPERATOR_SCOPE_OPTIONS} />
              <Input label="Dehire terms" name="dehireTerms" />
            </div>

            <div>
              <Button type="submit">Create rental</Button>
            </div>
          </form>
        )}
      </Card>
      )}

      <Card>
        <h2 className="mb-4 text-lg font-medium text-gray-900">
          {isRenter ? "Your rentals" : "All rentals"}
        </h2>
        {rentals.length === 0 ? (
          <EmptyState
            title="No rentals yet"
            description={
              isRenter
                ? "Rentals you're awarded will show up here."
                : "Create one above to get started."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-2 pr-4 font-medium">Machine</th>
                  <th className="py-2 pr-4 font-medium">{isRenter ? "Rental company" : "Customer"}</th>
                  <th className="py-2 pr-4 font-medium">Period</th>
                  <th className="py-2 pr-4 font-medium">Rate</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  {isRenter ? null : <th className="py-2 pr-4 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rentals.map((rental) => {
                  const machine = machines.find((candidate) => candidate.id === rental.machineId);
                  const machineLabel = isRenter
                    ? rental.machineAssetCode ?? rental.machineId
                    : machine?.assetCode ?? rental.machineId;
                  const customer = isRenter
                    ? rental.rentalCompanyOrganizationName ?? "Unknown"
                    : rental.clientSnapshot
                      ? rental.clientSnapshot.name
                      : `Renter ${rental.renterOrganizationId?.slice(0, 8)}…`;
                  return (
                    <tr key={rental.id} className="border-b border-gray-100">
                      <td className="py-2 pr-4">{machineLabel}</td>
                      <td className="py-2 pr-4">{customer}</td>
                      <td className="py-2 pr-4">
                        {rental.startDate} → {rental.endDate ?? "open-ended"}
                      </td>
                      <td className="py-2 pr-4">
                        {rental.rate} / {rental.rateUnit}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge tone={STATUS_TONE[rental.status]}>
                          {STATUS_LABEL[rental.status]}
                        </Badge>
                      </td>
                      {isRenter ? null : (
                      <td className="py-2 pr-4">
                        <div className="flex gap-2">
                          <a
                            href={`/rentals/${rental.id}`}
                            className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            Details
                          </a>
                          {legalNextStatuses(rental.status).map((next) => (
                            <button
                              key={next}
                              onClick={() => void handleStatusChange(rental.id, next)}
                              className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                            >
                              Mark {STATUS_LABEL[next]}
                            </button>
                          ))}
                        </div>
                      </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
