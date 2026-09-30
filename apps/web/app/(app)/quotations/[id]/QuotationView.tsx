"use client";

import {
  AlternateDateStatus,
  CommercialQuotationStatus,
  QuotationOfferStatus,
  type CommercialQuotation,
  type QuotationOffer,
} from "@fleetip/contracts/quotation";
import type { WorkOrder } from "@fleetip/contracts/work-order";
import {
  AttentionList,
  Badge,
  Button,
  DescriptionList,
  EmptyState,
  FormBanner,
  Icon,
  KeyFigures,
  Menu,
  PageBody,
  PageHeader,
  Panel,
  UILink,
  cx,
  type AttentionListItem,
  type DescriptionItem,
  type KeyFigure,
  type MenuItem,
} from "@fleetip/ui";
import { useRef, useState, type ReactNode } from "react";
import { apiClient } from "../../../../lib/api-client";
import { useConnection } from "../../../../lib/connection";
import { OFFLINE_HINT } from "../../../../lib/errors";
import {
  daysBetween,
  formatDate,
  formatDateRange,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatRate,
  formatRateUnit,
  plural,
  rentalRef,
} from "../../../../lib/format";
import { useListBackHref } from "../../../../lib/list-state";
import { useSession } from "../../../../lib/session-context";
import { Status, statusLabel } from "../../../../lib/status";
import { optional } from "../../../../lib/use-load";
import { auctionRef } from "../../auctions/shared";
import { useSticky } from "../../requirements/list-kit";
import { durationLabel, requirementRef } from "../../requirements/shared";
import { EditQuotationTermsDialog } from "../EditQuotationTermsDialog";
import {
  OPERATOR_LABEL,
  RESPONSIBLE_PARTY_LABEL,
  acceptanceLabel,
  canEditTerms,
  contractValue,
  isNegotiable,
  needsRenterAcceptance,
  quotationValidity,
  rateDelta,
} from "../shared";
import type { QuotationDetailData } from "./data";
import { ActionConfirm, CounterOfferDialog, ProposeDatesDialog, ProposedDates, type CounterRange } from "./dialogs";
import { ScopeItemsCard } from "./ScopeItemsCard";

const LINK_PRIMARY =
  "inline-flex h-[34px] items-center gap-[7px] rounded-control bg-accent px-[14px] text-sm font-semibold text-white no-underline hover:bg-accent-press";
const REF_LINK = "font-mono text-xs font-medium text-accent-text no-underline hover:text-accent-text-hover hover:underline";

type DialogState =
  | { kind: "send" }
  | { kind: "withdraw" }
  | { kind: "award" }
  | { kind: "accept" }
  | { kind: "reject" }
  | { kind: "acceptOffer"; offer: QuotationOffer }
  | { kind: "dates"; decision: typeof AlternateDateStatus.accepted | typeof AlternateDateStatus.rejected }
  | { kind: "counter" }
  | { kind: "propose" }
  | { kind: "edit" };

