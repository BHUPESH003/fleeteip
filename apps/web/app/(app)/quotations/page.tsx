"use client";

import type { Product } from "@fleetip/contracts/catalogue";
import type { Machine } from "@fleetip/contracts/equipment";
import { OrganizationTypeCode, type Organization } from "@fleetip/contracts/organization";
import { CommercialQuotationStatus, type CommercialQuotation, type QuotationResponse } from "@fleetip/contracts/quotation";
import { RequirementStatus, type Requirement } from "@fleetip/contracts/rfq";
import {
  AttentionStrip,
  Badge,
  Button,
  CellStack,
  EmptyState,
  ErrorState,
  PageBody,
  PageHeader,
  Pagination,
  Select,
  Table,
  TableFooter,
  TableSkeleton,
  TableToolbar,
  TabPanel,
  Tabs,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  UILink,
  cx,
} from "@fleetip/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ForbiddenPage } from "../../../components/PageStates";
import { apiClient } from "../../../lib/api-client";
import { useConnection } from "../../../lib/connection";
import { describeError, OFFLINE_HINT } from "../../../lib/errors";
import { formatCompactRange, formatDate, formatMoney, formatRate, formatRateUnit, plural, todayIsoDate } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { Status, statusLabel, statusOptions } from "../../../lib/status";
import { optional, useLoad } from "../../../lib/use-load";
import { auctionRef } from "../auctions/shared";
import { productName } from "../machines/shared";
import { ListPageSkeleton, SearchField, compareNumber, directed, pageSlice, PAGE_SIZE, useListState } from "../requirements/list-kit";
import { equipmentLine, loadSubcategoryIndex, requirementRef, type SubcategoryEntry } from "../requirements/shared";
import { CreateQuotationDialog } from "./CreateQuotationDialog";
import { acceptanceLabel, isNegotiable, quotationCustomer, quotationValidity } from "./shared";

type Viewer = "renter" | "rental_company";

interface RequestedRow {
  response: QuotationResponse;
  /** null when the requirement couldn't be read (it may have closed). */
  requirement: Requirement | null;
  equipment: string | null;
}

interface ListData {
  quotations: CommercialQuotation[];
  /** Rental Company with equipment.manage; null otherwise (the Renter gets machineAssetCode/productName on each quotation). */
  machines: Map<string, Machine> | null;
  products: Map<string, Product>;
  renterNames: Map<string, string> | null;
  companyNames: Map<string, string> | null;
  /**
   * Rental Company only: responses the Renter explicitly asked to formalize
   * ("Request quotation") that no quotation carries yet. null without
   * rfq.respond.
   */
  requested: RequestedRow[] | null;
}

interface Access {
  machines: boolean;
  requested: boolean;
}

async function loadList(organizationId: string, viewer: Viewer, access: Access): Promise<ListData> {
  const quotations = (await apiClient.listQuotations(organizationId)) as CommercialQuotation[];
  if (viewer === "renter") {
    // listQuotations already hides drafts from the Renter (server-side).
    const companies = await optional(
      true,
      () => apiClient.listRentalCompanyOrganizations(organizationId) as Promise<Organization[]>,
      null as Organization[] | null,
    );
    return {
      quotations,
      machines: null,
      products: new Map(),
      renterNames: null,
      companyNames: companies ? new Map(companies.map((o) => [o.id, o.name])) : null,
      requested: null,
    };
  }
  // Machine names are enrichment, not the point of this page (quotation.manage
  // is) — a role without equipment.manage still gets a working list.
  const [machines, products, renters, requestedResponses] = await Promise.all([
    optional(access.machines, () => apiClient.listMachines(organizationId) as Promise<Machine[]>, null as Machine[] | null),
    optional(access.machines, () => apiClient.listProducts() as Promise<Product[]>, [] as Product[]),
    optional(true, () => apiClient.listRenterOrganizations(organizationId) as Promise<Organization[]>, null as Organization[] | null),
    optional(access.requested, () => apiClient.listRequestedQuotations(organizationId) as Promise<QuotationResponse[]>, null as QuotationResponse[] | null),
  ]);
  let requested: RequestedRow[] | null = null;
  if (requestedResponses) {
    // A request drops off once any quotation (even a draft) carries its response id.
    const fulfilled = new Set(quotations.map((q) => q.quotationResponseId).filter((id): id is string => Boolean(id)));
    const pending = requestedResponses.filter((r) => !fulfilled.has(r.id));
    const [index, requirements] = await Promise.all([
      pending.length ? loadSubcategoryIndex() : Promise.resolve(new Map<string, SubcategoryEntry>()),
      Promise.all(
        pending.map((r) =>
          optional(true, () => apiClient.getRequirementForDiscovery(organizationId, r.requirementId) as Promise<Requirement>, null as Requirement | null),
        ),
      ),
    ]);
    requested = pending.map((response, i) => {
      const requirement = requirements[i] ?? null;
      return {
        response,
        requirement,
        equipment: requirement ? equipmentLine(requirement, index.get(requirement.productSubcategoryId)?.subcategory.name) : null,
      };
    });
  }
  return {
    quotations,
    machines: machines ? new Map(machines.map((m) => [m.id, m])) : null,
    products: new Map(products.map((p) => [p.id, p])),
    renterNames: renters ? new Map(renters.map((o) => [o.id, o.name])) : null,
    companyNames: null,
    requested,
  };
}

