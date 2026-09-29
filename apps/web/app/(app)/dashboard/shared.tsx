"use client";

import { InvoiceStatus, type Invoice, type InvoiceDetail } from "@fleetip/contracts/billing";
import type { Notification } from "@fleetip/contracts/notification";
import {
  Button,
  EmptyState,
  ErrorState,
  Icon,
  KeyFiguresSkeleton,
  PageBody,
  Panel,
  Skeleton,
  cx,
  type IconName,
} from "@fleetip/ui";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { apiClient } from "../../../lib/api-client";
import { formatDateTime, formatNumber, formatRelativeTime, plural, todayIsoDate } from "../../../lib/format";
import { ROUTE_BY_RESOURCE_TYPE } from "../../../lib/navigation";
import { Status } from "../../../lib/status";
import { optional } from "../../../lib/use-load";
import { isFailedTile, type ActivityItem, type AttentionItem, type ContextTone, type KpiTile, type Severity } from "./types";

// ------------------------------------------------------------------ loading

/**
 * Each dashboard section loads on its own: a failure (or a 403 from a role
 * missing that permission) affects only that section's tiles and rows,
 * never the whole page (docs/decisions.md — ancillary permissions must not
 * block a page).
 */
export type Settled<T> = { ok: true; data: T } | { ok: false; error: unknown };

/** `enabled=false` (the role can't see it) settles to the fallback without a request. */
export async function settle<T>(enabled: boolean, call: () => Promise<T | undefined>, fallback: T): Promise<Settled<T>> {
  if (!enabled) return { ok: true, data: fallback };
  try {
    return { ok: true, data: (await call()) ?? fallback };
  } catch (error) {
    return { ok: false, error };
  }
}

export function dataOf<T>(settled: Settled<T>, fallback: T): T {
  return settled.ok ? settled.data : fallback;
}

export interface InvoiceView {
  invoice: Invoice;
  /** Status after the detail call (which is what flips a past-due invoice to overdue). */
  status: InvoiceStatus;
  /** Balance still owed; 0 for anything not issued/overdue. */
  balance: number;
}

/**
 * balanceDue and the overdue flip both come only from getInvoiceDetail
 * (plan §1), so it's fetched per issued/overdue invoice. If one detail call
 * fails, that invoice falls back to its total and an issued invoice past
 * its due date is treated as overdue.
 */
export async function loadInvoiceViews(organizationId: string, invoices: Invoice[]): Promise<InvoiceView[]> {
  const today = todayIsoDate();
  return Promise.all(
    invoices.map(async (invoice): Promise<InvoiceView> => {
      if (invoice.status !== InvoiceStatus.issued && invoice.status !== InvoiceStatus.overdue) return { invoice, status: invoice.status, balance: 0 };
      const detail = await optional(
        true,
        () => apiClient.getInvoiceDetail(organizationId, invoice.id),
        null as InvoiceDetail | null,
      );
      const status: InvoiceStatus =
        detail?.invoice.status ?? (invoice.status === InvoiceStatus.issued && invoice.dueDate < today ? InvoiceStatus.overdue : invoice.status);
      const unpaid = status === InvoiceStatus.issued || status === InvoiceStatus.overdue;
      return { invoice, status, balance: unpaid ? (detail?.balanceDue ?? invoice.totalAmount) : 0 };
    }),
  );
}

export function isUnpaid(view: InvoiceView): boolean {
  return view.status === InvoiceStatus.issued || view.status === InvoiceStatus.overdue;
}

// ------------------------------------------------------------------ copy helpers

/** "Machines, invoices and auctions" */
export function listPhrase(words: string[]): string {
  if (words.length === 0) return "";
  const joined = words.length === 1 ? words[0]! : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/** Days from today, in words: "today", "tomorrow", "in 5 days", "3 days ago". */
export function relativeDay(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days > 1) return `in ${plural(days, "day")}`;
  if (days === -1) return "yesterday";
  return `${plural(-days, "day")} ago`;
}

/** "12 days overdue"; "Due today" when it isn't late yet. */
export function overdueBy(daysLate: number): string {
  return daysLate <= 0 ? "Due today" : `${plural(daysLate, "day")} overdue`;
}

