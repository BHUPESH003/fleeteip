"use client";

import {
  AuctionStatus,
  BiddingDirection,
  ParticipantStatus,
  type Auction,
  type AuctionBid,
  type AuctionDetail,
  type AuctionEvent,
  type AuctionParticipant,
} from "@fleetip/contracts/auction";
import type { Rental } from "@fleetip/contracts/rental";
import { RequirementStatus, type Requirement } from "@fleetip/contracts/rfq";
import {
  Alert,
  AttentionList,
  Badge,
  Button,
  CellStack,
  ConfirmDialog,
  DescriptionList,
  EmptyState,
  FormBanner,
  KeyFigures,
  KeyFiguresSkeleton,
  Menu,
  PageBody,
  PageHeader,
  Panel,
  Skeleton,
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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PageLoadError } from "../../../components/PageStates";
import { ApiError, apiClient } from "../../../lib/api-client";
import { useConnection } from "../../../lib/connection";
import { downloadCsv } from "../../../lib/csv";
import { OFFLINE_HINT } from "../../../lib/errors";
import { useAction } from "../../../lib/form";
import { formatDateTime, formatMoney, formatRelativeTime, plural } from "../../../lib/format";
import { useListBackHref } from "../../../lib/list-state";
import { useSession } from "../../../lib/session-context";
import { Status, statusLabel } from "../../../lib/status";
import { optional, useLoad } from "../../../lib/use-load";
import { useSticky } from "../requirements/list-kit";
import { equipmentLine, loadSubcategoryIndex, requirementRef } from "../requirements/shared";
import { CreateAuctionDialog } from "./CreateAuctionDialog";
import { useAuctionPolling, useTicker } from "./polling";
import { DIRECTION, auctionRef, formatCountdown, isRunning, timing } from "./shared";


interface LiveData {
  requirementId: string;
  /** Every auction on the requirement, newest first. */
  auctions: Auction[];
  /** The auction on screen; null when the requirement has none. */
  detail: AuctionDetail | null;
  events: AuctionEvent[];
}

interface StaticData {
  /** null without rfq.manage. */
  requirement: Requirement | null;
  equipment: string | null;
  /** Rentals you've had with each rental company (rental.respond); null when not visible. */
  pastRentals: Map<string, number> | null;
}

/** The auction that polls — only the auction calls, never the catalogue. */
async function loadLive(organizationId: string, requirementId: string | null, auctionId: string | null): Promise<LiveData> {
  let reqId = requirementId;
  let detail: AuctionDetail | null = null;
  if (!reqId && auctionId) {
    // The owner can always read its own auction (getAuctionDetail).
    detail = (await apiClient.getAuctionDetail(organizationId, auctionId)) as AuctionDetail;
    reqId = detail.auction.requirementId;
  }
  if (!reqId) throw new ApiError("Auction not found", 404, "not_found");
  const auctions = (await apiClient.listAuctionsForRequirement(organizationId, reqId)) as Auction[];
  const chosen =
    auctions.find((a) => a.id === auctionId) ??
    auctions.find((a) => isRunning(a.status)) ??
    auctions.find((a) => a.status !== AuctionStatus.cancelled) ??
    auctions[0] ??
    null;
  if (!chosen) detail = null;
  else if (detail?.auction.id !== chosen.id) detail = (await apiClient.getAuctionDetail(organizationId, chosen.id)) as AuctionDetail;
  const events =
    detail && detail.auction.status === AuctionStatus.closed
      ? await optional(true, () => apiClient.listAuctionEvents(organizationId, detail!.auction.id) as Promise<AuctionEvent[]>, [] as AuctionEvent[])
      : [];
  return { requirementId: reqId, auctions, detail, events };
}

async function loadStatic(organizationId: string, requirementId: string, access: { requirements: boolean; rentals: boolean }): Promise<StaticData> {
  const [requirement, index, rentals] = await Promise.all([
    optional(access.requirements, () => apiClient.getRequirement(organizationId, requirementId) as Promise<Requirement>, null as Requirement | null),
    loadSubcategoryIndex(),
    // "N past rentals with you" is enrichment (rental.respond) — never blocks the auction.
    optional(access.rentals, () => apiClient.listRentals(organizationId) as Promise<Rental[]>, null as Rental[] | null),
  ]);
  let pastRentals: Map<string, number> | null = null;
  if (rentals) {
    pastRentals = new Map();
    for (const rental of rentals) pastRentals.set(rental.rentalCompanyOrganizationId, (pastRentals.get(rental.rentalCompanyOrganizationId) ?? 0) + 1);
  }
  return {
    requirement,
    equipment: requirement ? equipmentLine(requirement, index.get(requirement.productSubcategoryId)?.subcategory.name) : null,
    pastRentals,
  };
}

