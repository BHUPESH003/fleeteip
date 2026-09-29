"use client";

import { QuotationResponseStatus, type QuotationResponse } from "@fleetip/contracts/quotation";
import { RequirementStatus, type Requirement } from "@fleetip/contracts/rfq";
import {
  AttentionList,
  Badge,
  Button,
  CellStack,
  DescriptionList,
  EmptyState,
  Icon,
  IdentityTile,
  KeyFigures,
  Menu,
  PageBody,
  PageHeader,
  Panel,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  UILink,
  cx,
  type AttentionListItem,
  type KeyFigure,
  type MenuItem,
} from "@fleetip/ui";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { apiClient } from "../../../../lib/api-client";
import { categoryIcon } from "../../../../lib/category-icon";
import { useConnection } from "../../../../lib/connection";
import { OFFLINE_HINT } from "../../../../lib/errors";
import { useAction } from "../../../../lib/form";
import { formatDate, formatDateTime, formatMoney, formatRate, formatRateUnit, plural } from "../../../../lib/format";
import { useListBackHref } from "../../../../lib/list-state";
import { useSession } from "../../../../lib/session-context";
import { Status, statusLabel } from "../../../../lib/status";
import { DIRECTION, auctionRef, isRunning } from "../../auctions/shared";
import { acceptanceLabel, isNegotiable, quotationValidity } from "../../quotations/shared";
import { EditRequirementDialog } from "../EditRequirementDialog";
import { useSticky } from "../list-kit";
import { equipmentLine, quantityLine, requirementRef, validityInfo } from "../shared";
import type { RenterDetail } from "./data";
import { RequirementStatusDialog } from "./dialogs";
import { ActivityCard, RequirementFacts } from "./parts";

const LINK_PRIMARY =
  "inline-flex h-[34px] items-center gap-[7px] rounded-control bg-accent px-[14px] text-sm font-semibold text-white no-underline hover:bg-accent-press";
const REF_LINK = "font-mono text-xs font-medium text-accent-text no-underline hover:text-accent-text-hover hover:underline";