export function QuotationView({
  data,
  organizationId,
  reload,
  patch,
}: {
  data: QuotationDetailData;
  organizationId: string;
  reload: () => Promise<void>;
  patch: (update: (data: QuotationDetailData) => QuotationDetailData) => void;
}) {
  const { online } = useConnection();
  const { hasPermission } = useSession();
  const backHref = useListBackHref("quotations", "/quotations");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const offersRef = useRef<HTMLDivElement>(null);
  const datesRef = useRef<HTMLDivElement>(null);

  const q = data.quotation;
  const { offers, viewer } = data;
  const isCompany = viewer === "rental_company";
  const isOwner = q.rentalCompanyOrganizationId === organizationId;
  const ref = q.referenceNumber;
  const offline = !online;
  const negotiable = isNegotiable(q.status);
  const editable = canEditTerms(q.status);
  const external = !q.renterOrganizationId;
  const canAward = hasPermission("rental.manage");
  const canWorkOrders = hasPermission("rental.manage") || hasPermission("rental.respond");

  // Names: the Rental Company sees its customer; the Renter sees the company.
  const counterparty = data.counterpartyName ?? (isCompany ? "The customer" : "The rental company");
  const assetCode = q.machineAssetCode ?? data.machine?.assetCode ?? null;
  const machineName = q.productName ?? (data.product ? `${data.product.manufacturer} ${data.product.name}` : null);
  const machineLabel = assetCode ?? machineName ?? "the machine";

  // There is at most one pending offer at a time — a new one supersedes
  // whichever was pending before, from either party (offerRepository.
  // supersedePending). quotation.rate only reflects an *accepted* offer, so
  // while one is still pending it's stale — the pending offer's own rate is
  // the number actually on the table right now.
  const pendingOffer = offers.find((o) => o.status === QuotationOfferStatus.pending) ?? null;
  // An accepted counter-offer is the agreed rate; the API refuses further counters.
  const agreedOffer = offers.find((o) => o.status === QuotationOfferStatus.accepted) ?? null;
  const pendingFromCounterparty = pendingOffer !== null && pendingOffer.offeredByOrganizationId !== organizationId;
  const pendingFromMe = pendingOffer !== null && pendingOffer.offeredByOrganizationId === organizationId;
  const decisionRate = pendingFromCounterparty && pendingOffer ? pendingOffer.rate : q.rate;
  const decisionUnit = pendingFromCounterparty && pendingOffer ? pendingOffer.rateUnit : q.rateUnit;
  // Counters converge (the API enforces it): above the Renter's latest
  // counter, below the Rental Company's current ask, in the unit offered.
  const counterRange = ((): CounterRange => {
    const inUnit = offers.filter((o) => o.rateUnit === decisionUnit);
    const lastCompany = inUnit.filter((o) => o.offeredByOrganizationId === q.rentalCompanyOrganizationId).at(-1);
    const lastRenter = inUnit.filter((o) => o.offeredByOrganizationId !== q.rentalCompanyOrganizationId).at(-1);
    const ask = lastCompany?.rate ?? (q.rateUnit === decisionUnit ? q.rate : null);
    return {
      unit: decisionUnit,
      min: lastRenter ? { rate: lastRenter.rate, label: isOwner ? "the customer's counter" : "your last counter" } : null,
      max: ask != null ? { rate: ask, label: isOwner ? "your current rate" : "the current rate" } : null,
    };
  })();

  const needsAcceptance = needsRenterAcceptance(q);
  const canAccept = !isOwner && viewer === "renter" && negotiable && needsAcceptance && !pendingFromMe;
  const datesPending = q.alternateDateStatus === AlternateDateStatus.pending;
  const validity = quotationValidity(q, data.today);
  const acceptance = acceptanceLabel(q, viewer);
  const workOrder = data.workOrder;

  // ------------------------------------------------------------------ reasons actions can't run
  const lockedTerms = `Terms are final once a quotation is ${statusLabel("quotation", q.status)}.`;
  const awardBlocker = !isOwner
    ? null
    : !negotiable
      ? q.status === CommercialQuotationStatus.draft
        ? "Send it first — only a sent quotation can be awarded."
        : lockedTerms
      : needsAcceptance
        ? `Waiting for ${counterparty} to accept. Award needs their acceptance.`
        : !canAward
          ? "Awarding creates a rental, which needs the Rentals permission."
          : null;
  const counterBlocker = !negotiable
    ? q.status === CommercialQuotationStatus.draft
      ? "Send it first — counter-offers need a sent quotation."
      : lockedTerms
    : external
      ? "The customer isn't on FleetIP, so there's no one to answer a counter-offer."
      : !isOwner && q.renterAcceptedAt
        ? `You've accepted these terms. Ask ${counterparty} if something needs to change.`
        : agreedOffer
          ? `${formatRate(agreedOffer.rate, agreedOffer.rateUnit)} is already agreed, so it can't be countered.`
          : null;
  const proposeBlocker = !negotiable
    ? q.status === CommercialQuotationStatus.draft
      ? "Send it first — new dates can be proposed on a sent quotation."
      : lockedTerms
    : external
      ? "The customer isn't on FleetIP, so there's no one to accept new dates."
      : datesPending
        ? `New dates are already waiting for ${counterparty}'s answer.`
        : null;
  const withdrawBlocker =
    q.status === CommercialQuotationStatus.draft || q.status === CommercialQuotationStatus.sent
      ? null
      : q.status === CommercialQuotationStatus.negotiating
        ? "A quotation under negotiation can't be withdrawn. The customer can reject it, or it lapses after its validity date."
        : lockedTerms;
  const rejectBlocker = !negotiable ? lockedTerms : q.renterAcceptedAt ? `You've accepted these terms. Ask ${counterparty} if something needs to change.` : null;

  // ------------------------------------------------------------------ primary + menu
  let primary: ReactNode = null;
  const workOrderLink = workOrder ? (
    <UILink href={`/work-orders/${workOrder.id}`} className={LINK_PRIMARY}>
      <Icon name="work_order" size={15} />
      Open work order
    </UILink>
  ) : null;
  if (isOwner) {
    if (q.status === CommercialQuotationStatus.draft) {
      primary = (
        <Button icon="export" onClick={() => setDialog({ kind: "send" })} disabled={offline} title={offline ? OFFLINE_HINT : undefined}>
          Send to customer
        </Button>
      );
    } else if (negotiable && pendingFromCounterparty && pendingOffer) {
      primary = (
        <Button icon="check" onClick={() => setDialog({ kind: "acceptOffer", offer: pendingOffer })} disabled={offline} title={offline ? OFFLINE_HINT : undefined}>
          Accept counter-offer
        </Button>
      );
    } else if (negotiable && !awardBlocker) {
      primary = (
        <Button icon="check" onClick={() => setDialog({ kind: "award" })} disabled={offline} title={offline ? OFFLINE_HINT : undefined}>
          Award
        </Button>
      );
    } else if (q.status === CommercialQuotationStatus.awarded) {
      primary = workOrderLink;
    }
  } else {
    if (canAccept) {
      primary = (
        <Button icon="check" onClick={() => setDialog({ kind: "accept" })} disabled={offline} title={offline ? OFFLINE_HINT : undefined}>
          Accept quotation
        </Button>
      );
    } else if (q.status === CommercialQuotationStatus.awarded) {
      primary = workOrderLink;
    }
  }

  const menuItems: MenuItem[] = [];
  // Terms are edited only while drafting; once sent they change only through
  // offers and the alternate-dates flow, so the item is hidden, not disabled.
  if (isOwner) {
    if (editable) {
      menuItems.push({
        key: "edit",
        label: "Edit terms",
        icon: "edit",
        disabled: offline,
        hint: offline ? OFFLINE_HINT : "Charges and operating terms.",
        onSelect: () => setDialog({ kind: "edit" }),
      });
    }
    menuItems.push({
      key: "counter",
      label: "Make counter-offer",
      icon: "quotation",
      disabled: Boolean(counterBlocker) || offline,
      hint: offline ? OFFLINE_HINT : (counterBlocker ?? "A new rate for the customer to accept or counter."),
      onSelect: () => setDialog({ kind: "counter" }),
    });
    menuItems.push({
      key: "propose",
      label: "Propose new dates",
      icon: "calendar_check",
      disabled: Boolean(proposeBlocker) || offline,
      hint: offline ? OFFLINE_HINT : (proposeBlocker ?? "The dates change only if the customer accepts."),
      onSelect: () => setDialog({ kind: "propose" }),
    });
    // Award sits in the menu unless it's the primary button; once awarded there's nothing to offer.
    const awardIsPrimary = negotiable && !awardBlocker && !pendingFromCounterparty;
    if (!awardIsPrimary && q.status !== CommercialQuotationStatus.awarded) {
      menuItems.push({
        key: "award",
        label: "Award",
        icon: "check",
        disabled: Boolean(awardBlocker) || offline,
        hint: offline ? OFFLINE_HINT : (awardBlocker ?? "Creates the rental and the work order."),
        onSelect: () => setDialog({ kind: "award" }),
      });
    }
    menuItems.push({
      key: "withdraw",
      label: "Withdraw quotation",
      icon: "close",
      danger: true,
      separatorBefore: true,
      disabled: Boolean(withdrawBlocker) || offline,
      hint: offline ? OFFLINE_HINT : (withdrawBlocker ?? "Pulls it back before the customer answers. Final."),
      onSelect: () => setDialog({ kind: "withdraw" }),
    });
  } else {
    if (negotiable && needsAcceptance && pendingFromMe && pendingOffer) {
      menuItems.push({
        key: "accept",
        label: "Accept quotation",
        icon: "check",
        disabled: true,
        hint: `Your counter-offer of ${formatRate(pendingOffer.rate, pendingOffer.rateUnit)} is waiting for ${counterparty}'s answer.`,
      });
    }
    menuItems.push({
      key: "counter",
      label: "Make counter-offer",
      icon: "quotation",
      disabled: Boolean(counterBlocker) || offline,
      hint: offline ? OFFLINE_HINT : (counterBlocker ?? `A new rate for ${counterparty} to accept or counter.`),
      onSelect: () => setDialog({ kind: "counter" }),
    });
    menuItems.push({
      key: "reject",
      label: "Reject quotation",
      icon: "close",
      danger: true,
      separatorBefore: true,
      disabled: Boolean(rejectBlocker) || offline,
      hint: offline ? OFFLINE_HINT : (rejectBlocker ?? `Final. ${counterparty} is told and would need to send a new one.`),
      onSelect: () => setDialog({ kind: "reject" }),
    });
  }
  if (workOrder) {
    menuItems.push({
      key: "print",
      label: "Print work order",
      icon: "export",
      separatorBefore: true,
      hint: `${workOrder.referenceNumber} as a printable page, in a new tab. FleetIP has no PDF of the quotation itself.`,
      onSelect: () => window.open(apiClient.workOrderPrintUrl(organizationId, workOrder.id), "_blank", "noopener"),
    });
  }
  if (q.requirementId) {
    menuItems.push({
      key: "requirement",
      label: `Open ${requirementRef(q.requirementId)}`,
      icon: "requirement",
      separatorBefore: !workOrder,
      href: `/requirements/${q.requirementId}`,
      hint: "The requirement this quotation answers.",
    });
  }

  // ------------------------------------------------------------------ attention
  const scrollTo = (target: { current: HTMLDivElement | null }) => target.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const attention: AttentionListItem[] = [];
  if (negotiable && pendingFromCounterparty && pendingOffer) {
    attention.push({
      key: "offer",
      severity: "warning",
      title: `${counterparty} countered at ${formatRate(pendingOffer.rate, pendingOffer.rateUnit)}`,
      context: `Sent ${formatDateTime(pendingOffer.createdAt)}. The quotation keeps ${formatRate(q.rate, q.rateUnit)} until someone accepts an offer.`,
      action: { label: "Review offer", onClick: () => scrollTo(offersRef) },
    });
  }
  if (isOwner && negotiable && q.renterAcceptedAt) {
    attention.push({
      key: "ready",
      severity: "info",
      title: `Accepted by ${counterparty} — ready to award`,
      context: `Accepted ${formatDateTime(q.renterAcceptedAt)}. Awarding books ${machineLabel} and creates the rental and work order.`,
      action: awardBlocker ? undefined : { label: "Award", onClick: () => setDialog({ kind: "award" }), disabled: offline },
    });
  }
  if (canAccept && !pendingFromCounterparty) {
    attention.push({
      key: "answer",
      severity: "warning",
      title: `${counterparty} is waiting for your answer`,
      context: "Accept these terms, send a counter-offer, or reject the quotation.",
      action: { label: "Accept quotation", onClick: () => setDialog({ kind: "accept" }), disabled: offline },
    });
  }
  if (!isOwner && datesPending && q.proposedAlternateStartDate) {
    attention.push({
      key: "dates",
      severity: "warning",
      title: `${counterparty} proposed new dates: ${formatDateRange(q.proposedAlternateStartDate, q.proposedAlternateEndDate)}`,
      context: q.alternateDateReason ?? "No reason given. The dates change only if you accept.",
      action: { label: "Review dates", onClick: () => scrollTo(datesRef) },
    });
  }
  // For the Renter, a lapse only matters until they've accepted — then awarding is the rental company's move.
  if (negotiable && validity && validity.days >= 0 && validity.days <= 3 && (isOwner || !q.renterAcceptedAt)) {
    attention.push({
      key: "lapse",
      severity: "warning",
      title: validity.days === 0 ? "Lapses after today" : `Lapses in ${plural(validity.days, "day")}, on ${formatDate(q.validityDate)}`,
      context: isOwner
        ? "If it isn't awarded by then it expires. The validity date can't be changed after creation."
        : "After its validity date it expires and can no longer be accepted.",
    });
  }

  // ------------------------------------------------------------------ figures
  const delta = rateDelta(q, offers);
  const value = contractValue(q);
  const days = q.endDate ? daysBetween(q.startDate, q.endDate) : null;
  const figures: KeyFigure[] = [
    {
      key: "rate",
      label: pendingOffer ? "Current rate" : "Rate",
      value: formatMoney(q.rate),
      unit: formatRateUnit(q.rateUnit),
      context: pendingOffer
        ? `${pendingFromMe ? "Your" : `${counterparty}'s`} offer of ${formatRate(pendingOffer.rate, pendingOffer.rateUnit)} is pending`
        : delta === null
          ? "No counter-offers yet"
          : delta === 0
            ? "Same as the opening offer"
            : `${formatMoney(Math.abs(delta))} ${delta < 0 ? "below" : "above"} the opening offer`,
    },
    {
      key: "value",
      label: "Estimated value",
      value: value !== null ? formatMoney(value) : "—",
      context:
        value !== null && days !== null
          ? `Estimate: rate × ${plural(days, "day")} from start to end, before charges`
          : !q.endDate
            ? "Open-ended, so there's no estimate"
            : "No day-equivalent for a per-shift rate",
    },
    {
      key: "period",
      label: "Rental period",
      value: q.endDate ? formatDateRange(q.startDate, q.endDate) : `From ${formatDate(q.startDate)}`,
      context: q.endDate ? plural(days ?? 0, "day") : "Open-ended",
    },
    {
      key: "validity",
      label: "Valid until",
      value: formatDate(q.validityDate),
      context: validity ? validity.label : q.status === CommercialQuotationStatus.awarded ? "Awarded — no longer applies" : `No longer applies (${statusLabel("quotation", q.status)})`,
      tone: validity?.tone,
    },
  ];

  // ------------------------------------------------------------------ terms, in contract order
  const party: DescriptionItem = isCompany
    ? {
        label: "Customer",
        value: q.clientSnapshot
          ? `${q.clientSnapshot.name} — not on FleetIP`
          : (data.counterpartyName ?? (q.renterOrganizationId ? "FleetIP customer" : null)),
      }
    : { label: "Rental company", value: data.counterpartyName };
  const origin: ReactNode = q.sourceAuctionId ? (
    <UILink href={`/auctions?auctionId=${q.sourceAuctionId}`} className={REF_LINK}>
      Auction {auctionRef(q.sourceAuctionId)}
    </UILink>
  ) : q.requirementId ? (
    <UILink href={`/requirements/${q.requirementId}`} className={REF_LINK}>
      {requirementRef(q.requirementId)}
    </UILink>
  ) : (
    "Direct — no requirement"
  );
  const groups: { title: string; items: DescriptionItem[] }[] = [
    {
      title: "Machine and dates",
      items: [
        { label: "Machine", value: machineName },
        { label: "Asset code", value: assetCode, mono: true },
        ...(isCompany ? [{ label: "Registration", value: data.machine?.registrationNumber, mono: true }] : []),
        party,
        { label: "Start date", value: formatDate(q.startDate), mono: true },
        { label: "End date", value: q.endDate ? formatDate(q.endDate) : "Open-ended", mono: true },
        { label: "Valid until", value: formatDate(q.validityDate), mono: true },
        { label: "Answers", value: origin },
      ],
    },
    {
      title: "Commercial terms",
      items: [
        { label: "Rate", value: formatRate(q.rate, q.rateUnit), mono: true },
        { label: "Mobilization charge", value: q.mobilizationCharge != null ? formatMoney(q.mobilizationCharge) : null, mono: true },
        { label: "Demobilization charge", value: q.demobilizationCharge != null ? formatMoney(q.demobilizationCharge) : null, mono: true },
        { label: "Overtime rate", value: q.overtimeRate != null ? `${formatMoney(q.overtimeRate)} per h` : null, mono: true },
        { label: "Minimum rental period", value: durationLabel(q.minimumRentalPeriodValue, q.minimumRentalPeriodUnit) },
        { label: "Notice period", value: q.noticePeriodDays != null ? `${formatNumber(q.noticePeriodDays, 0)} days` : null, mono: true },
        { label: "GST terms", value: q.gstTerms },
        { label: "Payment terms", value: q.paymentTerms, wide: true },
      ],
    },
    {
      title: "Operating terms",
      items: [
        { label: "Operator", value: q.operatorScope ? OPERATOR_LABEL[q.operatorScope] : null },
        { label: "Working hours", value: q.workingHours != null ? `${formatNumber(q.workingHours)} h per shift` : null, mono: true },
        { label: "Working days", value: q.workingDaysPerWeek != null ? `${q.workingDaysPerWeek} per week` : null, mono: true },
        { label: "Shift structure", value: q.shiftStructure },
        { label: "Sunday condition", value: q.sundayCondition },
        { label: "Fuel", value: q.fuelScope ? RESPONSIBLE_PARTY_LABEL[q.fuelScope] : null },
        { label: "Fuel norms", value: q.fuelNorms },
        { label: "Accommodation", value: q.accommodationScope ? RESPONSIBLE_PARTY_LABEL[q.accommodationScope] : null },
        { label: "Dehire terms", value: q.dehireTerms },
      ],
    },
    {
      title: "Conditions",
      items: [
        { label: "Special and site conditions", value: q.commercialNotes, wide: true },
        { label: "Company terms and conditions", value: q.companyTerms, wide: true },
      ],
    },
  ];

  const lockedScopeReason = editable ? null : lockedTerms;

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        breadcrumbs={[
          { label: "Quotations", href: backHref },
          { label: ref, mono: true },
        ]}
        note="Filters on the quotations list are kept when you go back"
        title={ref}
        titleMono
        meta={
          <>
            <Status domain="quotation" value={q.status} />
            {acceptance && (
              <Badge variant="label" tone={acceptance.tone} title={acceptance.title}>
                {acceptance.text}
              </Badge>
            )}
            {datesPending && <Status domain="alternate_dates" value={AlternateDateStatus.pending} size="sm" />}
          </>
        }
        description={
          <span className="text-base font-medium leading-[1.3] text-ink-strong">
            {machineName ?? "Machine"}
            {assetCode && <span className="font-mono font-normal text-meta"> · {assetCode}</span>}
            <span className="font-normal text-meta">
              {" "}
              · {isCompany ? "for" : "from"} {counterparty}
            </span>
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
            { label: "Rate", value: formatRate(q.rate, q.rateUnit), mono: true },
            { label: "Dates", value: formatDateRange(q.startDate, q.endDate), mono: true },
            ...(data.requirement ? [{ label: "Requirement", value: data.requirementEquipment ?? requirementRef(data.requirement.id) }] : []),
            ...(workOrder ? [{ label: "Work order", value: <WorkOrderLinks workOrder={workOrder} />, mono: true }] : []),
            ...(q.status === CommercialQuotationStatus.awarded && !workOrder
              ? [{ label: "Work order", value: canWorkOrders ? "Not found" : "Needs the Rentals permission" }]
              : []),
          ]}
        />
      </PageHeader>

      <PageBody>
        <AttentionList items={attention} note="Worked out when this page opened. FleetIP doesn't send reminders for these." />
        <KeyFigures items={figures} />

        <div className="flex flex-wrap items-start gap-3.5">
          <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-3.5">
            <Panel title="Terms" subtitle={`as recorded on ${ref}`} padding="md">
              <div className="flex flex-col gap-4">
                {groups.map((group) => (
                  <div key={group.title}>
                    <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.1em] text-meta">{group.title}</span>
                    <DescriptionList layout="grid" items={group.items} />
                  </div>
                ))}
                <span className="flex items-center gap-1.5 text-[11px] leading-[1.4] text-meta">
                  <Icon name="lock" size={12} className="text-meta-light" />
                  {editable
                    ? "Rate changes by counter-offer and dates by a date proposal; other terms can be edited until it's awarded."
                    : lockedTerms}
                </span>
              </div>
            </Panel>

            <ScopeItemsCard
              organizationId={organizationId}
              quotationId={q.id}
              reference={ref}
              items={data.scopeItems}
              canEdit={isOwner && editable}
              lockedReason={lockedScopeReason}
              onChange={(update) => patch((d) => ({ ...d, scopeItems: update(d.scopeItems ?? []) }))}
            />
          </div>

          <aside aria-label="Negotiation" className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5 min-[1180px]:max-w-[400px]">
            <div ref={offersRef} className="scroll-mt-4">
              <Panel
                title="Negotiation"
                count={offers.length}
                subtitle="counter-offers, oldest first"
                padding="none"
                actions={
                  !counterBlocker ? (
                    <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "counter" })} disabled={offline}>
                      Counter
                    </Button>
                  ) : undefined
                }
              >
                <OfferTrail
                  offers={offers}
                  organizationId={organizationId}
                  counterparty={counterparty}
                  negotiable={negotiable}
                  offline={offline}
                  draft={q.status === CommercialQuotationStatus.draft}
                  onAccept={(offer) => setDialog({ kind: "acceptOffer", offer })}
                />
              </Panel>
            </div>

            <div ref={datesRef} className="scroll-mt-4">
              <Panel title="Dates" subtitle="changed only by agreement" padding="md">
                <div className="flex flex-col gap-3">
                  <DescriptionList
                    layout="rows"
                    items={[
                      { label: "Start", value: formatDate(q.startDate), mono: true },
                      { label: "End", value: q.endDate ? formatDate(q.endDate) : "Open-ended", mono: true },
                    ]}
                  />
                  {datesPending ? (
                    <>
                      <ProposedDates quotation={q} />
                      {!isOwner && viewer === "renter" ? (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="secondary" icon="check" onClick={() => setDialog({ kind: "dates", decision: AlternateDateStatus.accepted })} disabled={offline}>
                            Accept new dates
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "dates", decision: AlternateDateStatus.rejected })} disabled={offline}>
                            Decline
                          </Button>
                        </div>
                      ) : (
                        <p className="m-0 text-xs text-meta">Waiting for {counterparty} to accept or decline.</p>
                      )}
                    </>
                  ) : isOwner && !proposeBlocker ? (
                    <Button size="sm" variant="secondary" icon="calendar_check" onClick={() => setDialog({ kind: "propose" })} disabled={offline} className="self-start">
                      Propose new dates
                    </Button>
                  ) : (
                    <p className="m-0 text-xs leading-[1.5] text-meta">
                      {q.status === CommercialQuotationStatus.draft
                        ? "Dates are set when the quotation is created. After sending, new dates can be proposed if needed."
                        : negotiable
                          ? isOwner
                            ? proposeBlocker
                            : "No new dates proposed."
                          : "The dates are final."}
                    </p>
                  )}
                  <p className="m-0 text-[11px] leading-[1.45] text-meta-light">FleetIP doesn&apos;t keep a history of earlier date proposals.</p>
                </div>
              </Panel>
            </div>

            <p className="m-0 px-1 text-[11px] leading-[1.5] text-meta-light">
              Created {formatDateTime(q.createdAt)} · last changed {formatDateTime(q.updatedAt)}. FleetIP has no PDF or share link for a
              quotation yet{workOrder ? "; the work order can be printed" : ""}.
            </p>
          </aside>
        </div>
      </PageBody>

      <QuotationDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        data={data}
        organizationId={organizationId}
        counterparty={counterparty}
        machineLabel={machineLabel}
        pendingOffer={pendingOffer}
        pendingFromCounterparty={pendingFromCounterparty}
        decisionRate={decisionRate}
        decisionUnit={decisionUnit}
        counterRange={counterRange}
        canWorkOrders={canWorkOrders}
        reload={reload}
        patch={patch}
      />
    </div>
  );
}