/** Renter (auction.manage): run the auction on one requirement — create, approve participants, watch bids, close, select. */
export function RenterAuctionView({
  organizationId,
  requirementId,
  auctionId,
}: {
  organizationId: string;
  requirementId: string | null;
  auctionId: string | null;
}) {
  const { hasPermission } = useSession();
  const access = { requirements: hasPermission("rfq.manage"), rentals: hasPermission("rental.respond") };
  const live = useLoad(() => loadLive(organizationId, requirementId, auctionId), [organizationId, requirementId, auctionId]);
  const reqId = live.data?.requirementId ?? null;
  const stat = useLoad(() => loadStatic(organizationId, reqId!, access), [organizationId, reqId, access.requirements, access.rentals], Boolean(reqId));

  if (live.error) {
    return (
      <PageLoadError
        error={live.error}
        onRetry={() => void live.reload()}
        notFound={{
          title: "We can't find this auction",
          body: "It may belong to a different organization, or the link is wrong. Auctions are never deleted — a cancelled one would still open.",
        }}
        forbidden={{ what: "auctions", permissionHint: "Running auctions needs the Auctions permission." }}
        serverTitle="This auction didn't load"
        backHref="/auctions"
        backLabel="Back to auctions"
      />
    );
  }
  if (live.loading || !live.data) return <AuctionDetailSkeleton />;
  return (
    <RenterAuctionScreen
      organizationId={organizationId}
      live={live.data}
      stat={stat.data}
      reload={() => void live.reload()}
      paused={live.refreshing}
    />
  );
}

