"use client";

import type { ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import type { NotificationListResponse } from "@fleetip/contracts/notification";
import type { Organization } from "@fleetip/contracts/organization";
import type { CommercialQuotation, QuotationResponse } from "@fleetip/contracts/quotation";
import type { Requirement } from "@fleetip/contracts/rfq";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@fleetip/ui";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiClient } from "../../../../lib/api-client";
import { formatDate, formatRelativeTime } from "../../../../lib/format";
import { useSession } from "../../../../lib/session-context";
import { EditRequirementDialog } from "../EditRequirementDialog";
import { REQUIREMENT_STATUS_MAP, RESPONSE_STATUS_MAP, validityTone } from "../shared";

interface Loaded {
  requirement: Requirement;
  subcategoryName: string | null;
  // Renter-only — every Rental Company's reply. Empty for a Rental Company
  // viewer (see myResponse below instead): showing every competitor's name
  // and indicative rate to another Rental Company would be a real
  // cross-tenant leak, not just a missing feature.
  responses: QuotationResponse[];
  rentalCompanyNames: Map<string, string>;
  quotationByResponseId: Map<string, CommercialQuotation>;
  // Rental Company-only — this org's own reply and, if formalized, its own
  // linked quotation. Null for a Renter viewer.
  myResponse: QuotationResponse | null;
  myQuotation: CommercialQuotation | null;
  activity: { id: string; text: string; when: string }[];
}

export default function RequirementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  const isRentalCompany = organizationType === "rental_company";
  // Counterparty names / linked quotations are enrichment, not the point of
  // this page (rfq.manage is) — a role without quotation.respond still gets
  // a fully working requirement view, just without rental-company names or
  // linked-quotation links resolved.
  const canRespondToQuotations = hasPermission("quotation.respond");

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  // rentalCompanyOrganizationIds this session has just requested a
  // quotation from — swaps that response row's button for confirmation
  // instead of re-navigating away, so it stays put next to the response.
  const [requestedFrom, setRequestedFrom] = useState<Set<string>>(new Set());
  // Separate from `error` deliberately — that one renders as a full-page
  // ErrorState, too disruptive for one row's action failing.
  const [requestQuotationError, setRequestQuotationError] = useState<string | null>(null);

  async function handleRequestQuotation(rentalCompanyOrganizationId: string) {
    if (!organizationId) return;
    setRequestQuotationError(null);
    try {
      await apiClient.requestQuotation(organizationId, id, rentalCompanyOrganizationId);
      setRequestedFrom((prev) => new Set(prev).add(rentalCompanyOrganizationId));
    } catch (err) {
      setRequestQuotationError(err instanceof Error ? err.message : "Failed to request a quotation");
    }
  }

  async function load(orgId: string) {
    // A Rental Company has no rfq.manage on the Renter's own org — the
    // Renter-scoped getRequirement/listResponsesForRequirement endpoints
    // 404/403 for them. Discovery is the read path they actually hold
    // (rfq.respond), same one OpenMarket and CreateQuotationDialog already
    // use for exactly this reason.
    const requirement = (
      isRentalCompany
        ? await apiClient.getRequirementForDiscovery(orgId, id)
        : await apiClient.getRequirement(orgId, id)
    ) as Requirement;

    const [categories, notifications] = await Promise.all([
      apiClient.listProductCategories() as Promise<ProductCategory[]>,
      apiClient.listNotifications(orgId) as Promise<NotificationListResponse>,
    ]);
    const subcategoryLists = await Promise.all(
      categories.map(
        (c) => apiClient.listProductSubcategories(c.id) as Promise<ProductSubcategory[]>,
      ),
    );
    const subcategory = subcategoryLists
      .flat()
      .find((s) => s.id === requirement.productSubcategoryId);

    if (isRentalCompany) {
      let myResponse: QuotationResponse | null = null;
      try {
        myResponse = (await apiClient.getMyResponse(orgId, id)) as QuotationResponse;
      } catch {
        // No response submitted yet — fine.
      }
      const quotations = myResponse
        ? ((await apiClient.listQuotations(orgId)) as CommercialQuotation[])
        : [];
      const myQuotation =
        quotations.find((q) => q.quotationResponseId === myResponse?.id) ?? null;

      setData({
        requirement,
        subcategoryName: subcategory?.name ?? null,
        responses: [],
        rentalCompanyNames: new Map(),
        quotationByResponseId: new Map(),
        myResponse,
        myQuotation,
        activity: notifications.notifications
          .filter((n) => n.relatedResourceType === "requirement" && n.relatedResourceId === id)
          .map((n) => ({ id: n.id, text: n.message, when: formatRelativeTime(n.createdAt) })),
      });
      return;
    }

    // listRentalCompanyOrganizations and listQuotations need quotation.respond
    // (used only to resolve counterparty names / linked quotations below).
    const [responses, rentalCompanyOrgs, quotations] = await Promise.all([
      apiClient.listResponsesForRequirement(orgId, id) as Promise<QuotationResponse[]>,
      canRespondToQuotations
        ? (apiClient.listRentalCompanyOrganizations(orgId) as Promise<Organization[]>)
        : Promise.resolve([]),
      canRespondToQuotations
        ? (apiClient.listQuotations(orgId) as Promise<CommercialQuotation[]>)
        : Promise.resolve([]),
    ]);

    setData({
      requirement,
      subcategoryName: subcategory?.name ?? null,
      responses,
      rentalCompanyNames: new Map(rentalCompanyOrgs.map((o) => [o.id, o.name])),
      quotationByResponseId: new Map(
        quotations
          .filter((q) => q.quotationResponseId)
          .map((q) => [q.quotationResponseId as string, q]),
      ),
      myResponse: null,
      myQuotation: null,
      activity: notifications.notifications
        .filter((n) => n.relatedResourceType === "requirement" && n.relatedResourceId === id)
        .map((n) => ({ id: n.id, text: n.message, when: formatRelativeTime(n.createdAt) })),
    });
  }

  useEffect(() => {
    if (!organizationId) return;
    void (async () => {
      try {
        await load(organizationId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load requirement");
      }
    })();
  }, [organizationId, id, canRespondToQuotations, isRentalCompany]);

  async function handleClose() {
    if (!organizationId) return;
    await apiClient.updateRequirementStatus(organizationId, id, "closed");
    await load(organizationId);
  }

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Loading requirement…" />;

  const {
    requirement,
    subcategoryName,
    responses,
    rentalCompanyNames,
    quotationByResponseId,
    myResponse,
    myQuotation,
    activity,
  } = data;
  const interested = responses.filter((r) => r.status === "interested");
  // "Lowest"/"spread" only mean something when every response is quoted in
  // the same unit — comparing 6000/day against 150000/month as raw numbers
  // is meaningless. Submitting a response now locks indicativeRateUnit to
  // the requirement's own expectedDurationUnit when it has one, so this
  // mismatch shouldn't come up in practice — but a requirement with no
  // expectedDurationUnit still leaves the unit to each responder's choice.
  const rateUnits = new Set(interested.map((r) => r.indicativeRateUnit).filter(Boolean));
  const mixedRateUnits = rateUnits.size > 1;
  const commonRateUnit = rateUnits.size === 1 ? [...rateUnits][0] : null;
  const rates = mixedRateUnits
    ? []
    : interested.map((r) => r.indicativeRate).filter((r): r is number => r != null);
  const lowestRate = rates.length ? Math.min(...rates) : null;
  const rateSpreadPct =
    rates.length > 1
      ? Math.round(((Math.max(...rates) - Math.min(...rates)) / Math.min(...rates)) * 100)
      : null;

  const title = [
    requirement.capacity ? `${requirement.capacity}${requirement.capacityUnit ?? ""}` : null,
    subcategoryName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumbs={[
          { label: "Requirements", href: "/requirements" },
          { label: `REQ-${requirement.id.slice(0, 8).toUpperCase()}` },
        ]}
        title={title || "Requirement"}
        actions={
          isRentalCompany ? undefined : (
            <div className="flex flex-wrap gap-2">
              {requirement.status === "open" && (
                <Button variant="secondary" onClick={() => void handleClose()}>
                  Close requirement
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => setEditOpen(true)}
                disabled={requirement.status !== "open"}
                title={
                  requirement.status !== "open"
                    ? "Editing is only available while the requirement is open"
                    : undefined
                }
              >
                Edit
              </Button>
              <Button onClick={() => router.push(`/auctions?requirementId=${requirement.id}`)}>
                Start auction
              </Button>
            </div>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={requirement.status} map={REQUIREMENT_STATUS_MAP} />
        {requirement.status === "open" && (
          <Badge tone={validityTone(requirement.validityDate)}>
            Validity ends {formatDate(requirement.validityDate)}
          </Badge>
        )}
        <span className="text-sm text-meta">
          Posted {formatDate(requirement.createdAt)} · quantity {requirement.quantity}
          {!isRentalCompany && (
            <> · {responses.length} response{responses.length === 1 ? "" : "s"}</>
          )}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-3.5">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-ink">Requirement</h2>
            <div className="flex flex-col gap-2.5">
              <Field label="Equipment" value={subcategoryName ?? "—"} />
              <Field label="Quantity" value={String(requirement.quantity)} mono />
              <Field label="Project" value={requirement.projectName ?? "—"} />
              <Field label="Location" value={requirement.projectLocation ?? "—"} />
              <Field
                label="Requested start"
                value={formatDate(requirement.requestedStartDate)}
                mono
              />
              <Field
                label="Expected duration"
                value={
                  requirement.expectedDurationValue
                    ? `${requirement.expectedDurationValue} ${requirement.expectedDurationUnit}(s)`
                    : "—"
                }
              />
              <Field label="Shift requirement" value={requirement.shiftRequirement ?? "—"} />
              <Field label="Validity" value={formatDate(requirement.validityDate)} mono />
              {requirement.notes && <Field label="Notes" value={requirement.notes} />}
            </div>
          </Card>
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-ink">Activity</h2>
            {activity.length === 0 ? (
              <p className="text-sm text-meta">No activity yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {activity.map((item) => (
                  <div key={item.id} className="flex flex-col gap-0.5">
                    <span className="text-xs text-ink">{item.text}</span>
                    <span className="text-[11px] text-meta-light">{item.when}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-3.5">
          {isRentalCompany ? (
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-ink">Your response</h2>
              {myResponse ? (
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={myResponse.status} map={RESPONSE_STATUS_MAP} />
                    {myResponse.indicativeRate != null && (
                      <span className="font-mono text-sm text-ink">
                        {myResponse.indicativeRate} / {myResponse.indicativeRateUnit}
                      </span>
                    )}
                  </div>
                  {myResponse.notes && <p className="text-sm text-meta">{myResponse.notes}</p>}
                  {myQuotation ? (
                    <Link
                      href={`/quotations?quotationId=${myQuotation.id}`}
                      className="text-xs font-medium text-accent-text"
                    >
                      Open {myQuotation.referenceNumber}
                    </Link>
                  ) : myResponse.status === "interested" ? (
                    <p className="text-xs text-meta">
                      {myResponse.quotationRequestedAt
                        ? "The Renter has requested a formal quotation — formalize it from Quotations."
                        : "No formal quotation created yet."}
                    </p>
                  ) : null}
                </div>
              ) : (
                <EmptyState
                  title="No response submitted yet"
                  description="Respond to this requirement from the Open Market."
                />
              )}
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Stat label="Responses" value={String(responses.length)} />
                <Stat
                  label="Interested"
                  value={String(interested.length)}
                  note={`${responses.length - interested.length} not interested`}
                />
                <Stat
                  label="Rate spread"
                  value={rateSpreadPct != null ? `${rateSpreadPct}%` : mixedRateUnits ? "Mixed units" : "—"}
                />
                <Stat
                  label="Lowest indicative"
                  value={lowestRate != null ? `${lowestRate} / ${commonRateUnit}` : mixedRateUnits ? "Mixed units" : "—"}
                />
              </div>

              {requestQuotationError && <p className="text-sm text-danger">{requestQuotationError}</p>}

              <Card padding={responses.length === 0 ? "md" : "none"}>
            {responses.length === 0 ? (
              <EmptyState
                title="No responses yet"
                description="Check back once a Rental Company responds."
              />
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Rental company</Th>
                    <Th>Indicative rate</Th>
                    <Th>Notes</Th>
                    <Th>Response</Th>
                    <Th />
                  </Tr>
                </Thead>
                <Tbody>
                  {responses.map((response) => {
                    const linkedQuotation = quotationByResponseId.get(response.id);
                    const isLowest =
                      response.status === "interested" &&
                      response.indicativeRate != null &&
                      response.indicativeRate === lowestRate;
                    return (
                      <Tr key={response.id}>
                        <Td>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-ink">
                              {rentalCompanyNames.get(response.rentalCompanyOrganizationId) ??
                                "Rental company"}
                            </span>
                            {isLowest && <Badge tone="success">Lowest</Badge>}
                          </div>
                        </Td>
                        <Td className="font-mono">
                          {response.indicativeRate
                            ? `${response.indicativeRate} / ${response.indicativeRateUnit}`
                            : "—"}
                        </Td>
                        <Td className="text-meta">{response.notes ?? "—"}</Td>
                        <Td>
                          <StatusBadge status={response.status} map={RESPONSE_STATUS_MAP} />
                        </Td>
                        <Td>
                          {response.status === "interested" &&
                            (linkedQuotation ? (
                              <Link
                                href={`/quotations?quotationId=${linkedQuotation.id}`}
                                className="text-xs font-medium text-accent-text"
                              >
                                Open {linkedQuotation.referenceNumber}
                              </Link>
                            ) : requestedFrom.has(response.rentalCompanyOrganizationId) ? (
                              <span className="text-xs text-meta">Requested</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleRequestQuotation(response.rentalCompanyOrganizationId)
                                }
                                className="text-xs font-medium text-accent-text"
                              >
                                Request quotation
                              </button>
                            ))}
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            )}
              </Card>
            </>
          )}
        </div>
      </div>

      {organizationId && (
        <EditRequirementDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          organizationId={organizationId}
          requirement={requirement}
          onUpdated={(updated) =>
            setData((prev) => (prev ? { ...prev, requirement: updated } : prev))
          }
        />
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-0">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-meta">{label}</span>
      <span className={["text-sm text-ink", mono && "font-mono"].filter(Boolean).join(" ")}>
        {value}
      </span>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card padding="sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-meta">{label}</p>
      <p className="mt-1 font-mono text-xl font-medium text-ink">{value}</p>
      {note && <p className="mt-1 text-[11px] text-meta">{note}</p>}
    </Card>
  );
}