export function welcomeLine(displayName: string | undefined, organizationName: string | undefined): string {
  return [displayName ? `Welcome, ${displayName}` : "Welcome", organizationName].filter(Boolean).join(" · ");
}

export function count(value: number): string {
  return formatNumber(value, 0);
}

// ------------------------------------------------------------------ notifications


const ICON_BY_RESOURCE_TYPE: Record<string, IconName> = {
  requirement: "requirement",
  quotation_request: "quotation",
  quotation: "quotation",
  auction: "auction",
  rental: "rental",
  machine: "machine",
  transport: "transport",
  work_order: "work_order",
  invoice: "invoice",
};

export function notificationsToActivity(notifications: Notification[], limit = 6): ActivityItem[] {
  return notifications.slice(0, limit).map((n) => {
    const type = n.relatedResourceType ?? "";
    const route = ROUTE_BY_RESOURCE_TYPE[type];
    return {
      id: n.id,
      title: n.title,
      message: n.message,
      when: formatRelativeTime(n.createdAt),
      whenIso: n.createdAt,
      icon: ICON_BY_RESOURCE_TYPE[type] ?? "notification",
      unread: !n.readAt,
      href: route && n.relatedResourceId ? route(n.relatedResourceId) : undefined,
    };
  });
}

// ------------------------------------------------------------------ KPI grid

const CONTEXT_TONE: Record<ContextTone, string> = {
  default: "text-meta",
  danger: "text-destructive",
  warning: "text-attention",
  success: "text-available",
};

const TILE = "flex min-w-0 flex-[1_1_180px] flex-col gap-[5px] bg-surface px-4 py-3";
const TILE_LABEL = "text-[10px] font-semibold uppercase leading-[1.2] tracking-[0.1em] text-meta";

/**
 * The dashboard's figures (kept as KpiGrid — a past decision, see
 * docs/decisions.md): label, value and a context line, each tile a link to
 * the list it summarizes. Cells are flex 1 1 180px so the last row
 * stretches instead of leaving empty cells.
 */
export function KpiGrid({ tiles, onRetry }: { tiles: KpiTile[]; onRetry: () => void }) {
  if (tiles.length === 0) return null;
  return (
    <section
      aria-label="Key figures"
      className="flex flex-wrap gap-px overflow-hidden rounded-panel border border-border-strong bg-border-soft"
    >
      {tiles.map((tile) =>
        isFailedTile(tile) ? (
          <div key={tile.key} className={TILE}>
            <span className={TILE_LABEL}>{tile.label}</span>
            <span className="flex items-center gap-1.5 text-sm font-medium text-destructive">
              <Icon name="error" size={14} />
              Didn&apos;t load
            </span>
            <button
              type="button"
              onClick={onRetry}
              className="self-start border-0 bg-transparent p-0 text-[11px] font-medium text-accent-text hover:text-accent-text-hover hover:underline"
            >
              Try again
            </button>
          </div>
        ) : (
          <Link
            key={tile.key}
            href={tile.href}
            className={cx(TILE, "group no-underline hover:bg-surface-row-hover focus-visible:-outline-offset-2")}
          >
            <span className="flex items-center gap-1.5">
              <span className={TILE_LABEL}>{tile.label}</span>
              <Icon name="chevron_right" size={12} className="ml-auto text-meta-light group-hover:text-ink" />
            </span>
            <span className="flex flex-wrap items-baseline gap-1.5">
              <span className="font-mono text-[19px] font-semibold leading-[1.1] text-ink">{tile.value}</span>
              {tile.unit && <span className="text-xs leading-none text-ink-muted">{tile.unit}</span>}
            </span>
            <span className={cx("text-[11px] leading-[1.4]", CONTEXT_TONE[tile.contextTone ?? "default"])}>{tile.context}</span>
          </Link>
        ),
      )}
    </section>
  );
}

// ------------------------------------------------------------------ attention panel

const SEVERITY: Record<Severity, { icon: IconName; className: string; label: string }> = {
  error: { icon: "error", className: "text-sev-error", label: "Urgent" },
  warning: { icon: "warning", className: "text-sev-warning", label: "Needs action" },
  info: { icon: "info", className: "text-sev-info", label: "For your information" },
  success: { icon: "success", className: "text-available", label: "Ready to proceed" },
};

