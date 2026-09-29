"use client";

import type { Project } from "@fleetip/contracts/project";
import { QuotationResponseStatus, type CommercialQuotation, type QuotationResponse } from "@fleetip/contracts/quotation";
import { RequirementStatus, type Requirement } from "@fleetip/contracts/rfq";
import {
  AttentionStrip,
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
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  UILink,
  cx,
} from "@fleetip/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { useConnection } from "../../../lib/connection";
import { describeError, OFFLINE_HINT } from "../../../lib/errors";
import { formatDate, plural, todayIsoDate } from "../../../lib/format";
import { useSession } from "../../../lib/session-context";
import { Status, statusLabel, statusOptions } from "../../../lib/status";
import { optional, useLoad } from "../../../lib/use-load";
import { PostRequirementDialog } from "./PostRequirementDialog";
import { SearchField, compareNumber, directed, pageSlice, PAGE_SIZE, useListState } from "./list-kit";
import {
  durationLabel,
  equipmentLine,
  loadSubcategoryIndex,
  quantityLine,
  requirementRef,
  subcategoryName,
  validityInfo,
} from "./shared";

interface Row {
  requirement: Requirement;
  equipment: string;
  /** null when this requirement's responses didn't load. */
  responses: QuotationResponse[] | null;
  interested: number;
  /** Interested companies not yet asked for a formal quotation (and not already quoted). */
  notAsked: QuotationResponse[];
  validity: ReturnType<typeof validityInfo>;
}

interface ListData {
  rows: Row[];
  projects: Project[] | null;
}

const ATTENTION_OPTIONS = [
  { value: "followup", label: "Interested, not asked to quote" },
  { value: "closing", label: "Closing within 3 days" },
  { value: "passed", label: "Open past validity date" },
];

async function loadList(organizationId: string, access: { projects: boolean; quotations: boolean }): Promise<ListData> {
  const today = todayIsoDate();
  const [requirements, index, projects, quotations] = await Promise.all([
    apiClient.listRequirements(organizationId) as Promise<Requirement[]>,
    loadSubcategoryIndex(),
    optional(access.projects, () => apiClient.listProjects(organizationId) as Promise<Project[]>, null as Project[] | null),
    // Quotations already formalized from a response (quotation.respond) — so
    // "not asked" doesn't count a company that has quoted anyway.
    optional(access.quotations, () => apiClient.listQuotations(organizationId) as Promise<CommercialQuotation[]>, [] as CommercialQuotation[]),
  ]);
  // One call per requirement (no batched endpoint); a failure leaves that
  // row's count unknown instead of failing the list.
  const responseLists = await Promise.all(
    requirements.map((r) =>
      optional(true, () => apiClient.listResponsesForRequirement(organizationId, r.id) as Promise<QuotationResponse[]>, null as QuotationResponse[] | null),
    ),
  );
  const quotedResponseIds = new Set(quotations.map((q) => q.quotationResponseId).filter((id): id is string => Boolean(id)));
  const rows = requirements.map((requirement, i) => {
    const responses = responseLists[i] ?? null;
    const interested = (responses ?? []).filter((r) => r.status === QuotationResponseStatus.interested);
    return {
      requirement,
      equipment: equipmentLine(requirement, subcategoryName(index, requirement.productSubcategoryId)),
      responses,
      interested: interested.length,
      notAsked: requirement.status === RequirementStatus.open ? interested.filter((r) => !r.quotationRequestedAt && !quotedResponseIds.has(r.id)) : [],
      validity: validityInfo(requirement.validityDate, today),
    };
  });
  return { rows, projects };
}

