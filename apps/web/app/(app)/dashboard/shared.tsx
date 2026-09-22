import type { Notification, NotificationType } from "@fleetip/contracts/notification";
import { Badge, Card, type BadgeTone } from "@fleetip/ui";
import Link from "next/link";
import { formatRelativeTime } from "../../../lib/format";
import type { ActivityItem, AttentionItem, KpiTileData } from "./types";

const NOTIFICATION_TONE: Record<NotificationType, BadgeTone> = {
  "requirement.response_received": "info",
  "requirement.quotation_requested": "info",
  "quotation.sent": "info",
  "quotation.negotiation_offer": "warning",
  "quotation.offer_accepted": "success",
  "quotation.accepted": "success",
  "quotation.rejected": "danger",
  "quotation.awarded": "success",
  "quotation.alternate_dates_proposed": "warning",
  "quotation.alternate_dates_responded": "info",
  "auction.participant_approved": "info",
  "auction.started": "info",
  "auction.ended": "warning",
  "auction.participant_selected": "success",
  "workorder.issued": "success",
  "rental.active": "success",
  "rental.off_rent": "warning",
  "rental.completed": "neutral",
  "rental.actual_dates_verified": "success",
  "rental.actual_dates_disputed": "danger",
  "transport.dispatched": "info",
  "transport.delivered": "success",
  "billing.invoice_issued": "info",
  "billing.payment_recorded": "success",
};

export function notificationsToActivity(notifications: Notification[], limit = 6): ActivityItem[] {
  return notifications.slice(0, limit).map((n) => ({
    id: n.id,
    text: n.message,
    when: formatRelativeTime(n.createdAt),
    tone: NOTIFICATION_TONE[n.type] ?? "neutral",
  }));
}

const TONE_BG: Record<BadgeTone, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  success: "bg-success",
  info: "bg-info",
  neutral: "bg-neutral",
};

const TONE_TEXT: Record<BadgeTone, string> = {
  danger: "text-danger",
  warning: "text-warning",
  success: "text-success",
  info: "text-info",
  neutral: "text-meta",
};

export function KpiGrid({ kpis }: { kpis: KpiTileData[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
      {kpis.map((kpi) => {
        const tile = (
          <Card
            padding="sm"
            className={kpi.href ? "transition hover:border-border-strong" : undefined}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-meta">
              {kpi.label}
            </p>
            <p className="mt-1 font-mono text-2xl font-medium tracking-tight text-ink">
              {kpi.value}
            </p>
            {kpi.note && (
              <p className={["mt-1 text-[11px]", TONE_TEXT[kpi.noteTone ?? "neutral"]].join(" ")}>
                {kpi.note}
              </p>
            )}
          </Card>
        );
        return kpi.href ? (
          <Link key={kpi.label} href={kpi.href}>
            {tile}
          </Link>
        ) : (
          <div key={kpi.label}>{tile}</div>
        );
      })}
    </div>
  );
}

export function AttentionPanel({ title, items }: { title: string; items: AttentionItem[] }) {
  return (
    <Card padding="none" className="flex flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {items.length > 0 && (
          <Badge tone={items.length > 3 ? "danger" : "warning"}>{items.length}</Badge>
        )}
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-meta">Nothing needs your attention.</p>
      ) : (
        items.map((item) => (
          <Link
            key={item.ref}
            href={item.href}
            className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-surface-sunk"
          >
            <span className={["w-0.5 shrink-0 self-stretch rounded-full", TONE_BG[item.tone]].join(" ")} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-ink">{item.ref}</span>
                <span className="truncate text-sm font-semibold text-ink">{item.title}</span>
              </div>
              <p className="truncate text-xs text-meta">{item.detail}</p>
            </div>
            <Badge tone={item.tone} className="shrink-0">
              {item.state}
            </Badge>
          </Link>
        ))
      )}
    </Card>
  );
}

export function ActivityPanel({ items }: { items: ActivityItem[] }) {
  return (
    <Card className="flex flex-1 flex-col overflow-hidden" padding="none">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
      </div>
      <div className="flex flex-col gap-3 px-4 py-3">
        {items.length === 0 ? (
          <p className="text-sm text-meta">No recent activity.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex gap-2.5">
              <span className={["mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", TONE_BG[item.tone]].join(" ")} />
              <div className="min-w-0">
                <p className="text-xs text-ink">{item.text}</p>
                <p className="text-[11px] text-meta-light">{item.when}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