/**
 * Items derived from what loaded, each row opening the specific record it's
 * about. Order is deliberate (direct customer asks first) — rows are not
 * re-sorted. Shows `initialVisible`, then "Show N more".
 */
export function AttentionPanel({
  title,
  items,
  missing,
  onRetry,
  initialVisible = 5,
}: {
  title: string;
  items: AttentionItem[];
  /** Sources that failed to load ("invoices") — their rows may be missing. */
  missing: string[];
  onRetry: () => void;
  initialVisible?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, initialVisible);
  const hidden = items.length - initialVisible;

  return (
    <Panel title={title} count={items.length} icon="warning" iconClassName="text-sev-warning" padding="none">
      {items.length === 0 ? (
        <EmptyState
          title={missing.length ? "Nothing to show from what loaded" : "Nothing needs your attention"}
          description="Overdue payments, quotations waiting on someone, rentals ending soon and machines in the workshop show up here."
        />
      ) : (
        <ul className="m-0 list-none p-0">
          {shown.map((item) => {
            const sev = SEVERITY[item.severity];
            return (
              <li key={item.key} className="border-b border-border last:border-b-0">
                <Link
                  href={item.href}
                  className="grid grid-cols-[18px_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-4 py-[11px] no-underline hover:bg-surface-row-hover focus-visible:-outline-offset-2 min-[560px]:grid-cols-[18px_minmax(0,1fr)_auto]"
                >
                  <span className="pt-px">
                    <Icon name={sev.icon} size={16} label={sev.label} className={sev.className} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-[3px]">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-mono text-xs font-medium text-ink">{item.ref}</span>
                      {item.status && <Status domain={item.status.domain} value={item.status.value} size="sm" />}
                    </span>
                    <span className="text-sm font-semibold leading-[1.35] text-ink">{item.title}</span>
                    <span className="text-xs leading-[1.5] text-ink-soft">{item.detail}</span>
                    {item.timing && <span className="text-[11px] leading-[1.4] text-meta">{item.timing}</span>}
                  </span>
                  <span className="col-start-2 inline-flex h-7 items-center gap-1 self-center justify-self-start whitespace-nowrap rounded-cell border border-border-control bg-surface px-[11px] text-xs font-medium text-ink-strong min-[560px]:col-start-auto">
                    {item.actionLabel}
                    <Icon name="chevron_right" size={12} className="text-meta" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {hidden > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="h-[34px] w-full border-0 border-t border-border bg-surface pl-[46px] pr-4 text-left text-xs font-medium text-accent-text hover:bg-surface-row-hover focus-visible:-outline-offset-2"
        >
          {expanded ? "Show fewer" : `Show ${hidden} more`}
        </button>
      )}
      {missing.length > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-2 border-t border-border bg-destructive-wash px-4 py-2.5">
          <Icon name="error" size={14} className="text-sev-error" />
          <span className="min-w-0 flex-1 text-xs leading-[1.45] text-ink-body">
            {listPhrase(missing)} didn&apos;t load, so items about {missing.length === 1 ? "it" : "them"} may be missing.
          </span>
          <Button variant="secondary" size="sm" icon="refresh" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
      <p className="m-0 border-t border-border px-4 py-2.5 text-[11px] leading-[1.45] text-meta-light">
        Worked out when this page opened. FleetIP doesn&apos;t send reminders for these.
      </p>
    </Panel>
  );
}

// ------------------------------------------------------------------ activity

export function ActivityPanel({ items, failed, onRetry }: { items: ActivityItem[]; failed: boolean; onRetry: () => void }) {
  return (
    <Panel title="Recent activity" icon="notification" padding="none">
      {failed ? (
        <div className="p-4">
          <SectionError what="Recent activity" onRetry={onRetry} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Updates about your quotations, rentals, transport and invoices appear here as they happen."
        />
      ) : (
        <ul className="m-0 list-none p-0">
          {items.map((item) => {
            const body = (
              <>
                <Icon name={item.icon} size={15} className="mt-0.5 text-meta" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cx("text-sm leading-snug text-ink", item.unread ? "font-semibold" : "font-medium")}>
                    {item.unread && <span className="sr-only">Unread: </span>}
                    {item.title}
                  </span>
                  <span className="text-xs leading-[1.45] text-ink-muted">{item.message}</span>
                  <span title={formatDateTime(item.whenIso)} className="text-[11px] text-meta-light">
                    {item.when}
                  </span>
                </span>
                {item.unread && <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-accent" />}
              </>
            );
            return (
              <li key={item.id} className="border-b border-border last:border-b-0">
                {item.href ? (
                  <Link
                    href={item.href}
                    className="flex items-start gap-2.5 px-4 py-2.5 no-underline hover:bg-surface-row-hover focus-visible:-outline-offset-2"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-start gap-2.5 px-4 py-2.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!failed && items.length > 0 && (
        <p className="m-0 border-t border-border px-4 py-2.5 text-[11px] leading-[1.45] text-meta-light">
          Your latest notifications. The bell at the top of the page has all of them.
        </p>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------ breakdowns

export interface BreakdownRow {
  key: string;
  label: string;
  count: number;
  /** Tailwind background token class for the swatch/bar, e.g. "bg-on-rent". */
  swatch: string;
  href: string;
}

/**
 * Parts of a whole (the fleet by deployment): one stacked bar plus a
 * labelled row per part, each row linking to the filtered list. Square
 * swatches and words, so it reads without colour.
 */
export function StackedBreakdown({ rows, total, noun }: { rows: BreakdownRow[]; total: number; noun: string }) {
  const safeTotal = total || 1;
  return (
    <div className="flex flex-col gap-2.5">
      <div aria-hidden="true" className="flex h-2 overflow-hidden rounded-xs bg-surface-hover">
        {rows.map((row) => (
          <div key={row.key} className={row.swatch} style={{ width: `${(row.count / safeTotal) * 100}%` }} />
        ))}
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {rows.map((row) => (
          <li key={row.key}>
            <Link
              href={row.href}
              className="group -mx-2 flex items-baseline gap-2 rounded-cell px-2 py-[5px] no-underline hover:bg-surface-row-hover"
            >
              <span aria-hidden="true" className={cx("h-2 w-2 flex-none rounded-[1px]", row.swatch)} />
              <span className="flex-1 text-xs leading-[1.3] text-ink-muted group-hover:text-ink">{row.label}</span>
              <span className="font-mono text-sm font-semibold leading-none text-ink">{count(row.count)}</span>
              <span className="w-[38px] text-right font-mono text-[11px] leading-none text-meta-light">
                {Math.round((row.count / safeTotal) * 100)}%
              </span>
              <span className="sr-only">
                {" "}
                of {plural(total, noun)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Stages of a funnel: one bar per row, relative to the largest stage. */
export function StageBreakdown({ rows }: { rows: BreakdownRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {rows.map((row) => (
        <li key={row.key}>
          <Link
            href={row.href}
            className="group -mx-2 flex flex-col gap-1 rounded-cell px-2 py-1.5 no-underline hover:bg-surface-row-hover"
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-ink-muted group-hover:text-ink">{row.label}</span>
              <span className="font-mono text-sm font-semibold text-ink">{count(row.count)}</span>
            </span>
            <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-xs bg-surface-hover">
              <span className={cx("block h-full rounded-xs", row.swatch)} style={{ width: `${(row.count / max) * 100}%` }} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ states

export function SectionError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <ErrorState
      title={`${what} didn't load`}
      message="The problem is on our side or with the connection, not with your data. The rest of the page still works."
      action={
        <Button variant="secondary" size="sm" icon="refresh" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}

/** The layout of the loaded page (figures, attention, side cards) so nothing jumps. */
export function DashboardSkeleton({ header }: { header: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      {header}
      <PageBody>
        <div aria-busy="true" aria-label="Loading overview" className="flex flex-col gap-3.5">
          <KeyFiguresSkeleton count={6} />
          <div className="grid grid-cols-1 gap-3.5 min-[1180px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-3 rounded-panel border border-border-soft bg-surface p-4">
              <Skeleton className="h-3.5 w-40" />
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="flex items-start gap-3 border-t border-border pt-3">
                  <Skeleton className="h-4 w-4" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3.5">
              <div className="h-[168px] rounded-panel border border-border-soft bg-surface" />
              <div className="h-[220px] rounded-panel border border-border-soft bg-surface" />
            </div>
          </div>
          <span role="status" className="text-xs text-meta">
            Loading overview…
          </span>
        </div>
      </PageBody>
    </div>
  );
}