function WorkOrderLinks({ workOrder }: { workOrder: WorkOrder }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <UILink href={`/work-orders/${workOrder.id}`} className={REF_LINK}>
        {workOrder.referenceNumber}
      </UILink>
      <span className="text-meta-light">·</span>
      <UILink href={`/rentals/${workOrder.rentalId}`} className={REF_LINK}>
        {rentalRef(workOrder.rentalId)}
      </UILink>
    </span>
  );
}

function OfferTrail({
  offers,
  organizationId,
  counterparty,
  negotiable,
  offline,
  draft,
  onAccept,
}: {
  offers: QuotationOffer[];
  organizationId: string;
  counterparty: string;
  negotiable: boolean;
  offline: boolean;
  draft: boolean;
  onAccept: (offer: QuotationOffer) => void;
}) {
  if (offers.length === 0) {
    return (
      <EmptyState
        title="No counter-offers"
        description={draft ? "Counter-offers start once the quotation is sent." : negotiable ? "Either side can offer a different rate. Dates carry forward unchanged." : "None were made."}
      />
    );
  }
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {offers.map((offer, index) => {
        const mine = offer.offeredByOrganizationId === organizationId;
        const canAcceptThis = negotiable && offer.status === QuotationOfferStatus.pending && !mine;
        return (
          <li key={offer.id} className={cx("flex gap-3 border-b border-border px-4 py-3 last:border-0", offer.status === QuotationOfferStatus.pending && "bg-surface-selected")}>
            <span className="mt-0.5 font-mono text-[11px] text-meta-light">{index + 1}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-ink">{mine ? "You" : counterparty}</span>
                <Status domain="offer" value={offer.status} size="sm" />
                <span className="ml-auto font-mono text-[11px] text-meta-light">{formatDateTime(offer.createdAt)}</span>
              </div>
              <span className="font-mono text-sm font-semibold text-ink">{formatRate(offer.rate, offer.rateUnit)}</span>
              {offer.notes && <span className="text-xs leading-[1.45] text-ink-soft">{offer.notes}</span>}
              {canAcceptThis && (
                <Button size="sm" variant="secondary" icon="check" className="mt-1 self-start" onClick={() => onAccept(offer)} disabled={offline}>
                  Accept offer
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------------ dialogs

function QuotationDialogs({
  dialog,
  onClose,
  data,
  organizationId,
  counterparty,
  machineLabel,
  pendingOffer,
  pendingFromCounterparty,
  decisionRate,
  decisionUnit,
  counterRange,
  canWorkOrders,
  reload,
  patch,
}: {
  dialog: DialogState | null;
  onClose: () => void;
  data: QuotationDetailData;
  organizationId: string;
  counterparty: string;
  machineLabel: string;
  pendingOffer: QuotationOffer | null;
  pendingFromCounterparty: boolean;
  decisionRate: number;
  decisionUnit: CommercialQuotation["rateUnit"];
  counterRange: CounterRange;
  canWorkOrders: boolean;
  reload: () => Promise<void>;
  patch: (update: (data: QuotationDetailData) => QuotationDetailData) => void;
}) {
  const q = data.quotation;
  const ref = q.referenceNumber;
  const external = !q.renterOrganizationId;
  const done = () => void reload();
  const setQuotation = (updated: unknown) => {
    if (updated && typeof updated === "object") patch((d) => ({ ...d, quotation: updated as CommercialQuotation }));
  };
  const scopeCount = data.scopeItems?.length ?? 0;
  const requirementLine = q.requirementId ? requirementRef(q.requirementId) : null;
  // The subject stays rendered while the dialog closes, so focus returns to its opener.
  const offerTarget = useSticky(dialog?.kind === "acceptOffer" ? dialog.offer : null);
  const datesDecision = useSticky(dialog?.kind === "dates" ? dialog.decision : null);

  return (
    <>
      {/* Send: draft → sent (transitionAsRentalCompany notifies a FleetIP renter only). */}
      <ActionConfirm
        open={dialog?.kind === "send"}
        onClose={onClose}
        icon="export"
        tone="info"
        title={`Send quotation ${ref}?`}
        description={`${formatRate(q.rate, q.rateUnit)} · ${formatDateRange(q.startDate, q.endDate)} · ${machineLabel}`}
        consequences={[
          external
            ? "This customer isn't on FleetIP, so nobody is notified — share the terms with them yourself. You can award it once they agree."
            : `${counterparty} is notified and can accept, counter or reject it in FleetIP.`,
          `It can be answered until ${formatDate(q.validityDate)}; after that it lapses.`,
          "You can still edit terms after sending, but an edit clears the customer's acceptance.",
        ]}
        cancelLabel="Not yet"
        confirmLabel="Send quotation"
        busyLabel="Sending…"
        failureTitle={`${ref} wasn't sent`}
        run={() => apiClient.sendQuotation(organizationId, q.id)}
        success={() => ({
          title: `Quotation ${ref} sent`,
          body: external ? "It's marked Sent. Nobody in FleetIP was notified — the customer isn't on it." : `${counterparty} has been notified.`,
        })}
        onDone={done}
      >
        {q.validityDate < data.today && (
          <FormBanner tone="warning" title="Its validity date has passed">
            {formatDate(q.validityDate)} is in the past, so it will lapse as soon as it&apos;s sent. The validity date can&apos;t be
            changed — create a new quotation instead.
          </FormBanner>
        )}
      </ActionConfirm>

      {/* Withdraw: draft/sent → withdrawn. No notification is sent. */}
      <ActionConfirm
        open={dialog?.kind === "withdraw"}
        onClose={onClose}
        icon="close"
        tone="danger"
        title={`Withdraw quotation ${ref}?`}
        description={`${formatRate(q.rate, q.rateUnit)} · ${counterparty}`}
        consequences={[
          q.status === CommercialQuotationStatus.draft
            ? "It's discarded as Withdrawn — the customer never saw it."
            : "The customer can no longer accept it. Its status changes to Withdrawn.",
          ...(q.status === CommercialQuotationStatus.sent && !external ? [`${counterparty} isn't notified — tell them if they were expecting it.`] : []),
          ...(requirementLine ? [`${requirementLine} isn't changed.`] : []),
          "Withdrawing is final. To quote again, create a new quotation.",
        ]}
        cancelLabel="Keep quotation"
        confirmLabel="Withdraw quotation"
        busyLabel="Withdrawing…"
        confirmVariant="danger"
        failureTitle={`${ref} wasn't withdrawn`}
        run={() => apiClient.withdrawQuotation(organizationId, q.id)}
        success={() => ({ title: `Quotation ${ref} withdrawn`, body: "Its status changed to Withdrawn." })}
        onDone={done}
      />

      {/*
        Award (CommercialQuotationService.awardQuotation), in the order the code runs it:
        1. RentalService.createRental — Confirmed, same machine/dates/terms; refused with a
           409 if the machine is booked or in the workshop, before anything else is written.
        2. The requirement is closed if it's still open.
        3. The quotation becomes Awarded.
        4. WorkOrderService.createFromAward issues the work order and copies the scope items.
        5. A FleetIP customer is notified (award + work order).
        Other quotations on the requirement are not touched.
      */}
      <ActionConfirm
        open={dialog?.kind === "award"}
        onClose={onClose}
        icon="check"
        tone="success"
        title={`Award quotation ${ref}?`}
        description={`${counterparty} · ${machineLabel} · ${formatRate(q.rate, q.rateUnit)}`}
        consequences={[
          `Creates a rental for ${machineLabel}, ${formatDateRange(q.startDate, q.endDate)} at ${formatRate(q.rate, q.rateUnit)}. It starts as Confirmed, so the machine is booked for those dates.`,
          `Issues a work order with these terms${scopeCount ? ` and ${plural(scopeCount, "scope item")}` : ""}.`,
          ...(requirementLine
            ? [
                `Closes ${requirementLine} if it's still open, so it leaves the Open Market.`,
                "Your other quotations against that requirement aren't changed — withdraw them yourself if you won't pursue them.",
              ]
            : []),
          ...(pendingOffer ? [`An offer of ${formatRate(pendingOffer.rate, pendingOffer.rateUnit)} is still pending. The award uses the current rate, not that offer.`] : []),
          external ? "The customer isn't on FleetIP, so nobody is notified." : `${counterparty} is notified.`,
          "If the machine is booked or in the workshop over these dates, the award is refused and nothing changes.",
          "An award can't be undone. The rental and work order can be cancelled separately afterwards.",
        ]}
        cancelLabel="Review again"
        confirmLabel="Award"
        busyLabel="Awarding…"
        failureTitle={`${ref} wasn't awarded`}
        run={() => apiClient.awardQuotation(organizationId, q.id)}
        success={async () => {
          const workOrder = await optional(canWorkOrders, async () => (await apiClient.getWorkOrderByQuotationId(organizationId, q.id)) ?? null, null as WorkOrder | null);
          return {
            title: `Quotation ${ref} awarded`,
            body: workOrder
              ? `Rental ${rentalRef(workOrder.rentalId)} and work order ${workOrder.referenceNumber} created. ${machineLabel} is booked from ${formatDate(q.startDate)}.`
              : `The rental and work order were created. ${machineLabel} is booked from ${formatDate(q.startDate)}.`,
          };
        }}
        onDone={done}
      />

      {/*
        Accept (acceptQuotation): applies a pending offer from the rental company first, then
        records renterAcceptedAt. updateTerms and applyAcceptedOffer both clear it again.
      */}
      <ActionConfirm
        open={dialog?.kind === "accept"}
        onClose={onClose}
        icon="check"
        tone="success"
        title={`Accept quotation ${ref}?`}
        description={`${counterparty} · ${machineLabel}`}
        consequences={[
          pendingFromCounterparty
            ? `Accepts ${counterparty}'s latest offer: ${formatRate(decisionRate, decisionUnit)}. It becomes the quotation's rate.`
            : `Accepts the terms as they stand: ${formatRate(q.rate, q.rateUnit)}, ${formatDateRange(q.startDate, q.endDate)}.`,
          `${counterparty} is notified and can then award it — that books the machine and creates the rental.`,
          "Nothing is booked until they award it.",
          "If they edit the terms or a counter-offer is accepted afterwards, your acceptance is cleared and you'd accept again.",
        ]}
        cancelLabel="Not yet"
        confirmLabel="Accept quotation"
        busyLabel="Accepting…"
        failureTitle={`${ref} wasn't accepted`}
        run={() => apiClient.acceptQuotation(organizationId, q.id)}
        success={(result) => {
          setQuotation(result);
          return { title: `Quotation ${ref} accepted`, body: `${counterparty} has been notified and can award it.` };
        }}
        onDone={done}
      />

      <ActionConfirm
        open={dialog?.kind === "reject"}
        onClose={onClose}
        icon="close"
        tone="danger"
        title={`Reject quotation ${ref}?`}
        description={`${counterparty} · ${formatRate(q.rate, q.rateUnit)}`}
        consequences={[
          "Its status changes to Rejected. This is final — it can't be reopened.",
          `${counterparty} is notified and would need to send a new quotation.`,
          ...(requirementLine ? [`${requirementLine} stays as it is — other companies' quotations aren't affected.`] : []),
        ]}
        cancelLabel="Keep quotation"
        confirmLabel="Reject quotation"
        busyLabel="Rejecting…"
        confirmVariant="danger"
        failureTitle={`${ref} wasn't rejected`}
        run={() => apiClient.rejectQuotation(organizationId, q.id)}
        success={() => ({ title: `Quotation ${ref} rejected`, body: `${counterparty} has been notified.` })}
        onDone={done}
      />

      {offerTarget && (
        <ActionConfirm
          key={offerTarget.id}
          open={dialog?.kind === "acceptOffer"}
          onClose={onClose}
          icon="check"
          tone="success"
          title={`Accept ${counterparty}'s offer on ${ref}?`}
          description={`${formatRate(offerTarget.rate, offerTarget.rateUnit)} · made ${formatDateTime(offerTarget.createdAt)}`}
          consequences={[
            `The quotation's rate changes from ${formatRate(q.rate, q.rateUnit)} to ${formatRate(offerTarget.rate, offerTarget.rateUnit)}.`,
            data.viewer === "rental_company"
              ? q.renterAcceptedAt
                ? "The customer's earlier acceptance is cleared — they accept again before you can award."
                : external
                  ? "You can award it once you're ready."
                  : "The customer still accepts the quotation before you can award it."
              : "It doesn't accept the quotation itself — Accept quotation does that (and applies a pending offer too).",
            `${counterparty} is notified.`,
          ]}
          cancelLabel="Not yet"
          confirmLabel="Accept offer"
          busyLabel="Accepting…"
          failureTitle="The offer wasn't accepted"
          run={() => apiClient.acceptOffer(organizationId, q.id, offerTarget.id)}
          success={(result) => {
            setQuotation(result);
            return { title: `Offer accepted on ${ref}`, body: `The rate is now ${formatRate(offerTarget.rate, offerTarget.rateUnit)}.` };
          }}
          onDone={done}
        />
      )}

      {datesDecision && q.proposedAlternateStartDate && (
        <ActionConfirm
          key={datesDecision}
          open={dialog?.kind === "dates"}
          onClose={onClose}
          icon="calendar_check"
          tone={datesDecision === AlternateDateStatus.accepted ? "success" : "neutral"}
          title={datesDecision === AlternateDateStatus.accepted ? `Accept the new dates on ${ref}?` : `Decline the new dates on ${ref}?`}
          description={`Proposed by ${counterparty}${q.alternateDateReason ? `: ${q.alternateDateReason}` : ""}`}
          consequences={
            datesDecision === AlternateDateStatus.accepted
              ? [
                  `The quotation's dates change from ${formatDateRange(q.startDate, q.endDate)} to ${formatDateRange(q.proposedAlternateStartDate, q.proposedAlternateEndDate)}.`,
                  `${counterparty} is notified.`,
                  "Nothing else on the quotation changes.",
                ]
              : [`The dates stay ${formatDateRange(q.startDate, q.endDate)}.`, `${counterparty} is notified and can propose other dates.`]
          }
          cancelLabel="Not yet"
          confirmLabel={datesDecision === AlternateDateStatus.accepted ? "Accept new dates" : "Decline new dates"}
          busyLabel="Saving…"
          failureTitle="Your answer wasn't saved"
          run={() => apiClient.respondToAlternateDates(organizationId, q.id, datesDecision)}
          success={(result) => {
            setQuotation(result);
            return datesDecision === AlternateDateStatus.accepted
              ? { title: `New dates accepted on ${ref}`, body: `${counterparty} has been notified.` }
              : { title: `New dates declined on ${ref}`, body: `The dates stay as they were. ${counterparty} has been notified.` };
          }}
          onDone={done}
        />
      )}

      <CounterOfferDialog
        open={dialog?.kind === "counter"}
        onClose={onClose}
        organizationId={organizationId}
        quotation={q}
        defaultUnit={decisionUnit}
        otherParty={counterparty}
        range={counterRange}
        onDone={done}
      />
      <ProposeDatesDialog open={dialog?.kind === "propose"} onClose={onClose} organizationId={organizationId} quotation={q} customer={counterparty} onDone={done} />
      <EditQuotationTermsDialog
        open={dialog?.kind === "edit" && canEditTerms(q.status)}
        onClose={onClose}
        organizationId={organizationId}
        quotation={q}
        onUpdated={(updated) => patch((d) => ({ ...d, quotation: updated }))}
      />
    </>
  );
}


