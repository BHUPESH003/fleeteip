"use client";

import { QuotationResponseStatus, type QuotationResponse } from "@fleetip/contracts/quotation";
import { RequirementStatus } from "@fleetip/contracts/rfq";
import {
  AttentionList,
  Badge,
  Button,
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
import { useState, type ReactNode } from "react";
import { categoryIcon } from "../../../../lib/category-icon";
import { useConnection } from "../../../../lib/connection";
import { OFFLINE_HINT } from "../../../../lib/errors";
import { formatDate, formatDateTime, formatMoney, formatRate, formatRateUnit, plural } from "../../../../lib/format";
import { useListBackHref } from "../../../../lib/list-state";
import { useSession } from "../../../../lib/session-context";
import { Status } from "../../../../lib/status";
import { DIRECTION, auctionRef, isRunning } from "../../auctions/shared";
import { acceptanceLabel } from "../../quotations/shared";
import { RespondDialog } from "../RespondDialog";
import { durationLabel, equipmentLine, quantityLine, requirementRef, validityInfo } from "../shared";
import type { RentalCompanyDetail } from "./data";
import { ActivityCard, RequirementFacts } from "./parts";

const LINK_PRIMARY =
  "inline-flex h-[34px] items-center gap-[7px] rounded-control bg-accent px-[14px] text-sm font-semibold text-white no-underline hover:bg-accent-press";
const REF_LINK = "font-mono text-xs font-medium text-accent-text no-underline hover:text-accent-text-hover hover:underline";
const UNIT_WORD = { shift: "Shift", day: "Day", week: "Week", month: "Month" } as const;

/**
 * A Rental Company looking at someone else's requirement. Tenant isolation:
 * this view only ever shows the company's own reply and its own
 * quotations — never the Renter's responses table, which names every
 * competitor and their indicative rate.
 */
export function RentalCompanyRequirementView({
  data,
  organizationId,
  onResponseSaved,
}: {
  data: RentalCompanyDetail;
  organizationId: string;
  onResponseSaved: (response: QuotationResponse) => void;
}) {
  const { online } = useConnection();
  const { hasPermission } = useSession();
  const backHref = useListBackHref("requirements", "/requirements");
  const canQuote = hasPermission("quotation.manage");
  const { requirement, entry, myResponse, myQuotations, auction } = data;
  const [respondOpen, setRespondOpen] = useState(false);

  const ref = requirementRef(requirement.id);
  const equipment = equipmentLine(requirement, entry?.subcategory.name);
  const validity = validityInfo(requirement.validityDate, data.today);
  // The API refuses responses and quotations unless the requirement is open;
  // discovery only lists it until its validity date.
  const canRespond = requirement.status === RequirementStatus.open && validity.days >= 0;
  const canCreateQuotation = requirement.status === RequirementStatus.open && canQuote;
  const offline = !online;
  const quotedAlready = (myQuotations ?? []).length > 0;
  const askedForQuotation = Boolean(myResponse?.quotationRequestedAt) && !quotedAlready;
  const quoteHref = `/quotations?requirementId=${requirement.id}`;
  const auctionHref = auction ? `/auctions?requirementId=${requirement.id}&auctionId=${auction.id}` : null;

  // ------------------------------------------------------------------ primary + menu
  let primary: ReactNode = null;
  if (askedForQuotation && canCreateQuotation) {
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
  } else if (canRespond) {
    primary = (
      <Button icon={myResponse ? "edit" : "requirement"} onClick={() => setRespondOpen(true)} disabled={offline} title={offline ? OFFLINE_HINT : undefined}>
        {myResponse ? "Update response" : "Respond"}
      </Button>
    );
  }

  const menuItems: MenuItem[] = [];
  if (askedForQuotation && canCreateQuotation) {
    menuItems.push({
      key: "respond",
      label: myResponse ? "Update response" : "Respond",
      icon: "edit",
      disabled: !canRespond || offline,
      hint: offline ? OFFLINE_HINT : canRespond ? "Change your answer or indicative rate." : "It's no longer taking responses.",
      onSelect: () => setRespondOpen(true),
    });
  } else if (canQuote) {
    menuItems.push({
      key: "quote",
      label: "Create quotation",
      icon: "quotation",
      href: quoteHref,
      disabled: !canCreateQuotation || offline,
      hint: offline
        ? OFFLINE_HINT
        : canCreateQuotation
          ? "A formal quotation tied to this requirement. Dates and rate unit come from it."
          : "Quotations can only be created against an open requirement.",
    });
  }
  if (auctionHref && auction) {
    menuItems.push({
      key: "auction",
      label: isRunning(auction.status) ? "Open auction" : "View auction",
      icon: "auction",
      href: auctionHref,
      hint: isRunning(auction.status) ? "Ask to join, or bid once approved." : "The auction has finished.",
    });
  }

  // ------------------------------------------------------------------ attention
  const attention: AttentionListItem[] = [];
  if (askedForQuotation) {
    attention.push({
      key: "asked",
      severity: "warning",
      title: "The customer asked you for a formal quotation",
      context: `Asked on ${formatDate(myResponse?.quotationRequestedAt)}.${canQuote ? " Dates and rate unit come from the requirement." : " Creating quotations needs the Quotations permission."}`,
      action: canCreateQuotation ? { label: "Create quotation", href: quoteHref, disabled: offline } : undefined,
    });
  }
  if (!myResponse && canRespond && validity.days <= 3) {
    attention.push({
      key: "closing",
      severity: "warning",
      title: validity.days === 0 ? "Last day to respond is today" : `Stops taking responses in ${plural(validity.days, "day")}`,
      context: `You haven't replied. Validity ends ${formatDate(requirement.validityDate)}.`,
      action: { label: "Respond", onClick: () => setRespondOpen(true), disabled: offline },
    });
  }

  const short = data.machineCount !== null && data.machineCount < requirement.quantity;
  const figures: KeyFigure[] = [
    {
      key: "start",
      label: "Needed from",
      value: formatDate(requirement.requestedStartDate),
      context: durationLabel(requirement.expectedDurationValue, requirement.expectedDurationUnit) ?? "Duration not given",
    },
    {
      key: "quantity",
      label: "Quantity",
      value: requirement.quantity,
      unit: requirement.quantity === 1 ? "machine" : "machines",
      context:
        data.machineCount === null
          ? "Your fleet count needs the Equipment permission"
          : `You have ${plural(data.machineCount, "matching machine")}, not counting retired`,
      tone: short ? "warning" : undefined,
    },
    {
      key: "unit",
      label: "Rate unit",
      value: requirement.expectedDurationUnit ? UNIT_WORD[requirement.expectedDurationUnit] : "Your choice",
      context: requirement.expectedDurationUnit
        ? `Every reply and quotation is priced ${formatRateUnit(requirement.expectedDurationUnit)}`
        : "The requirement didn't set a duration unit",
    },
    {
      key: "validity",
      label: "Responses until",
      value: formatDate(requirement.validityDate),
      context: requirement.status === RequirementStatus.open ? validity.label : "Not taking responses",
      tone: requirement.status === RequirementStatus.open ? validity.tone : "muted",
    },
  ];

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        breadcrumbs={[
          { label: "Open market", href: backHref },
          { label: ref, mono: true },
        ]}
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
            {requirement.status === RequirementStatus.open && (
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
            {menuItems.length > 0 && <Menu label={`More actions for ${ref}`} items={menuItems} width={320} />}
          </>
        }
      >
        <DescriptionList
          layout="inline"
          items={[
            { label: "Project", value: requirement.projectName },
            { label: "Site", value: requirement.projectLocation },
            { label: "Posted", value: formatDate(requirement.createdAt), mono: true },
          ]}
        />
      </PageHeader>

      <PageBody>
        <AttentionList items={attention} note="Worked out when this page opened. FleetIP doesn't send reminders for these." />
        <KeyFigures items={figures} />

        <div className="flex flex-wrap items-start gap-3.5">
          <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-3.5">
            <Panel title="Your response" subtitle="only you and the customer see it" padding="md">
              {myResponse ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Status domain="quotation_response" value={myResponse.status} />
                    {myResponse.indicativeRate != null && myResponse.indicativeRateUnit && (
                      <span className="font-mono text-sm font-semibold text-ink">{formatRate(myResponse.indicativeRate, myResponse.indicativeRateUnit)}</span>
                    )}
                    {myResponse.quotationRequestedAt && (
                      <Badge variant="label" tone={quotedAlready ? "neutral" : "warning"} title="From the customer's request — not a stored status">
                        {quotedAlready ? "Quotation sent for this request" : "Customer asked for a quotation"}
                      </Badge>
                    )}
                  </div>
                  <DescriptionList
                    layout="rows"
                    items={[
                      { label: "Notes", value: myResponse.notes },
                      { label: "Last updated", value: formatDateTime(myResponse.updatedAt), mono: true },
                      {
                        label: "Quotation requested",
                        value: myResponse.quotationRequestedAt ? formatDate(myResponse.quotationRequestedAt) : null,
                        emptyText: myResponse.status === QuotationResponseStatus.interested ? "Not yet" : "Not applicable",
                        mono: Boolean(myResponse.quotationRequestedAt),
                      },
                    ]}
                  />
                </div>
              ) : (
                <EmptyState
                  className="px-0 py-2"
                  title="You haven't replied yet"
                  description={
                    canRespond
                      ? "Say whether you're interested and give an indicative rate. The customer compares replies and may ask you for a formal quotation."
                      : "It's no longer taking responses."
                  }
                  action={
                    canRespond ? (
                      <Button size="sm" variant="secondary" onClick={() => setRespondOpen(true)} disabled={offline}>
                        Respond
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </Panel>

            <Panel title="Your quotations" count={myQuotations?.length} subtitle="formal terms you've drafted or sent against it" padding="none">
              {myQuotations === null ? (
                <EmptyState title="Quotations aren't visible to your role" description="Viewing quotations needs the Quotations permission." />
              ) : myQuotations.length === 0 ? (
                <EmptyState
                  title="No quotation yet"
                  description={
                    canCreateQuotation
                      ? "Create one when the customer asks, or on your own. Its dates and rate unit come from this requirement."
                      : "Quotations can only be created against an open requirement."
                  }
                />
              ) : (
                <Table bare minWidth={620} caption={`Your quotations for ${ref}`}>
                  <Thead>
                    <Tr>
                      <Th className="w-[130px]">Quotation</Th>
                      <Th className="w-[200px]">Dates</Th>
                      <Th align="right">Rate</Th>
                      <Th className="w-[190px]">Status</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {myQuotations.map((q) => {
                      const acceptance = acceptanceLabel(q, "rental_company");
                      return (
                        <Tr key={q.id}>
                          <Td className="whitespace-nowrap">
                            <UILink href={`/quotations/${q.id}`} className={REF_LINK}>
                              {q.referenceNumber}
                            </UILink>
                          </Td>
                          <Td className="font-mono text-xs">
                            {formatDate(q.startDate)} → {q.endDate ? formatDate(q.endDate) : "open-ended"}
                          </Td>
                          <Td align="right">
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-mono text-xs font-semibold text-ink">{formatMoney(q.rate)}</span>
                              <span className="text-[11px] text-meta-light">{formatRateUnit(q.rateUnit)}</span>
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

            {auction && auctionHref && (
              <Panel title="Auction" subtitle="competing companies stay anonymous" padding="md">
                <div className="flex flex-wrap items-center gap-3">
                  <UILink href={auctionHref} className={REF_LINK}>
                    {auctionRef(auction.id)}
                  </UILink>
                  <Status domain="auction" value={auction.status} size="sm" />
                  <span className="text-xs text-meta">
                    {DIRECTION[auction.biddingDirection].rule} · base {formatMoney(auction.basePrice)} · {formatDateTime(auction.startsAt)} →{" "}
                    {formatDateTime(auction.endsAt)}
                  </span>
                  <UILink
                    href={auctionHref}
                    className="ml-auto inline-flex items-center gap-[5px] text-xs font-medium text-accent-text no-underline hover:text-accent-text-hover hover:underline"
                  >
                    {isRunning(auction.status) ? "Open auction" : "View auction"}
                    <Icon name="external" size={12} />
                  </UILink>
                </div>
              </Panel>
            )}
          </div>

          <aside aria-label="Requirement facts" className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5 min-[1180px]:max-w-[380px]">
            <RequirementFacts requirement={requirement} entry={entry} />
            <ActivityCard items={data.activity} />
          </aside>
        </div>
      </PageBody>

      <RespondDialog
        open={respondOpen}
        onClose={() => setRespondOpen(false)}
        organizationId={organizationId}
        requirement={requirement}
        subcategoryName={entry?.subcategory.name ?? null}
        existing={myResponse}
        machineCount={data.machineCount}
        onSaved={onResponseSaved}
      />
    </div>
  );
}