export function RenterRequirementView({
  data,
  organizationId,
  reload,
  onRequirementChanged,
}: {
  data: RenterDetail;
  organizationId: string;
  reload: () => Promise<void>;
  onRequirementChanged: (requirement: Requirement) => void;
}) {
  const router = useRouter();
  const { online } = useConnection();
  const { hasPermission } = useSession();
  const backHref = useListBackHref("requirements", "/requirements");
  const canAuction = hasPermission("auction.manage");
  const { requirement, entry, responses, quotations, auctions, companyNames } = data;

  const [editOpen, setEditOpen] = useState(false);
  const [statusTo, setStatusTo] = useState<Exclude<RequirementStatus, typeof RequirementStatus.open> | null>(null);
  const statusTarget = useSticky(statusTo);
  // Companies this session has just asked for a quotation — the row shows
  // "Requested" at once, before the reload brings quotationRequestedAt back.
  const [requestedFrom, setRequestedFrom] = useState<Set<string>>(new Set());
  const [requesting, setRequesting] = useState<string | null>(null);
  const askAction = useAction();
  const responsesRef = useRef<HTMLDivElement>(null);
  const quotationsRef = useRef<HTMLDivElement>(null);

  const ref = requirementRef(requirement.id);
  const equipment = equipmentLine(requirement, entry?.subcategory.name);
  const open = requirement.status === RequirementStatus.open;
  const validity = validityInfo(requirement.validityDate, data.today);
  const offline = !online;

  const companyName = (id: string) =>
    companyNames?.get(id) ?? (companyNames ? "Rental company" : "Rental company (name needs the Quotations permission)");
  const interested = responses.filter((r) => r.status === QuotationResponseStatus.interested);
  const quotationByResponseId = new Map(
    (quotations ?? []).filter((q) => q.quotationResponseId).map((q) => [q.quotationResponseId as string, q]),
  );
  const wasRequested = (r: QuotationResponse) => Boolean(r.quotationRequestedAt) || requestedFrom.has(r.rentalCompanyOrganizationId);
  const notAsked = open ? interested.filter((r) => !wasRequested(r) && !quotationByResponseId.has(r.id)) : [];

  // "Lowest"/"spread" only mean something when every response is quoted in
  // the same unit — comparing 6000/day against 150000/month as raw numbers
  // is meaningless. Submitting a response locks indicativeRateUnit to the
  // requirement's own expectedDurationUnit when it has one, so a mismatch
  // shouldn't come up in practice — but a requirement with no
  // expectedDurationUnit still leaves the unit to each responder's choice.
  const rateUnits = new Set(interested.map((r) => r.indicativeRateUnit).filter(Boolean));
  const mixedUnits = rateUnits.size > 1;
  const commonUnit = rateUnits.size === 1 ? ([...rateUnits][0] ?? null) : null;
  const rates = mixedUnits ? [] : interested.map((r) => r.indicativeRate).filter((r): r is number => r != null);
  const lowest = rates.length ? Math.min(...rates) : null;
  const spread = rates.length > 1 && lowest ? Math.round(((Math.max(...rates) - lowest) / lowest) * 100) : null;

  const waitingQuotations = (quotations ?? []).filter((q) => isNegotiable(q.status) && !q.renterAcceptedAt);
  const openQuotations = quotations ? quotations.filter((q) => isNegotiable(q.status)).length : null;
  const runningAuction = (auctions ?? []).find((a) => isRunning(a.auction.status)) ?? null;
  const needsSelection = (auctions ?? []).filter((a) => a.summary?.needsAttention);

  function requestQuotation(response: QuotationResponse) {
    const name = companyName(response.rentalCompanyOrganizationId);
    // One action for the table: rows run one at a time; `requesting` says which row is busy.
    setRequesting(response.rentalCompanyOrganizationId);
    void askAction
      .run(() => apiClient.requestQuotation(organizationId, requirement.id, response.rentalCompanyOrganizationId), {
        failTitle: `Couldn't ask ${name} for a quotation`,
        report: "toast",
        success: () => ({
          title: `Quotation requested from ${name}`,
          body: `They've been notified to send a formal quotation for ${ref}. It will appear under Quotations received.`,
        }),
        onDone: () => {
          setRequestedFrom((previous) => new Set(previous).add(response.rentalCompanyOrganizationId));
          void reload();
        },
      })
      .finally(() => setRequesting(null));
  }

  function scrollTo(target: { current: HTMLDivElement | null }) {
    target.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ------------------------------------------------------------------ header actions
  let primary: ReactNode = null;
  if (open && canAuction) {
    primary = runningAuction ? (
      <UILink href={`/auctions?requirementId=${requirement.id}&auctionId=${runningAuction.auction.id}`} className={LINK_PRIMARY}>
        <Icon name="auction" size={15} />
        Open auction
      </UILink>
    ) : (
      <Button icon="auction" onClick={() => router.push(`/auctions?requirementId=${requirement.id}&create=1`)} disabled={offline} title={offline ? OFFLINE_HINT : undefined}>
        Start auction
      </Button>
    );
  } else if (open) {
    primary = (
      <Button icon="edit" onClick={() => setEditOpen(true)} disabled={offline} title={offline ? OFFLINE_HINT : undefined}>
        Edit requirement
      </Button>
    );
  }

  const closedHint = `This requirement is ${statusLabel("requirement", requirement.status)}. Only open requirements change.`;
  const menuItems: MenuItem[] = [];
  if (!(open && !canAuction)) {
    menuItems.push({
      key: "edit",
      label: "Edit requirement",
      icon: "edit",
      disabled: !open || offline,
      hint: offline ? OFFLINE_HINT : open ? "Quantity, dates and notes. Equipment type and project are fixed." : closedHint,
      onSelect: () => setEditOpen(true),
    });
  }
  menuItems.push(
    {
      key: "close",
      label: "Close requirement",
      icon: "check",
      separatorBefore: true,
      disabled: !open || offline,
      hint: offline ? OFFLINE_HINT : open ? "You have what you need. It leaves the Open Market." : closedHint,
      onSelect: () => setStatusTo(RequirementStatus.closed),
    },
    {
      key: "cancel",
      label: "Cancel requirement",
      icon: "close",
      danger: true,
      disabled: !open || offline,
      hint: offline ? OFFLINE_HINT : open ? "The work isn't going ahead. It leaves the Open Market." : closedHint,
      onSelect: () => setStatusTo(RequirementStatus.cancelled),
    },
  );

  // ------------------------------------------------------------------ attention (derived from loaded data only)
  const attention: AttentionListItem[] = [];
  if (notAsked.length > 0) {
    attention.push({
      key: "not-asked",
      severity: "info",
      title: `${plural(notAsked.length, "interested company", "interested companies")} ${notAsked.length === 1 ? "hasn't" : "haven't"} been asked for a quotation`,
      context: `${notAsked.map((r) => companyName(r.rentalCompanyOrganizationId)).join(", ")}. Asking notifies them to send formal terms you can accept.`,
      action: { label: "Review responses", onClick: () => scrollTo(responsesRef) },
    });
  }
  if (open && validity.days >= 0 && validity.days <= 3) {
    attention.push({
      key: "closing",
      severity: "warning",
      title: validity.days === 0 ? "Last day for responses is today" : `Stops taking responses in ${plural(validity.days, "day")}`,
      context: `Validity ends ${formatDate(requirement.validityDate)} · ${plural(responses.length, "response")} so far. Move the date if you want more replies.`,
      action: { label: "Edit requirement", onClick: () => setEditOpen(true), disabled: offline },
    });
  }
  if (open && validity.days < 0) {
    attention.push({
      key: "passed",
      severity: "warning",
      title: "Past its validity date — rental companies can't find it any more",
      context: `The Open Market only lists requirements until their validity date (${formatDate(requirement.validityDate)}). Move the date to reopen replies, or close it if you're done.`,
      action: { label: "Edit requirement", onClick: () => setEditOpen(true), disabled: offline },
    });
  }
  if (waitingQuotations.length > 0) {
    attention.push({
      key: "waiting",
      severity: "warning",
      title: `${plural(waitingQuotations.length, "quotation")} ${waitingQuotations.length === 1 ? "is" : "are"} waiting for your answer`,
      context: waitingQuotations.map((q) => q.referenceNumber).join(", "),
      action: { label: "Review quotations", onClick: () => scrollTo(quotationsRef) },
    });
  }
  for (const row of needsSelection) {
    attention.push({
      key: `select-${row.auction.id}`,
      severity: "warning",
      title: `Auction ${auctionRef(row.auction.id)} closed — no participant selected`,
      context: "Closing an auction doesn't award anything. Pick the company to proceed with; they can then send a quotation.",
      action: { label: "Select participant", href: `/auctions?requirementId=${requirement.id}&auctionId=${row.auction.id}` },
    });
  }

  // ------------------------------------------------------------------ figures
  const figures: KeyFigure[] = [
    {
      key: "responses",
      label: "Responses",
      value: responses.length,
      context: responses.length ? `${interested.length} interested · ${responses.length - interested.length} not interested` : "No replies yet",
    },
    {
      key: "lowest",
      label: "Lowest indicative rate",
      value: lowest !== null ? formatMoney(lowest) : mixedUnits ? "Mixed units" : "—",
      unit: lowest !== null && commonUnit ? formatRateUnit(commonUnit) : undefined,
      context: lowest !== null ? `from ${plural(rates.length, "interested company", "interested companies")}` : mixedUnits ? "Replies use different units, so they can't be compared" : "No rates yet",
      tone: mixedUnits ? "warning" : undefined,
    },
    {
      key: "spread",
      label: "Rate spread",
      value: spread !== null ? spread : "—",
      unit: spread !== null ? "%" : undefined,
      context: spread !== null ? "highest interested rate above the lowest" : "Needs two comparable rates",
    },
    {
      key: "quotations",
      label: "Quotations received",
      value: quotations ? quotations.length : "—",
      context: quotations
        ? quotations.length
          ? `${waitingQuotations.length} waiting for your answer`
          : "None yet — ask an interested company"
        : "Needs the Quotations permission",
    },
    {
      key: "validity",
      label: "Responses until",
      value: formatDate(requirement.validityDate),
      context: open ? validity.label : "Not taking responses",
      tone: open ? validity.tone : "muted",
    },
  ];

  function responseAction(response: QuotationResponse): ReactNode {
    if (response.status !== QuotationResponseStatus.interested) return <span className="text-xs text-disabled-text">—</span>;
    const linked = quotationByResponseId.get(response.id);
    if (linked)
      return (
        <UILink href={`/quotations/${linked.id}`} className={REF_LINK}>
          Open {linked.referenceNumber}
        </UILink>
      );
    if (wasRequested(response)) {
      return (
        <Button
          size="sm"
          variant="secondary"
          icon="check"
          disabled
          title={
            response.quotationRequestedAt
              ? `Asked on ${formatDate(response.quotationRequestedAt)}. Their quotation will appear under Quotations received.`
              : "Asked just now. Their quotation will appear under Quotations received."
          }
        >
          Requested
        </Button>
      );
    }
    if (!open) {
      return (
        <Button size="sm" variant="secondary" disabled title="Rental companies can't quote against a requirement that isn't open.">
          Request quotation
        </Button>
      );
    }
    return (
      <Button
        size="sm"
        variant="secondary"
        onClick={() => requestQuotation(response)}
        busy={requesting === response.rentalCompanyOrganizationId}
        busyLabel="Requesting…"
        disabled={offline || (requesting !== null && requesting !== response.rentalCompanyOrganizationId)}
        title={offline ? OFFLINE_HINT : "Notifies them to send a formal quotation"}
      >
        Request quotation
      </Button>
    );
  }

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        breadcrumbs={[
          { label: "Requirements", href: backHref },
          { label: ref, mono: true },
        ]}
        note="Filters on the requirements list are kept when you go back"
        leading={
          <IdentityTile title={`Category: ${entry?.category?.name ?? "Not specified"}`}>
            <Icon name={categoryIcon(entry?.category)} size={28} strokeWidth={1.3} label={entry?.category?.name ?? "Equipment"} />
          </IdentityTile>
        }
        title={ref}
        titleMono
        meta={
          <>
            <Status domain="requirement" value={requirement.status} />
            {open && (
              <span className={cx("text-xs font-medium", validity.className)} title="Worked out from the validity date">
                {validity.days < 0 ? "Validity passed" : validity.label}
              </span>
            )}
          </>
        }
        description={
          <span className="text-base font-medium leading-[1.3] text-ink-strong">
            {equipment}
            <span className="font-normal text-meta"> · {quantityLine(requirement)}</span>
          </span>
        }
        actions={
          <>
            {primary}
            <Menu label={`More actions for ${ref}`} items={menuItems} width={320} />
          </>
        }
      >
        <DescriptionList
          layout="inline"
          items={[
            { label: "Project", value: requirement.projectName },
            { label: "Site", value: requirement.projectLocation },
            { label: "Needed from", value: formatDate(requirement.requestedStartDate), mono: true },
            { label: "Posted", value: formatDate(requirement.createdAt), mono: true },
          ]}
        />
      </PageHeader>

      <PageBody>
        <AttentionList items={attention} note="Worked out when this page opened. FleetIP doesn't send reminders for these." />
        <KeyFigures items={figures} />

        <div className="flex flex-wrap items-start gap-3.5">
          <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-3.5">
            <div ref={responsesRef} className="scroll-mt-4">
              <Panel title="Responses" count={responses.length} subtitle="each company sees only its own reply" padding="none">
                {responses.length === 0 ? (
                  <EmptyState
                    title="No responses yet"
                    description={
                      open && validity.days >= 0
                        ? `Rental companies can reply until ${formatDate(requirement.validityDate)}. Each reply shows up here with its indicative rate.`
                        : "No rental company replied while it was open."
                    }
                  />
                ) : (
                  <Table bare minWidth={720} caption={`Responses to ${ref}`}>
                    <Thead>
                      <Tr>
                        <Th>Rental company</Th>
                        <Th className="w-[130px]">Reply</Th>
                        <Th align="right" className="w-[160px]">
                          Indicative rate
                        </Th>
                        <Th>Notes</Th>
                        <Th className="w-[170px]">
                          <span className="sr-only">Actions</span>
                        </Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {responses.map((response) => {
                        const isLowest =
                          response.status === QuotationResponseStatus.interested && lowest !== null && response.indicativeRate === lowest && rates.length > 1;
                        return (
                          <Tr key={response.id}>
                            <Td>
                              <CellStack title={companyName(response.rentalCompanyOrganizationId)} sub={`Replied ${formatDate(response.updatedAt)}`} />
                            </Td>
                            <Td>
                              <Status domain="quotation_response" value={response.status} size="sm" />
                            </Td>
                            <Td align="right">
                              {response.indicativeRate != null && response.indicativeRateUnit ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="font-mono text-xs font-semibold text-ink">{formatMoney(response.indicativeRate)}</span>
                                  <span className="flex items-center gap-1.5 text-[11px] text-meta-light">
                                    {isLowest && (
                                      <Badge variant="label" tone="success" title="Worked out from the replies — not stored">
                                        Lowest
                                      </Badge>
                                    )}
                                    {formatRateUnit(response.indicativeRateUnit)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-disabled-text">—</span>
                              )}
                            </Td>
                            <Td className="text-ink-muted">
                              <span className="clamp-2 text-xs" title={response.notes ?? undefined}>
                                {response.notes ?? <span className="italic text-disabled-text">No notes</span>}
                              </span>
                            </Td>
                            <Td>
                              <div className="flex justify-end">{responseAction(response)}</div>
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                )}
              </Panel>
            </div>

            <div ref={quotationsRef} className="scroll-mt-4">
              <Panel title="Quotations received" count={quotations?.length} subtitle="formal terms you can accept, counter or reject" padding="none">
                {quotations === null ? (
                  <EmptyState title="Quotations aren't visible to your role" description="Viewing quotations needs the Quotations permission." />
                ) : quotations.length === 0 ? (
                  <EmptyState
                    title="No quotations yet"
                    description="Ask an interested company for a quotation from the responses above. Drafts stay hidden until the company sends them."
                  />
                ) : (
                  <Table bare minWidth={760} caption={`Quotations received for ${ref}`}>
                    <Thead>
                      <Tr>
                        <Th className="w-[130px]">Quotation</Th>
                        <Th>Rental company</Th>
                        <Th>Machine</Th>
                        <Th align="right" className="w-[140px]">
                          Rate
                        </Th>
                        <Th className="w-[130px]">Valid until</Th>
                        <Th className="w-[170px]">Status</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {quotations.map((q) => {
                        const acceptance = acceptanceLabel(q, "renter");
                        const qValidity = quotationValidity(q, data.today);
                        return (
                          <Tr key={q.id}>
                            <Td className="whitespace-nowrap">
                              <UILink href={`/quotations/${q.id}`} className={REF_LINK}>
                                {q.referenceNumber}
                              </UILink>
                            </Td>
                            <Td>
                              <CellStack title={companyName(q.rentalCompanyOrganizationId)} />
                            </Td>
                            <Td>
                              <CellStack title={q.productName ?? "Machine"} sub={q.machineAssetCode ?? undefined} />
                            </Td>
                            <Td align="right">
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="font-mono text-xs font-semibold text-ink">{formatMoney(q.rate)}</span>
                                <span className="text-[11px] text-meta-light">{formatRateUnit(q.rateUnit)}</span>
                              </div>
                            </Td>
                            <Td>
                              <div className="flex flex-col gap-0.5">
                                <span className="font-mono text-xs">{formatDate(q.validityDate)}</span>
                                {qValidity && <span className={cx("text-[11px] leading-tight", qValidity.className)}>{qValidity.label}</span>}
                              </div>
                            </Td>
                            <Td>
                              <div className="flex flex-col items-start gap-1">
                                <Status domain="quotation" value={q.status} size="sm" />
                                {acceptance && (
                                  <Badge variant="label" tone={acceptance.tone} title={acceptance.title}>
                                    {acceptance.text}
                                  </Badge>
                                )}
                              </div>
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                )}
              </Panel>
            </div>

            <Panel title="Auctions" count={auctions?.length} subtitle="approved companies bid against each other" padding="none">
              {auctions === null ? (
                <EmptyState title="Auctions aren't visible to your role" description="Running auctions needs the Auctions permission." />
              ) : auctions.length === 0 ? (
                <EmptyState
                  title="No auction on this requirement"
                  description={
                    open
                      ? "An auction lets approved rental companies bid within a time window. Closing it doesn't award anything — you pick who to proceed with."
                      : "Auctions can only be started while a requirement is open."
                  }
                />
              ) : (
                <Table bare minWidth={680} caption={`Auctions for ${ref}`}>
                  <Thead>
                    <Tr>
                      <Th className="w-[130px]">Auction</Th>
                      <Th>Bidding</Th>
                      <Th align="right" className="w-[130px]">
                        Base price
                      </Th>
                      <Th className="w-[210px]">Window</Th>
                      <Th className="w-[170px]">Status</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {auctions.map(({ auction, summary }) => (
                      <Tr key={auction.id}>
                        <Td className="whitespace-nowrap">
                          <UILink href={`/auctions?requirementId=${requirement.id}&auctionId=${auction.id}`} className={REF_LINK}>
                            {auctionRef(auction.id)}
                          </UILink>
                        </Td>
                        <Td>
                          <CellStack
                            title={DIRECTION[auction.biddingDirection].rule}
                            sub={summary?.participantCount != null ? plural(summary.participantCount, "participant") : undefined}
                          />
                        </Td>
                        <Td align="right" className="font-mono text-xs font-semibold">
                          {formatMoney(auction.basePrice)}
                        </Td>
                        <Td>
                          <CellStack mono title={formatDateTime(auction.startsAt)} sub={`to ${formatDateTime(auction.endsAt)}`} />
                        </Td>
                        <Td>
                          <div className="flex flex-col items-start gap-1">
                            <Status domain="auction" value={auction.status} size="sm" />
                            {summary?.needsAttention && (
                              <Badge variant="label" tone="warning" title="Worked out: closed with no participant selected">
                                Select a participant
                              </Badge>
                            )}
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </Panel>
          </div>

          <aside aria-label="Requirement facts" className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5 min-[1180px]:max-w-[380px]">
            <RequirementFacts requirement={requirement} entry={entry} />
            <ActivityCard items={data.activity} />
            {interested.length > 0 && lowest !== null && commonUnit && (
              <p className="m-0 px-1 text-[11px] leading-[1.5] text-meta-light">
                Lowest indicative rate: {formatRate(lowest, commonUnit)}. Indicative rates aren&apos;t binding — the formal
                quotation sets the terms.
              </p>
            )}
          </aside>
        </div>
      </PageBody>

      <EditRequirementDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        organizationId={organizationId}
        requirement={requirement}
        equipmentLabel={equipment}
        onUpdated={onRequirementChanged}
      />
      {statusTarget && (
        <RequirementStatusDialog
          key={statusTarget}
          open={statusTo !== null}
          organizationId={organizationId}
          requirement={requirement}
          equipmentLabel={equipment}
          to={statusTarget}
          openQuotations={openQuotations}
          runningAuctions={auctions ? auctions.filter((a) => isRunning(a.auction.status)).length : null}
          onClose={() => setStatusTo(null)}
          onChanged={onRequirementChanged}
        />
      )}
    </div>
  );
}
