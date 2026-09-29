"use client";

import { AuctionStatus, BiddingDirection, ParticipantStatus, type Auction, type AuctionDetail } from "@fleetip/contracts/auction";
import type { NotificationListResponse } from "@fleetip/contracts/notification";
import type { Organization } from "@fleetip/contracts/organization";
import type { Requirement } from "@fleetip/contracts/rfq";
import {
  Alert,
  AttentionList,
  Badge,
  Button,
  DescriptionList,
  EmptyState,
  FormBanner,
  Icon,
  Input,
  KeyFigures,
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
  useToast,
  type AttentionListItem,
  type KeyFigure,
} from "@fleetip/ui";
import { useMemo, useState, type ReactNode } from "react";
import { z } from "zod";
import { PageLoadError } from "../../../components/PageStates";
import { ApiError, apiClient } from "../../../lib/api-client";
import { useConnection } from "../../../lib/connection";
import { describeError, OFFLINE_HINT } from "../../../lib/errors";
import { useForm } from "../../../lib/form";
import { formatDateTime, formatMoney, formatRateUnit, formatRelativeTime, plural } from "../../../lib/format";
import { useListBackHref } from "../../../lib/list-state";
import { useSession } from "../../../lib/session-context";
import { Status, statusLabel } from "../../../lib/status";
import { optional, useLoad } from "../../../lib/use-load";
import { equipmentLine, loadSubcategoryIndex, requirementRef } from "../requirements/shared";
import { AuctionDetailSkeleton } from "./RenterAuctionView";
import { useAuctionPolling, useTicker } from "./polling";
import { DIRECTION, auctionRef, bidError, bidRuleText, bidTag, bidsRemaining, formatCountdown, isRunning, timing } from "./shared";

const LINK_PRIMARY =
  "inline-flex h-[34px] items-center gap-[7px] rounded-control bg-accent px-[14px] text-sm font-semibold text-white no-underline hover:bg-accent-press";

interface LiveData {
  auction: Auction | null;
  /**
   * Participant isolation: getAuctionDetail 404s for an organization that
   * isn't a participant yet, so null here means "not yet a participant" —
   * never an error. A participant's detail carries only its own participant
   * row, its own bids and the current leading bid (competitor names withheld).
   */
  detail: AuctionDetail | null;
  requirementId: string | null;
}

interface StaticData {
  requirement: Requirement | null;
  equipment: string | null;
  ownerName: string | null;
  activity: { id: string; text: string; when: string }[];
}

const isNotFound = (err: unknown) => err instanceof ApiError && err.status === 404;

async function loadLive(organizationId: string, requirementId: string | null, auctionId: string | null): Promise<LiveData> {
  let auction: Auction | null = null;
  let detail: AuctionDetail | null = null;
  if (auctionId) {
    try {
      detail = (await apiClient.getAuctionDetail(organizationId, auctionId)) as AuctionDetail;
      // A link naming a different requirement than the auction's own is ignored.
      if (!requirementId || detail.auction.requirementId === requirementId) auction = detail.auction;
      else detail = null;
    } catch (err) {
      if (!isNotFound(err)) throw err;
      // Not a participant of that auction (yet) — fall back to the requirement's auction below.
    }
  }
  const reqId = requirementId ?? auction?.requirementId ?? null;
  if (!auction && reqId) {
    try {
      auction = (await apiClient.getActiveAuctionForRequirement(organizationId, reqId)) as Auction;
    } catch (err) {
      if (!isNotFound(err)) throw err;
      auction = null;
    }
    if (auction) {
      try {
        detail = (await apiClient.getAuctionDetail(organizationId, auction.id)) as AuctionDetail;
        auction = detail.auction;
      } catch (err) {
        if (!isNotFound(err)) throw err;
        detail = null;
      }
    }
  }
  return { auction, detail, requirementId: reqId };
}