function RenterAuctionScreen({
  organizationId,
  live,
  stat,
  reload,
  paused,
}: {
  organizationId: string;
  live: LiveData;
  stat: StaticData | null;
  reload: () => void;
  paused: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { online } = useConnection();
  const backHref = useListBackHref("auctions", "/auctions");
  const now = useTicker();
  const offline = !online;
  const participantsRef = useRef<HTMLDivElement>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [confirm, setConfirm] = useState<"close" | "cancel" | "select" | null>(null);
  const [rejecting, setRejecting] = useState<AuctionParticipant | null>(null);
  const rejectTarget = useSticky(rejecting);
  const [choice, setChoice] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const reviewAction = useAction();

  const detail = live.detail;
  const auction = detail?.auction ?? null;
  useAuctionPolling(auction, reload, now, paused || confirm !== null || rejecting !== null);

  const requirement = stat?.requirement ?? null;
  const reqRef = requirementRef(live.requirementId);
  const requirementOpen = requirement ? requirement.status === RequirementStatus.open : true;
  const runningAuction = live.auctions.find((a) => isRunning(a.status)) ?? null;

  // ?create=1 ("Start auction" on the requirement page) opens the form once
  // there's nothing running. Keyed on the param, then stripped.
  const createParam = searchParams.get("create");
  useEffect(() => {
    if (createParam !== "1") return;
    if (!runningAuction && requirementOpen) setCreateOpen(true);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("create");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [createParam]);

  // Row button: failures are a toast. One action for the table (rows run one at a time); `reviewing` is the busy row.
  // Rejecting goes through its own confirm dialog below.
  function approve(participant: AuctionParticipant) {
    if (!auction) return;
    const name = participant.rentalCompanyOrganizationName;
    setReviewing(participant.id);
    void reviewAction
      .run(() => apiClient.reviewParticipant(organizationId, auction.id, participant.id, ParticipantStatus.approved), {
        failTitle: `Couldn't update ${name}`,
        report: "toast",
        success: () => ({
          title: `${name} approved to bid`,
          body: `They're notified and can bid in ${auctionRef(auction.id)} ${auction.status === AuctionStatus.live ? "now" : "once it opens"}.`,
        }),
        onDone: reload,
      })
      .finally(() => setReviewing(null));
  }

  // ------------------------------------------------------------------ no auction on this requirement
  if (!detail || !auction) {
    return (
      <div className="flex min-w-0 flex-col">
        <PageHeader
          breadcrumbs={[
            { label: "Auctions", href: backHref },
            { label: reqRef, mono: true },
          ]}
          title={`Auction for ${reqRef}`}
          description={stat?.equipment ?? undefined}
          actions={
            <Button
              icon="plus"
              onClick={() => setCreateOpen(true)}
              disabled={offline || !requirementOpen}
              title={offline ? OFFLINE_HINT : !requirementOpen ? `The requirement is ${statusLabel("requirement", requirement?.status ?? RequirementStatus.closed)} — only open requirements can be auctioned.` : undefined}
            >
              Start auction
            </Button>
          }
        />
        <PageBody>
          <Panel title="No auction yet" padding="none">
            <EmptyState
              title={`${reqRef} has no auction`}
              description={
                requirementOpen
                  ? "Set a base price and a time window. Rental companies see “In auction” in the Open Market and ask to join; you approve who bids. Closing doesn't award anything — you pick who to proceed with."
                  : "Auctions can only be started while a requirement is open."
              }
              action={
                <UILink href={`/requirements/${live.requirementId}`} className="text-sm font-medium text-accent-text hover:underline">
                  Back to {reqRef}
                </UILink>
              }
            />
          </Panel>
        </PageBody>
        <CreateAuctionDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          organizationId={organizationId}
          requirementId={live.requirementId}
          requirementLabel={stat?.equipment}
          onCreated={(created) => router.replace(`/auctions?requirementId=${created.requirementId}&auctionId=${created.id}`)}
        />
      </div>
    );
  }

  // ------------------------------------------------------------------ derived
  const { participants, bids, result } = detail;
  const ref = auctionRef(auction.id);
  const direction = DIRECTION[auction.biddingDirection];
  const when = timing(auction, now);
  const selected = participants.find((p) => p.status === ParticipantStatus.selected) ?? null;
  const approved = participants.filter((p) => p.status === ParticipantStatus.approved);
  const pending = participants.filter((p) => p.status === ParticipantStatus.pending);
  const rejected = participants.filter((p) => p.status === ParticipantStatus.rejected);
  const leading = bids.find((b) => b.isLeading) ?? null;
  const running = isRunning(auction.status);
  const closedNoSelection = auction.status === AuctionStatus.closed && !selected;

  const bestOf = (own: AuctionBid[]) =>
    own.length ? (auction.biddingDirection === BiddingDirection.ascending ? Math.max(...own.map((b) => b.amount)) : Math.min(...own.map((b) => b.amount))) : null;
  const ranked = participants
    .map((p) => {
      const own = bids.filter((b) => b.participantId === p.id);
      return { participant: p, own, best: bestOf(own), last: own[own.length - 1] ?? null };
    })
    .sort((a, b) => {
      if (a.best === null && b.best === null) return 0;
      if (a.best === null) return 1;
      if (b.best === null) return -1;
      return auction.biddingDirection === BiddingDirection.ascending ? b.best - a.best : a.best - b.best;
    });
  const chosenRow = ranked.find((r) => r.participant.id === choice) ?? null;
  const topBest = ranked[0]?.best ?? null;

  // ------------------------------------------------------------------ actions
  let primary: ReactNode = null;
  if (auction.status === AuctionStatus.live) {
    primary = (
      <Button icon="clock" onClick={() => setConfirm("close")} disabled={offline} title={offline ? OFFLINE_HINT : "Stop bidding now instead of at the end time."}>
        Close now
      </Button>
    );
  } else if (closedNoSelection) {
    primary = (
      <Button
        icon="check"
        onClick={() => setConfirm("select")}
        disabled={offline || !choice}
        title={offline ? OFFLINE_HINT : !choice ? "Choose an approved participant in the table first." : undefined}
      >
        Select participant
      </Button>
    );
  } else if (selected) {
    primary = (
      <UILink
        href="/quotations"
        className="inline-flex h-[34px] items-center gap-[7px] rounded-control bg-accent px-[14px] text-sm font-semibold text-white no-underline hover:bg-accent-press"
      >
        View quotations
      </UILink>
    );
  }

  const menuItems: MenuItem[] = [];
  if (auction.status === AuctionStatus.scheduled) {
    menuItems.push({
      key: "close",
      label: "Close now",
      icon: "clock",
      disabled: offline,
      hint: offline ? OFFLINE_HINT : "Closes it before it opens — no bids, so no result.",
      onSelect: () => setConfirm("close"),
    });
  }
  menuItems.push({
    key: "sheet",
    label: "Download bid sheet",
    icon: "export",
    disabled: bids.length === 0,
    hint: bids.length ? `${plural(bids.length, "bid")} as a CSV file.` : "No bids yet.",
    onSelect: () =>
      downloadCsv(
        `${auction.id.slice(0, 8)}-bids.csv`,
        ["Rental company", "Rank/status", "Amount", "Placed"],
        bids.map((b) => [b.rentalCompanyOrganizationName ?? "", b.isLeading ? "Leading" : "", b.amount, b.createdAt]),
      ),
  });
  if (!running && requirementOpen && !runningAuction) {
    menuItems.push({
      key: "another",
      label: "Start another auction",
      icon: "plus",
      disabled: offline,
      hint: offline ? OFFLINE_HINT : `A new auction on ${reqRef}. This one stays on record.`,
      onSelect: () => setCreateOpen(true),
    });
  }
  menuItems.push({ key: "requirement", label: `Open ${reqRef}`, icon: "requirement", href: `/requirements/${live.requirementId}` });
  menuItems.push({
    key: "cancel",
    label: "Cancel auction",
    icon: "close",
    danger: true,
    separatorBefore: true,
    disabled: !running || offline,
    hint: offline ? OFFLINE_HINT : running ? "Stops it with no result. Participants aren't notified." : `It's ${statusLabel("auction", auction.status)} — only a scheduled or live auction can be cancelled.`,
    onSelect: () => setConfirm("cancel"),
  });

  // ------------------------------------------------------------------ attention
  const scrollToParticipants = () => participantsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const attention: AttentionListItem[] = [];
  if (closedNoSelection) {
    attention.push({
      key: "select",
      severity: "warning",
      title: "Closed — no participant selected yet",
      context: approved.length
        ? "Closing didn't award anything. Choose who to proceed with; they can then send a quotation."
        : "No participant was approved, so there's no one to select. Start another auction if you still need one.",
      action: approved.length ? { label: "Choose participant", onClick: scrollToParticipants } : undefined,
    });
  }
  if (running && pending.length) {
    attention.push({
      key: "pending",
      severity: "warning",
      title: `${plural(pending.length, "company", "companies")} asked to join`,
      context: `${pending.map((p) => p.rentalCompanyOrganizationName).join(", ")}. They can't bid until you approve them.`,
      action: { label: "Review requests", onClick: scrollToParticipants },
    });
  }
  if (auction.status === AuctionStatus.live && approved.length === 0) {
    attention.push({
      key: "nobody",
      severity: "info",
      title: "Nobody can bid yet",
      context: "No participant is approved. Approve a request, or wait for companies to ask to join.",
    });
  }

  const figures: KeyFigure[] = [
    { key: "base", label: "Base price", value: formatMoney(auction.basePrice), context: `${direction.label} · ${direction.rule.toLowerCase()}` },
    {
      key: "leading",
      label: auction.status === AuctionStatus.closed ? direction.best : "Leading bid",
      value: auction.status === AuctionStatus.closed ? (result?.winningAmount != null ? formatMoney(result.winningAmount) : "—") : leading ? formatMoney(leading.amount) : "—",
      context:
        auction.status === AuctionStatus.closed
          ? result?.winningAmount != null
            ? `${Math.round(((result.winningAmount - auction.basePrice) / auction.basePrice) * 100)}% against the base price`
            : "No bids were placed"
          : leading
            ? (leading.rentalCompanyOrganizationName ?? "Bidder not named")
            : "No bids yet",
    },
    {
      key: "participants",
      label: "Approved to bid",
      value: approved.length + (selected ? 1 : 0),
      unit: approved.length + (selected ? 1 : 0) === 1 ? "company" : "companies",
      context: `${pending.length} waiting · ${rejected.length} not approved`,
    },
    {
      key: "bids",
      label: "Bids placed",
      value: bids.length,
      context: auction.maxBidsPerParticipant ? `Up to ${auction.maxBidsPerParticipant} per company` : "No limit per company",
    },
    {
      key: "time",
      label: auction.status === AuctionStatus.scheduled ? "Opens in" : auction.status === AuctionStatus.live ? "Closes in" : "Ended",
      value: running ? formatCountdown(auction.status === AuctionStatus.scheduled ? auction.startsAt : auction.endsAt, now) : formatDateTime(result?.closedAt ?? auction.updatedAt),
      context: `${formatDateTime(auction.startsAt)} → ${formatDateTime(auction.endsAt)}`,
      tone: auction.status === AuctionStatus.live ? "warning" : undefined,
    },
  ];

  const eventText = (e: AuctionEvent) => {
    const payload = (e.payload ?? {}) as { winningAmount?: number | null; amount?: number };
    if (e.eventType === "closed")
      return payload.winningAmount != null ? `Auction closed — winning bid ${formatMoney(payload.winningAmount)}` : "Auction closed with no bids";
    if (e.eventType === "bid_placed") return `Bid of ${formatMoney(payload.amount ?? 0)} placed`;
    return e.eventType.replace(/_/g, " ");
  };

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        breadcrumbs={[
          { label: "Auctions", href: backHref },
          { label: ref, mono: true },
        ]}
        note="Filters on the auctions list are kept when you go back"
        title={ref}
        titleMono
        meta={
          <>
            <Status domain="auction" value={auction.status} />
            {closedNoSelection && (
              <Badge variant="label" tone="warning" title="Worked out: closed with no participant selected">
                Select a participant
              </Badge>
            )}
            <span className={cx("font-mono text-xs", when.tone === "live" ? "font-semibold text-attention" : "text-meta")} aria-live="off">
              {when.label}
            </span>
          </>
        }
        description={
          <span className="text-base font-medium leading-[1.3] text-ink-strong">
            {stat?.equipment ?? "Requirement"}
            {requirement?.projectName && <span className="font-normal text-meta"> · {requirement.projectName}</span>}
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
            {
              label: "Requirement",
              value: (
                <UILink href={`/requirements/${live.requirementId}`} className="font-mono text-accent-text hover:underline">
                  {reqRef}
                </UILink>
              ),
            },
            { label: "Bidding", value: direction.rule },
            { label: "Base price", value: formatMoney(auction.basePrice), mono: true },
            { label: "Bid limit", value: auction.maxBidsPerParticipant ? `${auction.maxBidsPerParticipant} per company` : "No limit" },
          ]}
        />
      </PageHeader>

      <PageBody>
        <AttentionList items={attention} note="Worked out from the auction as it loaded; it refreshes while live." />
        {closedNoSelection && approved.length > 0 && (
          <Alert tone="warning" title="Closing the auction didn't award anything">
            Pick the participant you want to proceed with — price is one input, not the decision. They can then send a quotation, which you
            accept or reject like any other.
          </Alert>
        )}
        {selected && (
          <Alert tone="success" title={`You selected ${selected.rentalCompanyOrganizationName}`}>
            They were notified and can send a quotation from this auction. It will appear under Quotations.
          </Alert>
        )}
        <KeyFigures items={figures} />

        <div className="flex flex-wrap items-start gap-3.5">
          <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-3.5">
            <div ref={participantsRef} className="scroll-mt-4">
              <Panel
                title="Participants"
                count={participants.length}
                subtitle={closedNoSelection ? "ranked by best bid · choose any approved company" : "companies that asked to join"}
                padding="none"
              >
                {participants.length === 0 ? (
                  <EmptyState
                    title="No companies have asked to join"
                    description={running ? "Rental companies see “In auction” on this requirement in the Open Market and ask to join from there." : "Nobody joined this auction."}
                  />
                ) : (
                  <Table bare minWidth={760} caption={`Participants in ${ref}`}>
                    <Thead>
                      <Tr>
                        {closedNoSelection && (
                          <Th className="w-[70px]">
                            <span className="sr-only">Choose</span>
                          </Th>
                        )}
                        <Th className="w-[60px]">Rank</Th>
                        <Th>Rental company</Th>
                        <Th align="right" className="w-[130px]">
                          Best bid
                        </Th>
                        <Th align="right" className="w-[70px]">
                          Bids
                        </Th>
                        <Th className="w-[140px]">Status</Th>
                        <Th className="w-[180px]">
                          <span className="sr-only">Actions</span>
                        </Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {ranked.map((row, index) => {
                        const p = row.participant;
                        const past = stat?.pastRentals?.get(p.rentalCompanyOrganizationId) ?? 0;
                        return (
                          <Tr key={p.id} selected={choice === p.id}>
                            {closedNoSelection && (
                              <Td>
                                {p.status === ParticipantStatus.approved && (
                                  <input
                                    type="radio"
                                    name="selectedParticipant"
                                    aria-label={`Choose ${p.rentalCompanyOrganizationName}`}
                                    checked={choice === p.id}
                                    onChange={() => setChoice(p.id)}
                                    className="h-4 w-4 cursor-pointer accent-accent"
                                  />
                                )}
                              </Td>
                            )}
                            <Td className="font-mono text-xs">{row.best !== null ? index + 1 : "—"}</Td>
                            <Td>
                              <CellStack
                                title={p.rentalCompanyOrganizationName}
                                sub={past > 0 ? `${plural(past, "past rental")} with you` : `Asked ${formatRelativeTime(p.createdAt)}`}
                              />
                            </Td>
                            <Td align="right">
                              {row.best !== null ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="font-mono text-xs font-semibold text-ink">{formatMoney(row.best)}</span>
                                  {row.best === topBest && (
                                    <Badge variant="label" tone="success" title="Worked out from the bids">
                                      {direction.best}
                                    </Badge>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-disabled-text">—</span>
                              )}
                            </Td>
                            <Td align="right" className="font-mono text-xs">
                              {row.own.length}
                            </Td>
                            <Td>
                              <Status domain="participant" value={p.status} size="sm" />
                            </Td>
                            <Td>
                              <div className="flex justify-end gap-2">
                                {running && p.status === ParticipantStatus.pending && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => approve(p)}
                                      busy={reviewing === p.id}
                                      busyLabel="Saving…"
                                      disabled={offline || (reviewing !== null && reviewing !== p.id)}
                                    >
                                      Approve
                                    </Button>
                                    <Button size="sm" variant="secondary" onClick={() => setRejecting(p)} disabled={offline || reviewing !== null}>
                                      Reject
                                    </Button>
                                  </>
                                )}
                                {running && p.status === ParticipantStatus.rejected && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => approve(p)}
                                    busy={reviewing === p.id}
                                    busyLabel="Saving…"
                                    disabled={offline || (reviewing !== null && reviewing !== p.id)}
                                    title="Let them bid after all."
                                  >
                                    Approve
                                  </Button>
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

            <Panel title="Bids" count={bids.length} subtitle="oldest first · you see every bidder" padding="none">
              {bids.length === 0 ? (
                <EmptyState title="No bids yet" description={running ? "Approved companies can bid while it's live." : "No bids were placed."} />
              ) : (
                <Table bare minWidth={560} caption={`Bids in ${ref}`}>
                  <Thead>
                    <Tr>
                      <Th className="w-[50px]">#</Th>
                      <Th>Bidder</Th>
                      <Th align="right" className="w-[140px]">
                        Amount
                      </Th>
                      <Th className="w-[170px]">Placed</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {bids.map((bid, index) => (
                      <Tr key={bid.id} className={bid.isLeading ? "bg-surface-selected" : undefined}>
                        <Td className="font-mono text-xs text-meta">{index + 1}</Td>
                        <Td>
                          <span className="inline-flex items-center gap-2">
                            {bid.rentalCompanyOrganizationName ?? "Bidder not named"}
                            {bid.isLeading && (
                              <Badge variant="label" tone="success" title="Worked out by the server from all bids">
                                Leading
                              </Badge>
                            )}
                          </span>
                        </Td>
                        <Td align="right" className="font-mono text-xs font-semibold">
                          {formatMoney(bid.amount)}
                        </Td>
                        <Td className="font-mono text-xs">{formatDateTime(bid.createdAt)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </Panel>

            {live.auctions.length > 1 && (
              <Panel title={`Other auctions on ${reqRef}`} count={live.auctions.length - 1} padding="none">
                <Table bare minWidth={520} caption={`Other auctions on ${reqRef}`}>
                  <Thead>
                    <Tr>
                      <Th className="w-[130px]">Auction</Th>
                      <Th>Window</Th>
                      <Th className="w-[120px]">Status</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {live.auctions
                      .filter((a) => a.id !== auction.id)
                      .map((a) => (
                        <Tr key={a.id}>
                          <Td>
                            <UILink
                              href={`/auctions?requirementId=${a.requirementId}&auctionId=${a.id}`}
                              className="font-mono text-xs font-medium text-accent-text no-underline hover:underline"
                            >
                              {auctionRef(a.id)}
                            </UILink>
                          </Td>
                          <Td className="font-mono text-xs">
                            {formatDateTime(a.startsAt)} → {formatDateTime(a.endsAt)}
                          </Td>
                          <Td>
                            <Status domain="auction" value={a.status} size="sm" />
                          </Td>
                        </Tr>
                      ))}
                  </Tbody>
                </Table>
              </Panel>
            )}
          </div>

          <aside aria-label="Auction facts" className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5 min-[1180px]:max-w-[380px]">
            <Panel title="Auction log" subtitle={auction.status === AuctionStatus.closed ? "from the server's audit trail" : "shown once it closes"} padding="md">
              {auction.status !== AuctionStatus.closed ? (
                <p className="m-0 text-xs leading-[1.5] text-ink-soft">The bid-by-bid log appears here after the auction closes. Live bids are in the Bids table.</p>
              ) : live.events.length === 0 ? (
                <p className="m-0 text-xs text-ink-soft">No events recorded.</p>
              ) : (
                <ol className="m-0 flex list-none flex-col gap-3 p-0">
                  {live.events.map((e) => (
                    <li key={e.id} className="flex flex-col gap-0.5">
                      <span className="text-xs text-ink-strong">{eventText(e)}</span>
                      <span className="text-[11px] text-meta-light">{formatRelativeTime(e.createdAt)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
            <p className="m-0 px-1 text-[11px] leading-[1.5] text-meta-light">
              Bidders see only their own bids and the leading amount, never who else is bidding. FleetIP polls for new bids every few
              seconds while it&apos;s live.
            </p>
          </aside>
        </div>
      </PageBody>

      <CreateAuctionDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        organizationId={organizationId}
        requirementId={live.requirementId}
        requirementLabel={stat?.equipment}
        onCreated={(created) => router.replace(`/auctions?requirementId=${created.requirementId}&auctionId=${created.id}`)}
      />

      <AuctionConfirm
        open={confirm === "close"}
        onClose={() => setConfirm(null)}
        icon="clock"
        tone="warning"
        title={`Close auction ${ref} now?`}
        description={`${direction.rule} · base ${formatMoney(auction.basePrice)} · ${plural(bids.length, "bid")} so far`}
        consequences={[
          `Bidding stops now instead of at ${formatDateTime(auction.endsAt)}.`,
          leading
            ? `The leading bid — ${formatMoney(leading.amount)}${leading.rentalCompanyOrganizationName ? ` from ${leading.rentalCompanyOrganizationName}` : ""} — is recorded as the result.`
            : "There are no bids, so it closes with no result.",
          "Closing doesn't award anything. You then select the participant to proceed with.",
          "You and the approved participants are notified that it ended.",
          "This can't be undone.",
        ]}
        cancelLabel="Keep it running"
        confirmLabel="Close auction"
        busyLabel="Closing…"
        failureTitle={`${ref} wasn't closed`}
        run={() => apiClient.closeAuctionEarly(organizationId, auction.id)}
        success={{ title: `Auction ${ref} closed`, body: "Bidding has stopped. Select the participant to proceed with." }}
        onDone={reload}
      />
      <AuctionConfirm
        open={confirm === "cancel"}
        onClose={() => setConfirm(null)}
        icon="close"
        tone="danger"
        title={`Cancel auction ${ref}?`}
        description={`${plural(participants.length, "participant")} · ${plural(bids.length, "bid")}`}
        consequences={[
          "Bidding stops and no result is recorded.",
          "Participants aren't notified — tell them if they were expecting it.",
          requirementOpen ? `${reqRef} stays open, and you can start another auction on it.` : `${reqRef} isn't changed.`,
          "Cancelling can't be undone.",
        ]}
        cancelLabel="Keep auction"
        confirmLabel="Cancel auction"
        busyLabel="Cancelling…"
        confirmVariant="danger"
        failureTitle={`${ref} wasn't cancelled`}
        run={() => apiClient.cancelAuction(organizationId, auction.id)}
        success={{ title: `Auction ${ref} cancelled`, body: "Its status changed to Cancelled. Bids are kept on record." }}
        onDone={reload}
      />
      {chosenRow && (
        <AuctionConfirm
          open={confirm === "select"}
          onClose={() => setConfirm(null)}
          icon="check"
          tone="success"
          title={`Select ${chosenRow.participant.rentalCompanyOrganizationName} for ${ref}?`}
          description={chosenRow.best !== null ? `Best bid ${formatMoney(chosenRow.best)} · ${plural(chosenRow.own.length, "bid")}` : "No bids from them"}
          consequences={[
            `${chosenRow.participant.rentalCompanyOrganizationName} is notified and can create a quotation from this auction.`,
            ...(topBest !== null && chosenRow.best !== topBest
              ? [`Their best bid isn't the ${direction.best.toLowerCase()} (${formatMoney(topBest)}). That's allowed — price is one input.`]
              : []),
            "Selection is final — no other participant can be selected for this auction.",
            "Nothing is awarded yet. You accept or reject their quotation like any other.",
          ]}
          cancelLabel="Not yet"
          confirmLabel="Select company"
          busyLabel="Selecting…"
          failureTitle="The participant wasn't selected"
          run={() => apiClient.selectParticipant(organizationId, auction.id, chosenRow.participant.id)}
          success={{
            title: `${chosenRow.participant.rentalCompanyOrganizationName} selected for ${ref}`,
            body: "They've been notified and can now send a quotation.",
          }}
          onDone={reload}
        />
      )}
      {rejectTarget && (
        <AuctionConfirm
          key={rejectTarget.id}
          open={rejecting !== null}
          onClose={() => setRejecting(null)}
          icon="close"
          tone="neutral"
          title={`Reject ${rejectTarget.rentalCompanyOrganizationName}'s request to join ${ref}?`}
          consequences={[
            "They can't bid in this auction.",
            "They aren't notified.",
            "You can still approve them later while the auction is running.",
          ]}
          cancelLabel="Not yet"
          confirmLabel="Reject request"
          busyLabel="Saving…"
          failureTitle="The request wasn't rejected"
          run={() => apiClient.reviewParticipant(organizationId, auction.id, rejectTarget.id, ParticipantStatus.rejected)}
          success={{ title: `${rejectTarget.rentalCompanyOrganizationName} not approved`, body: `They can't bid in ${ref}.` }}
          onDone={reload}
        />
      )}
    </div>
  );
}

function AuctionConfirm({
  open,
  onClose,
  icon,
  tone,
  title,
  description,
  consequences,
  cancelLabel,
  confirmLabel,
  busyLabel,
  confirmVariant,
  failureTitle,
  run,
  success,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  icon: "clock" | "close" | "check";
  tone: "warning" | "danger" | "success" | "neutral";
  title: string;
  description?: string;
  consequences: string[];
  cancelLabel: string;
  confirmLabel: string;
  busyLabel: string;
  confirmVariant?: "primary" | "danger";
  failureTitle: string;
  run: () => Promise<unknown>;
  success: { title: string; body: string };
  onDone: () => void;
}) {
  const { online } = useConnection();
  const action = useAction();
  const { clear } = action;

  useEffect(() => {
    if (open) clear();
  }, [open, clear]);

  async function confirm() {
    await action.run(run, {
      failTitle: failureTitle,
      success: () => success,
      onDone: () => {
        onDone();
        onClose();
      },
    });
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={confirm}
      icon={icon}
      tone={tone}
      title={title}
      description={description}
      consequences={consequences}
      cancelLabel={cancelLabel}
      confirmLabel={confirmLabel}
      busyLabel={busyLabel}
      confirmVariant={confirmVariant}
      busy={action.busy}
      confirmDisabled={!online}
    >
      {action.banner && (
        <FormBanner tone="error" title="Nothing was changed">
          {action.banner.body}
        </FormBanner>
      )}
    </ConfirmDialog>
  );
}

/** Matches the auction layout (header, figures, two columns). */
export function AuctionDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading auction" className="flex flex-col">
      <div className="flex flex-col gap-3.5 border-b border-border-header bg-surface px-6 pb-[18px] pt-4 max-[760px]:px-4">
        <Skeleton className="h-2.5 w-[180px]" />
        <div className="flex items-center gap-4">
          <div className="flex flex-1 flex-col gap-[9px]">
            <Skeleton className="h-5 w-[200px] max-w-[80%]" />
            <Skeleton className="h-3 w-[380px] max-w-[90%]" />
          </div>
          <Skeleton className="h-[34px] w-[140px] rounded-control" />
        </div>
      </div>
      <div className="flex flex-col gap-3.5 px-6 py-[18px] max-[760px]:px-4">
        <KeyFiguresSkeleton count={5} />
        <div className="flex flex-wrap gap-3.5">
          <div className="h-[360px] min-w-0 flex-[1_1_560px] rounded-panel border border-border-soft bg-surface" />
          <div className="h-[360px] min-w-0 flex-[1_1_300px] rounded-panel border border-border-soft bg-surface min-[1180px]:max-w-[380px]" />
        </div>
        <span role="status" className="text-xs text-meta">
          Loading auction…
        </span>
      </div>
    </div>
  );
}