export function RenterRequirementsList({ organizationId }: { organizationId: string }) {
  const { hasPermission } = useSession();
  const { online } = useConnection();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const access = { projects: hasPermission("project.manage"), quotations: hasPermission("quotation.respond") };
  const list = useListState("requirements", { sort: "created", dir: "desc" });
  const { get, set, search, activeQuery, sortKey, dir, page, setPage, toggleSort, sortDirection } = list;

  const { data, error, loading, reload } = useLoad(() => loadList(organizationId, access), [organizationId, access.projects, access.quotations]);
  const [postOpen, setPostOpen] = useState(false);

  const status = get("status");
  const projectId = get("projectId");
  const attention = get("attention");

  // ?post=1 (Projects → "Post a requirement", or the toast after creating a
  // project) opens the form with ?projectId= preselected. Keyed on the param
  // and stripped afterwards, so the same link works again.
  const postParam = searchParams.get("post");
  useEffect(() => {
    if (postParam !== "1") return;
    setPostOpen(true);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("post");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [postParam]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const projectOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const project of data?.projects ?? []) byId.set(project.id, `${project.projectName} · ${project.projectCode}`);
    for (const row of rows) if (!byId.has(row.requirement.projectId)) byId.set(row.requirement.projectId, row.requirement.projectName ?? "Unnamed project");
    if (projectId && !byId.has(projectId)) byId.set(projectId, "Selected project");
    return [...byId.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [data, rows, projectId]);

  const filtered = useMemo(() => {
    const out = rows.filter(({ requirement: r, equipment, notAsked, validity }) => {
      if (status && r.status !== status) return false;
      if (projectId && r.projectId !== projectId) return false;
      if (attention === "followup" && notAsked.length === 0) return false;
      if (attention === "closing" && !(r.status === RequirementStatus.open && validity.days >= 0 && validity.days <= 3)) return false;
      if (attention === "passed" && !(r.status === RequirementStatus.open && validity.days < 0)) return false;
      if (activeQuery) {
        const haystack = [requirementRef(r.id), equipment, r.projectName, r.projectLocation].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(activeQuery)) return false;
      }
      return true;
    });
    const compare =
      sortKey === "start"
        ? (a: Row, b: Row) => a.requirement.requestedStartDate.localeCompare(b.requirement.requestedStartDate)
        : sortKey === "validity"
          ? (a: Row, b: Row) => a.requirement.validityDate.localeCompare(b.requirement.validityDate)
          : sortKey === "responses"
            ? (a: Row, b: Row) => compareNumber(a.responses?.length, b.responses?.length)
            : (a: Row, b: Row) => a.requirement.createdAt.localeCompare(b.requirement.createdAt);
    return [...out].sort(directed(compare, dir));
  }, [rows, status, projectId, attention, activeQuery, sortKey, dir]);

  const pageView = pageSlice(filtered, page);
  const filtersOn = Boolean(status || projectId || attention || activeQuery);
  const openRows = rows.filter((r) => r.requirement.status === RequirementStatus.open);
  const followUp = openRows.filter((r) => r.notAsked.length > 0).length;
  const closing = openRows.filter((r) => r.validity.days >= 0 && r.validity.days <= 3).length;
  const passed = openRows.filter((r) => r.validity.days < 0).length;

  function clearFilters() {
    search.setValue("");
    set({ status: null, projectId: null, attention: null, q: null });
  }

  const filterSummary = [
    activeQuery && `“${get("q")}”`,
    status && statusLabel("requirement", status),
    projectId && (projectOptions.find((o) => o.value === projectId)?.label ?? "this project"),
    attention && ATTENTION_OPTIONS.find((o) => o.value === attention)?.label,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title="Requirements"
        description="Post the equipment you need, then compare the replies from rental companies."
        actions={
          <Button
            icon="plus"
            onClick={() => setPostOpen(true)}
            disabled={!online}
            title={online ? undefined : OFFLINE_HINT}
          >
            Post requirement
          </Button>
        }
      />
      <PageBody>
        <AttentionStrip
          items={[
            {
              key: "followup",
              count: followUp,
              text: `open ${followUp === 1 ? "requirement has" : "requirements have"} interested companies you haven't asked for a quotation`,
              onClick: () => set({ attention: "followup", status: null }),
            },
            {
              key: "closing",
              count: closing,
              text: `open ${closing === 1 ? "requirement stops" : "requirements stop"} taking responses within 3 days`,
              onClick: () => set({ attention: "closing", status: null }),
            },
            {
              key: "passed",
              count: passed,
              text: `open ${passed === 1 ? "requirement is" : "requirements are"} past the validity date, so rental companies can't find ${passed === 1 ? "it" : "them"}`,
              onClick: () => set({ attention: "passed", status: null }),
            },
          ]}
        />

        <section aria-label="Your requirements" className="min-w-0 overflow-hidden rounded-panel border border-border-strong bg-surface">
          <TableToolbar>
            <SearchField search={search} label="Search requirements" placeholder="Reference, equipment or project" />
            <Select
              size="sm"
              aria-label="Status"
              className="w-[150px] max-[760px]:w-full"
              placeholder="Any status"
              options={statusOptions("requirement")}
              value={status}
              onChange={(event) => set({ status: event.target.value || null })}
            />
            <Select
              size="sm"
              aria-label="Project"
              className="w-[220px] max-[760px]:w-full"
              placeholder="Any project"
              options={projectOptions}
              value={projectId}
              onChange={(event) => set({ projectId: event.target.value || null })}
            />
            <Select
              size="sm"
              aria-label="Needs attention"
              className="w-[220px] max-[760px]:w-full"
              placeholder="Attention: any"
              options={ATTENTION_OPTIONS}
              value={attention}
              onChange={(event) => set({ attention: event.target.value || null })}
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
                title="Your requirements didn't load"
                message={describeError(error).body}
                action={
                  <Button variant="secondary" size="sm" icon="refresh" onClick={() => void reload()}>
                    Try again
                  </Button>
                }
              />
            </div>
          ) : !loading && rows.length === 0 ? (
            <EmptyState
              variant="page"
              icon="requirement"
              title="No requirements yet"
              description="Post what you need — equipment type, dates and site. Rental companies reply with an indicative rate, and you ask the ones you like for a formal quotation."
              action={
                <Button variant="secondary" icon="plus" onClick={() => setPostOpen(true)} disabled={!online}>
                  Post requirement
                </Button>
              }
            />
          ) : !loading && filtered.length === 0 ? (
            <EmptyState
              title="No requirements match these filters"
              description={filterSummary}
              action={
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <Table bare minWidth={980} caption="Your requirements">
              <Thead>
                <Tr>
                  <Th className="w-[130px]" onSort={() => toggleSort("created")} sortDirection={sortDirection("created")}>
                    Requirement
                  </Th>
                  <Th>Equipment</Th>
                  <Th>Project</Th>
                  <Th className="w-[140px]" onSort={() => toggleSort("start")} sortDirection={sortDirection("start")}>
                    Needed from
                  </Th>
                  <Th className="w-[150px]" onSort={() => toggleSort("validity")} sortDirection={sortDirection("validity")}>
                    Responses until
                  </Th>
                  <Th align="right" className="w-[150px]" onSort={() => toggleSort("responses")} sortDirection={sortDirection("responses")}>
                    Responses
                  </Th>
                  <Th className="w-[110px]">Status</Th>
                </Tr>
              </Thead>
              {loading ? (
                <TableSkeleton columns={7} rows={8} label="Loading requirements" />
              ) : (
                <Tbody>
                  {pageView.rows.map((row) => {
                    const r = row.requirement;
                    const open = r.status === RequirementStatus.open;
                    return (
                      <Tr key={r.id}>
                        <Td className="whitespace-nowrap">
                          <UILink
                            href={`/requirements/${r.id}`}
                            className="font-mono text-xs font-medium text-accent-text no-underline hover:text-accent-text-hover hover:underline"
                          >
                            {requirementRef(r.id)}
                          </UILink>
                        </Td>
                        <Td>
                          <CellStack title={row.equipment} sub={quantityLine(r)} />
                        </Td>
                        <Td>
                          <CellStack title={r.projectName ?? "Project name not recorded"} sub={r.projectLocation ?? "Site not recorded"} />
                        </Td>
                        <Td>
                          <CellStack
                            mono
                            title={formatDate(r.requestedStartDate)}
                            sub={durationLabel(r.expectedDurationValue, r.expectedDurationUnit) ?? "Duration not given"}
                          />
                        </Td>
                        <Td>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-xs font-medium text-ink-strong">{formatDate(r.validityDate)}</span>
                            <span className={cx("text-[11px] leading-tight", open ? row.validity.className : "text-meta-light")}>
                              {open ? row.validity.label : "Not taking responses"}
                            </span>
                          </div>
                        </Td>
                        <Td align="right">
                          {row.responses === null ? (
                            <span className="text-xs text-meta-light" title="This requirement's responses didn't load. Reload the page to try again.">
                              Didn't load
                            </span>
                          ) : (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-mono text-xs font-semibold text-ink">{row.responses.length}</span>
                              <span className={cx("text-[11px] leading-tight", row.notAsked.length ? "text-attention" : "text-meta-light")}>
                                {row.notAsked.length
                                  ? `${row.notAsked.length} interested, not asked`
                                  : `${row.interested} interested`}
                              </span>
                            </div>
                          )}
                        </Td>
                        <Td>
                          <Status domain="requirement" value={r.status} size="sm" />
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
              <span className="text-xs text-meta">{plural(openRows.length, "open requirement")}</span>
              <Pagination page={pageView.page} pageCount={pageView.pageCount} onPageChange={setPage} total={pageView.total} pageSize={PAGE_SIZE} noun="requirements" />
            </TableFooter>
          )}
        </section>
      </PageBody>

      <PostRequirementDialog
        open={postOpen}
        onClose={() => setPostOpen(false)}
        organizationId={organizationId}
        initialProjectId={projectId || null}
        onPosted={() => void reload()}
      />
    </div>
  );
}

