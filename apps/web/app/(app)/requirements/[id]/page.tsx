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
  responses: QuotationResponse[];
  rentalCompanyNames: Map<string, string>;
  quotationByResponseId: Map<string, CommercialQuotation>;
  activity: { id: string; text: string; when: string }[];
}

export default function RequirementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  // Counterparty names / linked quotations are enrichment, not the point of
  // this page (rfq.manage is) — a role without quotation.respond still gets
  // a fully working requirement view, just without rental-company names or
  // linked-quotation links resolved.
  const canRespondToQuotations = hasPermission("quotation.respond");

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  async function load(orgId: string) {
    const requirement = (await apiClient.getRequirement(orgId, id)) as Requirement;
    // listRentalCompanyOrganizations and listQuotations need quotation.respond
    // (used only to resolve counterparty names / linked quotations below);
    // listProductCategories is an open read, listNotifications needs no
    // specific permission — neither is gated.
    const [categories, responses, rentalCompanyOrgs, quotations, notifications] = await Promise.all(
      [
        apiClient.listProductCategories() as Promise<ProductCategory[]>,
        apiClient.listResponsesForRequirement(orgId, id) as Promise<QuotationResponse[]>,
        canRespondToQuotations
          ? (apiClient.listRentalCompanyOrganizations(orgId) as Promise<Organization[]>)
          : Promise.resolve([]),
        canRespondToQuotations
          ? (apiClient.listQuotations(orgId) as Promise<CommercialQuotation[]>)
          : Promise.resolve([]),
        apiClient.listNotifications(orgId) as Promise<NotificationListResponse>,
      ],
    );
    const subcategoryLists = await Promise.all(
      categories.map(
        (c) => apiClient.listProductSubcategories(c.id) as Promise<ProductSubcategory[]>,
      ),
    );
    const subcategory = subcategoryLists
      .flat()
      .find((s) => s.id === requirement.productSubcategoryId);

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
  }, [organizationId, id, canRespondToQuotations]);

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
    activity,
  } = data;
  const interested = responses.filter((r) => r.status === "interested");
  const rates = interested.map((r) => r.indicativeRate).filter((r): r is number => r != null);
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
          Posted {formatDate(requirement.createdAt)} · quantity {requirement.quantity} ·{" "}
          {responses.length} response{responses.length === 1 ? "" : "s"}
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
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Stat label="Responses" value={String(responses.length)} />
            <Stat
              label="Interested"
              value={String(interested.length)}
              note={`${responses.length - interested.length} not interested`}
            />
            <Stat label="Rate spread" value={rateSpreadPct != null ? `${rateSpreadPct}%` : "—"} />
            <Stat label="Lowest indicative" value={lowestRate != null ? String(lowestRate) : "—"} />
          </div>

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
                            ) : (
                              <Link
                                href={`/quotations?requirementId=${requirement.id}`}
                                className="text-xs font-medium text-accent-text"
                              >
                                Request quotation
                              </Link>
                            ))}
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            )}
          </Card>
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