async function loadStatic(organizationId: string, requirementId: string | null, auctionId: string | null, canListRenters: boolean): Promise<StaticData> {
  const [requirement, index, renters, notifications] = await Promise.all([
    requirementId
      ? optional(true, () => apiClient.getRequirementForDiscovery(organizationId, requirementId) as Promise<Requirement>, null as Requirement | null)
      : Promise.resolve(null),
    requirementId ? loadSubcategoryIndex() : Promise.resolve(null),
    // The owner's name is enrichment (quotation.manage), not this page's
    // purpose (auction.participate) — a role without it still gets a
    // working auction, never an error banner (docs/decisions.md).
    optional(canListRenters, () => apiClient.listRenterOrganizations(organizationId) as Promise<Organization[]>, [] as Organization[]),
    optional(true, () => apiClient.listNotifications(organizationId) as Promise<NotificationListResponse>, null as NotificationListResponse | null),
  ]);
  return {
    requirement,
    equipment: requirement && index ? equipmentLine(requirement, index.get(requirement.productSubcategoryId)?.subcategory.name) : null,
    ownerName: requirement ? (renters.find((o) => o.id === requirement.renterOrganizationId)?.name ?? null) : null,
    activity: (notifications?.notifications ?? [])
      .filter((n) => n.relatedResourceType === "auction" && auctionId !== null && n.relatedResourceId === auctionId)
      .map((n) => ({ id: n.id, text: n.message, when: formatRelativeTime(n.createdAt) })),
  };
}

/** Rental Company (auction.participate): find the auction, ask to join, bid once approved. */
export function BidderAuctionView({
  organizationId,
  requirementId,
  auctionId,
}: {
  organizationId: string;
  requirementId: string | null;
  auctionId: string | null;
}) {
  const { hasPermission } = useSession();
  const canListRenters = hasPermission("quotation.manage");
  const live = useLoad(() => loadLive(organizationId, requirementId, auctionId), [organizationId, requirementId, auctionId]);
  const reqId = live.data?.requirementId ?? null;
  const resolvedAuctionId = live.data?.auction?.id ?? null;
  const stat = useLoad(
    () => loadStatic(organizationId, reqId, resolvedAuctionId, canListRenters),
    [organizationId, reqId, resolvedAuctionId, canListRenters],
    Boolean(live.data),
  );

  if (live.error) {
    return (
      <PageLoadError
        error={live.error}
        onRetry={() => void live.reload()}
        notFound={{ title: "We can't find this auction", body: "It may have been cancelled, or the link is wrong." }}
        forbidden={{ what: "auctions", permissionHint: "Bidding in auctions needs the Auctions permission." }}
        serverTitle="This auction didn't load"
        backHref="/auctions"
        backLabel="Back to auctions"
      />
    );
  }
  if (live.loading || !live.data) return <AuctionDetailSkeleton />;
  return (
    <BidderScreen
      organizationId={organizationId}
      live={live.data}
      stat={stat.data}
      reload={() => void live.reload()}
      paused={live.refreshing}
    />
  );
}