export default function QuotationsPage() {
  const { currentMembership, hasPermission } = useSession();
  const organizationId = currentMembership?.organizationId;
  const organizationType = currentMembership?.organization.organizationTypeCode;
  if (!organizationId || !organizationType) return <ListPageSkeleton label="Loading quotations" columns={7} />;
  const canView = organizationType === OrganizationTypeCode.rental_company ? hasPermission("quotation.manage") : hasPermission("quotation.respond");
  if (!canView) {
    return (
      <ForbiddenPage
        what="quotations"
        permissionHint={
          organizationType === OrganizationTypeCode.rental_company
            ? "Creating and sending quotations needs the Quotations permission."
            : "Viewing and answering quotations needs the Quotations permission."
        }
      />
    );
  }
  return <QuotationsList key={organizationId} organizationId={organizationId} viewer={organizationType} />;
}

interface CreateRequest {
  requirementId: string | null;
  sourceAuctionId: string | null;
  machineIds: string[];
}

function QuotationsList({ organizationId, viewer }: { organizationId: string; viewer: Viewer }) {
  const { hasPermission } = useSession();
  const { online } = useConnection();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isCompany = viewer === "rental_company";
  const access: Access = { machines: hasPermission("equipment.manage"), requested: hasPermission("rfq.respond") };
  const list = useListState("quotations", { sort: "created", dir: "desc" });
  const { get, set, search, activeQuery, sortKey, dir, page, setPage, toggleSort, sortDirection } = list;

  const { data, error, loading, reload } = useLoad(() => loadList(organizationId, viewer, access), [organizationId, viewer, access.machines, access.requested]);
  const [createRequest, setCreateRequest] = useState<CreateRequest | null>(null);

  // ?quotationId= (older notification links) → the detail page.
  const quotationIdParam = searchParams.get("quotationId");
  useEffect(() => {
    if (quotationIdParam) router.replace(`/quotations/${quotationIdParam}`);
  }, [quotationIdParam, router]);

  // Deep links that open the create form: ?requirementId= ("Quotation
  // requested" notification, Open Market), ?sourceAuctionId= (auction win),
  // and ?create=1 with ?machineId= (Machine detail → "Quote this machine")
  // or ?machineIds=a,b,c (machines list → bulk "Add to quotation").
  // A notification arrives via router.push — a query-only navigation the
  // App Router doesn't remount this page for — so this is an effect keyed
  // on the params, never a useState initializer (docs/decisions.md). The
  // params are stripped once read, so the same link opens the form again.
  const requirementIdParam = searchParams.get("requirementId");
  const sourceAuctionIdParam = searchParams.get("sourceAuctionId");
  const createParam = searchParams.get("create");
  const machineIdParam = searchParams.get("machineId");
  const machineIdsParam = searchParams.get("machineIds");
  useEffect(() => {
    if (!isCompany) return; // Only a Rental Company creates quotations (quotation.manage).
    if (!requirementIdParam && !sourceAuctionIdParam && createParam !== "1") return;
    const machineIds = [...new Set([machineIdParam, ...(machineIdsParam ?? "").split(",")].map((id) => (id ?? "").trim()).filter(Boolean))];
    setCreateRequest({ requirementId: requirementIdParam, sourceAuctionId: sourceAuctionIdParam, machineIds });
    const next = new URLSearchParams(searchParams.toString());
    for (const key of ["requirementId", "sourceAuctionId", "create", "machineId", "machineIds"]) next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [requirementIdParam, sourceAuctionIdParam, createParam, machineIdParam, machineIdsParam]);

  const today = todayIsoDate();
  const tab = isCompany && get("tab") === "requested" ? "requested" : "quotations";
  const status = get("status");
  const acceptance = get("acceptance");
  const quotations = useMemo(() => data?.quotations ?? [], [data]);

  const acceptanceOptions = isCompany
    ? [
        { value: "accepted", label: "Accepted by customer" },
        { value: "waiting", label: "Waiting for acceptance" },
        { value: "external", label: "Customer not on FleetIP" },
      ]
    : [
        { value: "accepted", label: "Accepted by you" },
        { value: "waiting", label: "Not accepted yet" },
      ];
  // The Renter never sees drafts, so it isn't offered as a filter.
  const statusChoices = statusOptions("quotation").filter((o) => isCompany || o.value !== CommercialQuotationStatus.draft);

  const counterparty = (q: CommercialQuotation) =>
    isCompany
      ? quotationCustomer(q, data?.renterNames ?? null)
      : {
          name: data?.companyNames?.get(q.rentalCompanyOrganizationId) ?? "Rental company",
          note: data?.companyNames ? "" : "Name needs the Quotations permission",
        };
  const machineInfo = (q: CommercialQuotation): { code: string | null; name: string | null } => {
    if (!isCompany) return { code: q.machineAssetCode, name: q.productName };
    const machine = data?.machines?.get(q.machineId);
    return { code: machine?.assetCode ?? null, name: machine ? productName(data?.products.get(machine.productId)) : null };
  };

  const filtered = useMemo(() => {
    const rows = quotations.filter((q) => {
      if (status && q.status !== status) return false;
      if (acceptance === "accepted" && !q.renterAcceptedAt) return false;
      if (acceptance === "waiting" && !(isNegotiable(q.status) && q.renterOrganizationId && !q.renterAcceptedAt)) return false;
      if (acceptance === "external" && q.renterOrganizationId) return false;
      if (activeQuery) {
        const m = machineInfo(q);
        const haystack = [
          q.referenceNumber,
          counterparty(q).name,
          m.code,
          m.name,
          q.requirementId ? requirementRef(q.requirementId) : null,
          q.sourceAuctionId ? auctionRef(q.sourceAuctionId) : null,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(activeQuery)) return false;
      }
      return true;
    });
    const compare =
      sortKey === "start"
        ? (a: CommercialQuotation, b: CommercialQuotation) => a.startDate.localeCompare(b.startDate)
        : sortKey === "validity"
          ? (a: CommercialQuotation, b: CommercialQuotation) => a.validityDate.localeCompare(b.validityDate)
          : sortKey === "rate"
            ? (a: CommercialQuotation, b: CommercialQuotation) => compareNumber(a.rate, b.rate)
            : (a: CommercialQuotation, b: CommercialQuotation) => a.createdAt.localeCompare(b.createdAt);
    return [...rows].sort(directed(compare, dir));
    // counterparty/machineInfo read `data`, which is in the deps
  }, [quotations, status, acceptance, activeQuery, sortKey, dir, data]);

  const pageView = pageSlice(filtered, page);
  const filtersOn = Boolean(status || acceptance || activeQuery);
  const requested = data?.requested ?? null;

  const answerable = quotations.filter((q) => isNegotiable(q.status));
  const readyToAward = answerable.filter((q) => q.renterAcceptedAt).length;
  const waitingOnRenter = answerable.filter((q) => q.renterOrganizationId && !q.renterAcceptedAt).length;
  // For the Renter, a lapse only matters until they accept — then awarding is the rental company's move.
  const lapsing = answerable.filter((q) => {
    const info = quotationValidity(q, today);
    return info !== null && info.days >= 0 && info.days <= 3 && (isCompany || !q.renterAcceptedAt);
  }).length;

  function clearFilters() {
    search.setValue("");
    set({ status: null, acceptance: null, q: null });
  }

  const filterSummary = [
    activeQuery && `“${get("q")}”`,
    status && statusLabel("quotation", status),
    acceptance && acceptanceOptions.find((o) => o.value === acceptance)?.label,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title="Quotations"
        description={
          isCompany
            ? "Formal terms you've drafted or sent. Customers accept, counter or reject; you award once they accept."
            : "Formal terms rental companies have sent you. Accept, counter or reject each one."
        }
        actions={
          isCompany ? (
            <Button
              icon="plus"
              onClick={() => setCreateRequest({ requirementId: null, sourceAuctionId: null, machineIds: [] })}
              disabled={!online}
              title={online ? undefined : OFFLINE_HINT}
            >
              New quotation
            </Button>
          ) : undefined
        }
      />
      <PageBody>
        <AttentionStrip
          items={
            isCompany
              ? [
                  {
                    key: "requested",
                    count: requested?.length ?? 0,
                    text: `${(requested?.length ?? 0) === 1 ? "customer has" : "customers have"} asked you for a quotation`,
                    onClick: () => set({ tab: "requested" }),
                  },
                  {
                    key: "ready",
                    count: readyToAward,
                    text: `accepted by the customer and ready to award`,
                    onClick: () => set({ tab: null, acceptance: "accepted", status: null }),
                  },
                  {
                    key: "lapsing",
                    count: lapsing,
                    text: `${lapsing === 1 ? "quotation lapses" : "quotations lapse"} within 3 days if not awarded`,
                    onClick: () => set({ tab: null, status: null, sort: "validity", dir: "asc" }),
                  },
                ]
              : [
                  {
                    key: "waiting",
                    count: waitingOnRenter,
                    text: `${waitingOnRenter === 1 ? "quotation is" : "quotations are"} waiting for your answer`,
                    onClick: () => set({ acceptance: "waiting", status: null }),
                  },
                  {
                    key: "lapsing",
                    count: lapsing,
                    text: `${lapsing === 1 ? "quotation lapses" : "quotations lapse"} within 3 days unless you accept`,
                    onClick: () => set({ status: null, sort: "validity", dir: "asc" }),
                  },
                ]
          }
        />

        <section aria-label="Quotations" className="min-w-0 overflow-hidden rounded-panel border border-border-strong bg-surface">
          {isCompany && (
            <Tabs
              variant="card"
              label="Quotation views"
              idBase="quotations"
              active={tab}
              onChange={(key) => set({ tab: key === "requested" ? "requested" : null })}
              items={[
                { key: "quotations", label: "Quotations", count: data ? quotations.length : undefined },
                {
                  key: "requested",
                  label: "Requested by customers",
                  count: requested ? requested.length : undefined,
                  disabled: data !== null && requested === null,
                  title: data !== null && requested === null ? "Needs the Open market permission (rfq.respond)." : undefined,
                },
              ]}
            />
          )}
          <MaybeTabPanel enabled={isCompany} tabKey={tab}>
            {tab === "requested" ? (
              <RequestedTable
                rows={requested}
                loading={loading}
                online={online}
                onCreate={(requirementId) => setCreateRequest({ requirementId, sourceAuctionId: null, machineIds: [] })}
              />
            ) : (
              <>
                <TableToolbar>
                  <SearchField search={search} label="Search quotations" placeholder={isCompany ? "Reference, customer, machine or requirement" : "Reference, company or machine"} />
                  <Select
                    size="sm"
                    aria-label="Status"
                    className="w-[160px] max-[760px]:w-full"
                    placeholder="Any status"
                    options={statusChoices}
                    value={status}
                    onChange={(event) => set({ status: event.target.value || null })}
                  />
                  <Select
                    size="sm"
                    aria-label="Acceptance"
                    className="w-[210px] max-[760px]:w-full"
                    placeholder="Any acceptance"
                    options={acceptanceOptions}
                    value={acceptance}
                    onChange={(event) => set({ acceptance: event.target.value || null })}
                  />
                  {filtersOn && (
                    <Button variant="tertiary" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  )}
                </TableToolbar>

                {error ? (
                  <div className="p-4">
                    <ErrorState
                      title="Quotations didn't load"
                      message={describeError(error).body}
                      action={
                        <Button variant="secondary" size="sm" icon="refresh" onClick={() => void reload()}>
                          Try again
                        </Button>
                      }
                    />
                  </div>
                ) : !loading && quotations.length === 0 ? (
                  <EmptyState
                    variant="page"
                    icon="quotation"
                    title="No quotations yet"
                    description={
                      isCompany
                        ? "Quote a machine for a customer directly, or answer a requirement from the Open Market. Each quotation starts as a draft only you can see."
                        : "Quotations arrive when a rental company sends one — usually after you ask an interested company from one of your requirements."
                    }
                    action={
                      isCompany ? (
                        <Button variant="secondary" icon="plus" onClick={() => setCreateRequest({ requirementId: null, sourceAuctionId: null, machineIds: [] })} disabled={!online}>
                          New quotation
                        </Button>
                      ) : (
                        <UILink href="/requirements" className="text-sm font-medium text-accent-text hover:underline">
                          Your requirements
                        </UILink>
                      )
                    }
                  />
                ) : !loading && filtered.length === 0 ? (
                  <EmptyState
                    title="No quotations match these filters"
                    description={filterSummary}
                    action={
                      <Button variant="secondary" size="sm" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    }
                  />
                ) : (
                  <Table bare minWidth={1040} caption="Quotations">
                    <Thead>
                      <Tr>
                        <Th className="w-[150px]" onSort={() => toggleSort("created")} sortDirection={sortDirection("created")}>
                          Quotation
                        </Th>
                        <Th>{isCompany ? "Customer" : "Rental company"}</Th>
                        <Th>Machine</Th>
                        <Th className="w-[190px]" onSort={() => toggleSort("start")} sortDirection={sortDirection("start")}>
                          Dates
                        </Th>
                        <Th align="right" className="w-[130px]" onSort={() => toggleSort("rate")} sortDirection={sortDirection("rate")}>
                          Rate
                        </Th>
                        <Th className="w-[130px]" onSort={() => toggleSort("validity")} sortDirection={sortDirection("validity")}>
                          Valid until
                        </Th>
                        <Th className="w-[180px]">Status</Th>
                      </Tr>
                    </Thead>
                    {loading ? (
                      <TableSkeleton columns={7} rows={8} label="Loading quotations" />
                    ) : (
                      <Tbody>
                        {pageView.rows.map((q) => {
                          const party = counterparty(q);
                          const machine = machineInfo(q);
                          const validity = quotationValidity(q, today);
                          const accepted = acceptanceLabel(q, viewer);
                          const source = q.sourceAuctionId
                            ? `from ${auctionRef(q.sourceAuctionId)}`
                            : q.requirementId
                              ? `for ${requirementRef(q.requirementId)}`
                              : "Direct";
                          return (
                            <Tr key={q.id}>
                              <Td>
                                <div className="flex flex-col gap-0.5">
                                  <UILink
                                    href={`/quotations/${q.id}`}
                                    className="whitespace-nowrap font-mono text-xs font-medium text-accent-text no-underline hover:text-accent-text-hover hover:underline"
                                  >
                                    {q.referenceNumber}
                                  </UILink>
                                  <span className="whitespace-nowrap font-mono text-[11px] text-meta-light">{source}</span>
                                </div>
                              </Td>
                              <Td>
                                <CellStack title={party.name} sub={party.note || undefined} />
                              </Td>
                              <Td>
                                {machine.code || machine.name ? (
                                  <CellStack mono={Boolean(machine.code)} title={machine.code ?? machine.name ?? ""} sub={machine.code ? (machine.name ?? undefined) : undefined} />
                                ) : (
                                  <span className="text-xs text-meta-light" title="Machine names need the Equipment permission">
                                    Not shown for your role
                                  </span>
                                )}
                              </Td>
                              <Td className="whitespace-nowrap font-mono text-xs">{formatCompactRange(q.startDate, q.endDate)}</Td>
                              <Td align="right">
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="font-mono text-xs font-semibold text-ink">{formatMoney(q.rate)}</span>
                                  <span className="text-[11px] text-meta-light">{formatRateUnit(q.rateUnit)}</span>
                                </div>
                              </Td>
                              <Td>
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-mono text-xs text-ink-strong">{formatDate(q.validityDate)}</span>
                                  {validity && <span className={cx("text-[11px] leading-tight", validity.className)}>{validity.label}</span>}
                                </div>
                              </Td>
                              <Td>
                                <div className="flex flex-col items-start gap-1">
                                  <Status domain="quotation" value={q.status} size="sm" />
                                  {accepted && (
                                    <Badge variant="label" tone={accepted.tone} title={accepted.title}>
                                      {accepted.text}
                                    </Badge>
                                  )}
                                </div>
                              </Td>
                            </Tr>
                          );
                        })}
                      </Tbody>
                    )}
                  </Table>
                )}

                {!error && !loading && filtered.length > 0 && (
                  <TableFooter>
                    <span className="text-xs text-meta">
                      {plural(answerable.length, "quotation")} open for an answer
                      {isCompany ? " · drafts are visible only to you" : ""}
                    </span>
                    <Pagination page={pageView.page} pageCount={pageView.pageCount} onPageChange={setPage} total={pageView.total} pageSize={PAGE_SIZE} noun="quotations" />
                  </TableFooter>
                )}
              </>
            )}
          </MaybeTabPanel>
        </section>
      </PageBody>

      {isCompany && (
        <CreateQuotationDialog
          open={createRequest !== null}
          onClose={() => setCreateRequest(null)}
          organizationId={organizationId}
          requirementId={createRequest?.requirementId ?? null}
          sourceAuctionId={createRequest?.sourceAuctionId ?? null}
          initialMachineIds={createRequest?.machineIds ?? []}
          onRequirementChange={(id) => setCreateRequest((request) => (request ? { ...request, requirementId: id } : request))}
          onCreated={() => void reload()}
        />
      )}
    </div>
  );
}

/** Tab panel semantics only when there are tabs (the Rental Company); the Renter's list has none. */
function MaybeTabPanel({ enabled, tabKey, children }: { enabled: boolean; tabKey: string; children: ReactNode }) {
  if (!enabled) return <>{children}</>;
  return (
    <TabPanel idBase="quotations" tabKey={tabKey}>
      {children}
    </TabPanel>
  );
}

function RequestedTable({
  rows,
  loading,
  online,
  onCreate,
}: {
  rows: RequestedRow[] | null;
  loading: boolean;
  online: boolean;
  onCreate: (requirementId: string) => void;
}) {
  if (!loading && rows === null) {
    return <EmptyState title="Requests aren't visible to your role" description="Seeing which customers asked for a quotation needs the Open market permission." />;
  }
  if (!loading && rows && rows.length === 0) {
    return (
      <EmptyState
        title="Nothing waiting on you"
        description="When a customer asks you to formalize your reply to one of their requirements, it shows up here until a quotation — even a draft — exists for it."
      />
    );
  }
  return (
    <Table bare minWidth={900} caption="Requirements where the customer asked you for a quotation">
      <Thead>
        <Tr>
          <Th className="w-[130px]">Requirement</Th>
          <Th>Equipment and project</Th>
          <Th align="right" className="w-[160px]">
            Your indicative rate
          </Th>
          <Th className="w-[120px]">Asked on</Th>
          <Th className="w-[170px]">
            <span className="sr-only">Actions</span>
          </Th>
        </Tr>
      </Thead>
      {loading || !rows ? (
        <TableSkeleton columns={5} rows={8} label="Loading requests" />
      ) : (
        <Tbody>
          {rows.map(({ response, requirement, equipment }) => {
            const quotable = requirement?.status === RequirementStatus.open;
            return (
              <Tr key={response.id}>
                <Td className="whitespace-nowrap">
                  <UILink
                    href={`/requirements/${response.requirementId}`}
                    className="font-mono text-xs font-medium text-accent-text no-underline hover:text-accent-text-hover hover:underline"
                  >
                    {requirementRef(response.requirementId)}
                  </UILink>
                </Td>
                <Td>
                  <CellStack
                    title={equipment ?? "Requirement details didn't load"}
                    sub={requirement ? [requirement.projectName, `Qty ${requirement.quantity}`].filter(Boolean).join(" · ") : undefined}
                  />
                </Td>
                <Td align="right" className="font-mono text-xs">
                  {response.indicativeRate != null && response.indicativeRateUnit ? formatRate(response.indicativeRate, response.indicativeRateUnit) : "—"}
                </Td>
                <Td className="font-mono text-xs">{formatDate(response.quotationRequestedAt)}</Td>
                <Td>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onCreate(response.requirementId)}
                      disabled={!online || !quotable}
                      title={
                        !online
                          ? "You're offline."
                          : !quotable
                            ? `The requirement is ${requirement ? statusLabel("requirement", requirement.status) : "no longer readable"}, so it can't be quoted.`
                            : "Opens the form with the requirement's customer, dates and rate unit."
                      }
                    >
                      Create quotation
                    </Button>
                  </div>
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      )}
    </Table>
  );
}
