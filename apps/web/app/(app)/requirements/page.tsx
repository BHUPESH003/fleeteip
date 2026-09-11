"use client";

import type { ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import type { QuotationResponse } from "@fleetip/contracts/quotation";
import type { RateUnit } from "@fleetip/contracts/rental";
import type { Requirement, RequirementStatus } from "@fleetip/contracts/rfq";
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
import Link from "next/link";
import { Fragment, type FormEvent, useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { useSession } from "../../../lib/session-context";

const STATUS_TONE: Record<RequirementStatus, "success" | "warning" | "neutral" | "danger"> = {
  open: "success",
  closed: "neutral",
  cancelled: "danger",
};

const DURATION_UNIT_OPTIONS = [
  { value: "", label: "Not specified" },
  { value: "shift", label: "Shifts" },
  { value: "day", label: "Days" },
  { value: "week", label: "Weeks" },
  { value: "month", label: "Months" },
];

function RenterView({ organizationId }: { organizationId: string }) {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [subcategories, setSubcategories] = useState<ProductSubcategory[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [responses, setResponses] = useState<QuotationResponse[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const [reqs, cats] = await Promise.all([
          apiClient.listRequirements(organizationId),
          apiClient.listProductCategories(),
        ]);
        setRequirements(reqs as Requirement[]);
        setCategories(cats as ProductCategory[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load requirements");
      } finally {
        setLoading(false);
      }
    })();
  }, [organizationId]);

  useEffect(() => {
    if (!categoryId) {
      setSubcategories([]);
      return;
    }
    void apiClient
      .listProductSubcategories(categoryId)
      .then((list) => setSubcategories(list as ProductSubcategory[]));
  }, [categoryId]);

  async function refresh() {
    setRequirements((await apiClient.listRequirements(organizationId)) as Requirement[]);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
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
        quantity: Number(form.get("quantity") || 1),
        projectName: form.get("projectName") ? String(form.get("projectName")) : undefined,
        projectLocation: form.get("projectLocation")
          ? String(form.get("projectLocation"))
          : undefined,
        requestedStartDate: String(form.get("requestedStartDate")),
        expectedDurationValue: durationValue ? Number(durationValue) : undefined,
        expectedDurationUnit: durationUnit ? (String(durationUnit) as RateUnit) : undefined,
        validityDate: String(form.get("validityDate")),
        notes: form.get("notes") ? String(form.get("notes")) : undefined,
      });
      formElement.reset();
      setCategoryId("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create requirement");
    }
  }

  async function handleStatusChange(requirementId: string, status: "closed" | "cancelled") {
    setError(null);
    try {
      await apiClient.updateRequirementStatus(organizationId, requirementId, status);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update requirement");
    }
  }

  async function viewResponses(requirementId: string) {
    setError(null);
    if (selectedId === requirementId) {
      setSelectedId(null);
      return;
    }
    setSelectedId(requirementId);
    try {
      setResponses(
        (await apiClient.listResponsesForRequirement(
          organizationId,
          requirementId,
        )) as QuotationResponse[],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load responses");
    }
  }

  if (loading) return <LoadingState label="Loading requirements…" />;

  return (
    <>
      {error && <ErrorState message={error} />}

      <Card className="mb-8 mt-4">
        <h2 className="mb-4 text-lg font-medium text-gray-900">Post a requirement</h2>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Equipment category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Quantity" name="quantity" type="number" defaultValue={1} min={1} />
            <Input label="Capacity" name="capacity" type="number" step="0.01" />
            <Input label="Project name" name="projectName" />
            <Input label="Project location" name="projectLocation" />
            <Input label="Requested start date" name="requestedStartDate" type="date" required />
            <Input label="Validity date" name="validityDate" type="date" required />
            <Input label="Expected duration" name="expectedDurationValue" type="number" />
            <Select
              label="Duration unit"
              name="expectedDurationUnit"
              options={DURATION_UNIT_OPTIONS}
            />
          </div>
          <Input label="Notes" name="notes" />
          <div>
            <Button type="submit">Post requirement</Button>
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-medium text-gray-900">Your requirements</h2>
        {requirements.length === 0 ? (
          <EmptyState
            title="No requirements yet"
            description="Post one above to start receiving quotes."
          />
        ) : (
          <>
            {/* Mobile: stacked cards — a wide action-heavy table doesn't fit a
                small screen even with horizontal scroll. See
                docs/frontend-review.md. */}
            <ul className="flex flex-col gap-3 sm:hidden">
              {requirements.map((req) => (
                <li key={req.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="font-medium text-gray-900">{req.projectName ?? "Requirement"}</p>
                    <Badge tone={STATUS_TONE[req.status]}>{req.status}</Badge>
                  </div>
                  <p className="mb-3 text-sm text-gray-500">
                    Start {req.requestedStartDate} · Valid until {req.validityDate}
                  </p>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => void viewResponses(req.id)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      {selectedId === req.id ? "Hide responses" : "View responses"}
                    </button>
                    <Link
                      href={`/auctions?requirementId=${req.id}`}
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-center text-xs text-gray-700 hover:bg-gray-50"
                    >
                      Auction
                    </Link>
                    {req.status === "open" && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => void handleStatusChange(req.id, "closed")}
                          className="rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          Close
                        </button>
                        <button
                          onClick={() => void handleStatusChange(req.id, "cancelled")}
                          className="rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                  {selectedId === req.id && (
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      {responses.length === 0 ? (
                        <p className="text-sm text-gray-500">No responses yet.</p>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {responses.map((response) => (
                            <li key={response.id} className="text-sm">
                              <Badge
                                tone={response.status === "interested" ? "success" : "neutral"}
                              >
                                {response.status}
                              </Badge>{" "}
                              {response.indicativeRate
                                ? `${response.indicativeRate} / ${response.indicativeRateUnit}`
                                : "—"}{" "}
                              <span className="text-gray-500">
                                {response.rentalCompanyOrganizationId.slice(0, 8)}…
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="py-2 pr-4 font-medium">Project</th>
                    <th className="py-2 pr-4 font-medium">Start date</th>
                    <th className="py-2 pr-4 font-medium">Validity</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requirements.map((req) => (
                    <Fragment key={req.id}>
                      <tr className="border-b border-gray-100">
                        <td className="py-2 pr-4">{req.projectName ?? "—"}</td>
                        <td className="py-2 pr-4">{req.requestedStartDate}</td>
                        <td className="py-2 pr-4">{req.validityDate}</td>
                        <td className="py-2 pr-4">
                          <Badge tone={STATUS_TONE[req.status]}>{req.status}</Badge>
                        </td>
                        <td className="py-2 pr-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => void viewResponses(req.id)}
                              className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                            >
                              {selectedId === req.id ? "Hide responses" : "View responses"}
                            </button>
                            <Link
                              href={`/auctions?requirementId=${req.id}`}
                              className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                            >
                              Auction
                            </Link>
                            {req.status === "open" && (
                              <>
                                <button
                                  onClick={() => void handleStatusChange(req.id, "closed")}
                                  className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                >
                                  Close
                                </button>
                                <button
                                  onClick={() => void handleStatusChange(req.id, "cancelled")}
                                  className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {selectedId === req.id && (
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <td colSpan={5} className="px-4 py-3">
                            {responses.length === 0 ? (
                              <p className="text-sm text-gray-500">No responses yet.</p>
                            ) : (
                              <ul className="flex flex-col gap-2">
                                {responses.map((response) => (
                                  <li key={response.id} className="flex items-center gap-3 text-sm">
                                    <Badge
                                      tone={
                                        response.status === "interested" ? "success" : "neutral"
                                      }
                                    >
                                      {response.status}
                                    </Badge>
                                    <span>
                                      {response.indicativeRate
                                        ? `${response.indicativeRate} / ${response.indicativeRateUnit}`
                                        : "—"}
                                    </span>
                                    <span className="text-gray-500">
                                      {response.rentalCompanyOrganizationId.slice(0, 8)}…
                                    </span>
                                    {response.notes && (
                                      <span className="text-gray-500">{response.notes}</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </>
  );
}

function RentalCompanyView({ organizationId }: { organizationId: string }) {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setRequirements((await apiClient.discoverRequirements(organizationId)) as Requirement[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load requirements");
      } finally {
        setLoading(false);
      }
    })();
  }, [organizationId]);

  async function handleRespond(event: FormEvent<HTMLFormElement>, requirementId: string) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const interested = form.get("interested") === "yes";
    try {
      await apiClient.submitResponse(organizationId, requirementId, {
        status: interested ? "interested" : "not_interested",
        indicativeRate: interested ? Number(form.get("indicativeRate")) : undefined,
        indicativeRateUnit: interested
          ? (String(form.get("indicativeRateUnit")) as "shift" | "day" | "week" | "month")
          : undefined,
        notes: form.get("notes") ? String(form.get("notes")) : undefined,
      });
      setRespondingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit response");
    }
  }

  if (loading) return <LoadingState label="Loading open requirements…" />;

  return (
    <>
      {error && <ErrorState message={error} />}
      <Card className="mt-4">
        <h2 className="mb-4 text-lg font-medium text-gray-900">Open requirements</h2>
        {requirements.length === 0 ? (
          <EmptyState
            title="No open requirements"
            description="Check back once a Renter posts a requirement."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {requirements.map((req) => (
              <li key={req.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{req.projectName ?? "Requirement"}</p>
                    <p className="text-sm text-gray-500">
                      Qty {req.quantity} · Needed {req.requestedStartDate} · Valid until{" "}
                      {req.validityDate}
                    </p>
                    {req.notes && <p className="text-sm text-gray-500">{req.notes}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRespondingId(respondingId === req.id ? null : req.id)}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      Respond
                    </button>
                    <Link
                      href={`/quotations?requirementId=${req.id}`}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      Quote
                    </Link>
                    <Link
                      href={`/auctions?requirementId=${req.id}`}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      Auction
                    </Link>
                  </div>
                </div>
                {respondingId === req.id && (
                  <form
                    onSubmit={(event) => void handleRespond(event, req.id)}
                    className="mt-3 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-3"
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="interested" value="yes" defaultChecked required />
                      Interested
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="interested" value="no" required />
                      Not interested
                    </label>
                    <Input label="Rate" name="indicativeRate" type="number" step="0.01" />
                    <Select
                      label="Unit"
                      name="indicativeRateUnit"
                      options={[
                        { value: "shift", label: "Shift" },
                        { value: "day", label: "Day" },
                        { value: "week", label: "Week" },
                        { value: "month", label: "Month" },
                      ]}
                    />
                    <Input label="Notes" name="notes" />
                    <Button type="submit">Submit</Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

export default function RequirementsPage() {
  const { currentMembership } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;

  return (
    <>
      <PageHeader
        title="Requirements"
        description={
          organizationType === "renter"
            ? "Post equipment requirements and compare Rental Company responses."
            : "Discover open requirements from Renters and respond."
        }
      />
      {organizationId && organizationType === "renter" && (
        <RenterView organizationId={organizationId} />
      )}
      {organizationId && organizationType === "rental_company" && (
        <RentalCompanyView organizationId={organizationId} />
      )}
    </>
  );
}