function BidderScreen({
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
  const toast = useToast();
  const { online } = useConnection();
  const { hasPermission } = useSession();
  const backHref = useListBackHref("auctions", "/auctions");
  const now = useTicker();
  const offline = !online;
  const canQuote = hasPermission("quotation.manage");

  const [joining, setJoining] = useState(false);

  const { auction, detail } = live;
  const leadingAmount = detail?.bids.find((b) => b.isLeading)?.amount ?? null;
  // Re-checked on every render: the leading bid moves while the page polls.
  const bidSchema = useMemo(
    () =>
      z
        .object({
          amount: z.string().superRefine((raw, ctx) => {
            const message = auction ? bidError(raw, auction, leadingAmount) : null;
            if (message) ctx.addIssue({ code: "custom", message });
          }),
        })
        .transform(({ amount }) => Number(amount)),
    [auction, leadingAmount],
  );
  const bidForm = useForm({ schema: bidSchema, initial: { amount: "" }, failTitle: "Your bid wasn't placed" });
  useAuctionPolling(auction, reload, now, paused || bidForm.busy);

  const requirement = stat?.requirement ?? null;
  const reqRef = live.requirementId ? requirementRef(live.requirementId) : null;

  if (!auction) {
    return (
      <div className="flex min-w-0 flex-col">
        <PageHeader
          breadcrumbs={[{ label: "Auctions", href: backHref }, { label: reqRef ?? "Auction", mono: Boolean(reqRef) }]}
          title={reqRef ? `Auction for ${reqRef}` : "Auction"}
          description={stat?.equipment ?? undefined}
        />
        <PageBody>
          <Panel title={reqRef ? "No auction running" : "You're not part of this auction"} padding="none">
            <EmptyState
              title={reqRef ? `${reqRef} doesn't have an auction` : "This auction isn't visible to you yet"}
              description={
                reqRef
                  ? "The renter hasn't started one, or it was cancelled. You can still respond to the requirement from the Open Market."
                  : "Only participants can open an auction. Find the requirement marked “In auction” in the Open Market and ask to join."
              }
              action={
                <UILink href={reqRef ? `/requirements/${live.requirementId}` : "/requirements?view=in_auction"} className="text-sm font-medium text-accent-text hover:underline">
                  {reqRef ? `Open ${reqRef}` : "Open market — in auction"}
                </UILink>
              }
            />
          </Panel>
        </PageBody>
      </div>
    );
  }

  const ref = auctionRef(auction.id);
  const direction = DIRECTION[auction.biddingDirection];
  const when = timing(auction, now);
  const running = isRunning(auction.status);
  const own = detail?.participants[0] ?? null;
  const ownBids = detail && own ? detail.bids.filter((b) => b.participantId === own.id) : [];
  const latestOwn = ownBids[ownBids.length - 1] ?? null;
  const remaining = bidsRemaining(auction, ownBids.length);
  const unit = requirement?.expectedDurationUnit ? formatRateUnit(requirement.expectedDurationUnit) : null;
  const canBid = own?.status === ParticipantStatus.approved && auction.status === AuctionStatus.live && remaining !== 0;
  const quoteHref = live.requirementId ? `/quotations?requirementId=${live.requirementId}&sourceAuctionId=${auction.id}` : null;

  // Kept by hand: its failure is a toast (the button sits in the page header, no banner there). useAction only reports a banner.
  async function join() {
    if (!auction) return;
    setJoining(true);
    try {
      await apiClient.requestToJoinAuction(organizationId, auction.id);
      toast.success({ title: `Asked to join ${ref}`, body: "The owner reviews requests. You're notified when you're approved to bid." });
      reload();
    } catch (err) {
      toast.error({ title: `Couldn't ask to join ${ref}`, body: describeError(err).body });
    } finally {
      setJoining(false);
    }
  }

  const placeBid = bidForm.submit(async (amount) => {
    // Reload either way: someone may have outbid in the meantime — the server re-checks every bid.
    await apiClient.placeBid(organizationId, auction.id, amount).finally(reload);
    toast.success({
      title: `Bid of ${formatMoney(amount)} placed on ${ref}`,
      body: `You're leading.${remaining !== null ? ` ${plural(Math.max(remaining - 1, 0), "bid")} left.` : ""}`,
    });
    bidForm.reset({ amount: "" });
  });

  // ------------------------------------------------------------------ primary
  let primary: ReactNode = null;
  if (!own && running) {
    primary = (
      <Button icon="plus" onClick={() => void join()} busy={joining} busyLabel="Asking…" disabled={offline} title={offline ? OFFLINE_HINT : undefined}>
        Ask to join
      </Button>
    );
  } else if (own?.status === ParticipantStatus.selected && quoteHref && canQuote) {
    primary = offline ? (
      <Button icon="quotation" disabled title={OFFLINE_HINT}>
        Create quotation
      </Button>
    ) : (
      <UILink href={quoteHref} className={LINK_PRIMARY}>
        <Icon name="quotation" size={15} />
        Create quotation
      </UILink>
    );
  }

  const attention: AttentionListItem[] = [];
  if (own?.status === ParticipantStatus.selected) {
    attention.push({
      key: "selected",
      severity: "info",
      title: "You were selected — send your quotation",
      context: canQuote
        ? "Formalize the win: the requirement's dates and rate unit carry over, and the rate starts at your last bid."
        : "Creating quotations needs the Quotations permission.",
      action: quoteHref && canQuote ? { label: "Create quotation", href: quoteHref, disabled: offline } : undefined,
    });
  }
  if (own?.status === ParticipantStatus.approved && auction.status === AuctionStatus.live && latestOwn && !latestOwn.isLeading) {
    attention.push({
      key: "outbid",
      severity: "warning",
      title: "You've been outbid",
      context: `The leading bid is ${leadingAmount !== null ? formatMoney(leadingAmount) : "ahead of yours"}. ${remaining !== null ? `${plural(remaining, "bid")} left.` : ""}`,
      action: canBid ? { label: "Bid again", onClick: () => document.getElementById("bid-amount")?.focus() } : undefined,
    });
  }

  const figures: KeyFigure[] = [
    {
      key: "leading",
      label: auction.status === AuctionStatus.closed ? "Winning bid" : "Leading bid",
      value: leadingAmount !== null ? formatMoney(leadingAmount) : "—",
      unit: unit ?? undefined,
      context: detail ? "Bidder identity withheld" : "Visible once you're a participant",
    },
    {
      key: "yours",
      label: "Your latest bid",
      value: latestOwn ? formatMoney(latestOwn.amount) : "—",
      context: !detail
        ? "Ask to join to bid"
        : latestOwn
          ? latestOwn.isLeading
            ? "You're leading"
            : leadingAmount !== null
              ? `${formatMoney(Math.abs(latestOwn.amount - leadingAmount))} ${auction.biddingDirection === BiddingDirection.descending ? "above" : "below"} the leading bid`
              : "Not leading"
          : "No bid placed yet",
      tone: latestOwn && !latestOwn.isLeading ? "warning" : latestOwn ? "success" : undefined,
    },
    { key: "base", label: "Base price", value: formatMoney(auction.basePrice), context: `${direction.rule} · bids go ${direction.better}` },
    {
      key: "left",
      label: "Bids left",
      value: remaining === null ? "No limit" : remaining,
      context: auction.maxBidsPerParticipant ? `of ${auction.maxBidsPerParticipant} per company` : "No limit per company",
      tone: remaining === 0 ? "muted" : undefined,
    },
    {
      key: "time",
      label: auction.status === AuctionStatus.scheduled ? "Opens in" : auction.status === AuctionStatus.live ? "Closes in" : "Ended",
      value: running ? formatCountdown(auction.status === AuctionStatus.scheduled ? auction.startsAt : auction.endsAt, now) : formatDateTime(auction.updatedAt),
      context: `${formatDateTime(auction.startsAt)} → ${formatDateTime(auction.endsAt)}`,
      tone: auction.status === AuctionStatus.live ? "warning" : undefined,
    },
  ];

  const statusCard: ReactNode = !own ? (
    running ? (
      <Panel title="You're not part of this auction yet" padding="md">
        <p className="m-0 text-sm leading-[1.5] text-ink-body">
          Ask to join, and the owner approves who bids. Until then you don&apos;t see the leading bid.
        </p>
        <Button className="mt-3" variant="secondary" icon="plus" onClick={() => void join()} busy={joining} busyLabel="Asking…" disabled={offline}>
          Ask to join
        </Button>
      </Panel>
    ) : (
      <Panel title="This auction has ended" padding="md">
        <p className="m-0 text-sm text-ink-body">You didn&apos;t take part in it.</p>
      </Panel>
    )
  ) : own.status === ParticipantStatus.pending ? (
    <Alert tone="info" icon="clock" title="Waiting for the owner to approve you">
      You&apos;re notified once you&apos;re approved{auction.status === AuctionStatus.scheduled ? ", and bidding opens at the start time" : ""}.
    </Alert>
  ) : own.status === ParticipantStatus.rejected ? (
    <Alert tone="neutral" title="The owner didn't approve your request">
      You can&apos;t bid in this auction.
    </Alert>
  ) : own.status === ParticipantStatus.selected ? (
    <Alert tone="success" title="The owner selected you">
      Create your commercial quotation to move forward. It follows the same accept-and-award steps as any quotation.
    </Alert>
  ) : auction.status === AuctionStatus.closed ? (
    <Alert tone="neutral" title="Bidding has ended">
      The owner picks who to proceed with — the {direction.best.toLowerCase()} doesn&apos;t win automatically. You&apos;re notified if they
      select you.
    </Alert>
  ) : auction.status === AuctionStatus.cancelled ? (
    <Alert tone="neutral" title="The owner cancelled this auction">
      No result was recorded.
    </Alert>
  ) : (
    <Panel title="Place a bid" subtitle="bids are final once placed" padding="md">
      <form noValidate onSubmit={placeBid} className="flex flex-col gap-3">
        {bidForm.banner && (
          <FormBanner tone="error" title="Your bid wasn't placed">
            {bidForm.banner.body}
          </FormBanner>
        )}
        <div className="flex flex-wrap items-start gap-3">
          <Input
            id="bid-amount"
            label="Your bid"
            required
            prefix="₹"
            suffix={unit ?? undefined}
            mono
            inputMode="decimal"
            className="w-[260px] max-[760px]:w-full"
            {...bidForm.field("amount")}
            hint={bidRuleText(auction, leadingAmount)}
            disabled={!canBid}
          />
          <Button
            type="submit"
            className="mt-[19px]"
            busy={bidForm.busy}
            busyLabel="Placing…"
            disabled={!canBid || offline}
            title={
              offline
                ? OFFLINE_HINT
                : auction.status === AuctionStatus.scheduled
                  ? "Bidding opens at the start time."
                  : remaining === 0
                    ? "You've used every bid you're allowed."
                    : undefined
            }
          >
            Place bid
          </Button>
        </div>
        <span className="text-xs text-meta">
          {auction.status === AuctionStatus.scheduled
            ? `Bidding opens ${formatDateTime(auction.startsAt)}.`
            : remaining === null
              ? "No limit on how many bids you place."
              : remaining === 0
                ? "You've used all your bids."
                : `${remaining} of ${auction.maxBidsPerParticipant} bids left.`}
        </span>
      </form>
    </Panel>
  );

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        breadcrumbs={[
          { label: "Auctions", href: backHref },
          { label: ref, mono: true },
        ]}
        title={ref}
        titleMono
        meta={
          <>
            <Status domain="auction" value={auction.status} />
            {own && (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[11px] leading-none text-meta-light">You</span>
                <Status domain="participant" value={own.status} size="sm" />
              </span>
            )}
            <span className={cx("font-mono text-xs", when.tone === "live" ? "font-semibold text-attention" : "text-meta")}>{when.label}</span>
          </>
        }
        description={
          <span className="text-base font-medium leading-[1.3] text-ink-strong">
            {stat?.equipment ?? "Requirement"}
            {requirement?.projectLocation && <span className="font-normal text-meta"> · {requirement.projectLocation}</span>}
          </span>
        }
        actions={primary}
      >
        <DescriptionList
          layout="inline"
          items={[
            {
              label: "Requirement",
              value: reqRef ? (
                <UILink href={`/requirements/${live.requirementId}`} className="font-mono text-accent-text hover:underline">
                  {reqRef}
                </UILink>
              ) : null,
            },
            { label: "Owner", value: stat?.ownerName, emptyText: canQuote ? "Not found" : "Name needs the Quotations permission" },
            { label: "Bidding", value: direction.rule },
          ]}
        />
      </PageHeader>

      <PageBody>
        <AttentionList items={attention} note="Worked out from the auction as it loaded; it refreshes while live." />
        <KeyFigures items={figures} />

        <div className="flex flex-wrap items-start gap-3.5">
          <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-3.5">
            {statusCard}
            {detail && (
              <Panel title="Bid history" count={detail.bids.length} subtitle="your bids in full; other companies stay anonymous" padding="none">
                {detail.bids.length === 0 ? (
                  <EmptyState title="No bids yet" description={auction.status === AuctionStatus.live ? "Be the first to bid." : "No bids were placed."} />
                ) : (
                  <Table bare minWidth={520} caption={`Bid history for ${ref}`}>
                    <Thead>
                      <Tr>
                        <Th className="w-[50px]">#</Th>
                        <Th>Bidder</Th>
                        <Th align="right" className="w-[140px]">
                          Amount
                        </Th>
                        <Th className="w-[170px]">Placed</Th>
                        <Th className="w-[110px]">
                          <span className="sr-only">Standing</span>
                        </Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {detail.bids.map((bid, index) => {
                        const tag = bidTag(bid, own?.id, detail.bids);
                        const mine = bid.participantId === own?.id;
                        return (
                          <Tr key={bid.id} className={mine ? undefined : "bg-surface-sunk"}>
                            <Td className="font-mono text-xs text-meta">{index + 1}</Td>
                            <Td className={mine ? "font-medium" : "text-ink-muted"}>{mine ? "You" : "Another company"}</Td>
                            <Td align="right" className="font-mono text-xs font-semibold">
                              {formatMoney(bid.amount)}
                            </Td>
                            <Td className="font-mono text-xs">{formatDateTime(bid.createdAt)}</Td>
                            <Td>
                              {tag && (
                                <Badge variant="label" tone={tag === "Leading" ? "success" : tag === "Outbid" ? "warning" : "neutral"} title="Worked out from the bids">
                                  {tag}
                                </Badge>
                              )}
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                )}
              </Panel>
            )}
          </div>

          <aside aria-label="Auction terms" className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5 min-[1180px]:max-w-[380px]">
            <Panel title="Auction terms" padding="md">
              <DescriptionList
                layout="rows"
                items={[
                  { label: "Bidding", value: `${direction.label} — ${direction.rule.toLowerCase()}` },
                  { label: "Base price", value: formatMoney(auction.basePrice), mono: true },
                  { label: "Bid limit", value: auction.maxBidsPerParticipant ? `${auction.maxBidsPerParticipant} per company` : "No limit" },
                  { label: "Opens", value: formatDateTime(auction.startsAt), mono: true },
                  { label: "Closes", value: formatDateTime(auction.endsAt), mono: true },
                  { label: "Project", value: requirement?.projectName },
                  { label: "Site", value: requirement?.projectLocation },
                  { label: "Status", value: statusLabel("auction", auction.status) },
                ]}
              />
            </Panel>
            <Alert tone="neutral" icon="info" title={`The ${direction.best.toLowerCase()} doesn't win automatically`}>
              When the clock stops, the owner reviews the approved participants and selects one. That company then sends a formal quotation.
            </Alert>
            <Panel title="Activity" subtitle="from your notifications" padding="md">
              {!stat || stat.activity.length === 0 ? (
                <p className="m-0 text-xs text-ink-soft">No notifications about this auction yet.</p>
              ) : (
                <ol className="m-0 flex list-none flex-col gap-3 p-0">
                  {stat.activity.map((item) => (
                    <li key={item.id} className="flex flex-col gap-0.5">
                      <span className="text-xs text-ink-strong">{item.text}</span>
                      <span className="text-[11px] text-meta-light">{item.when}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </aside>
        </div>
      </PageBody>
    </div>
  );
}
