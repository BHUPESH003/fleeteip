import type { IconName } from "@fleetip/ui";
import type { StatusDomain } from "../../../lib/status";

/** Shape + colour of an attention row's icon. Red ("error") is only for money at risk. */
export type Severity = "error" | "warning" | "info" | "success";

export type ContextTone = "default" | "danger" | "warning" | "success";

/**
 * One KPI tile: label, figure and a context line — never a bare number.
 * Every tile links to the list it summarizes.
 */
export interface KpiTileData {
  key: string;
  label: string;
  value: string;
  /** Unit after the figure, e.g. "machines". */
  unit?: string;
  /** What the number means, or what to look at next. Always present. */
  context: string;
  contextTone?: ContextTone;
  /** The (filtered) list this tile summarizes. */
  href: string;
}

/** A tile whose data didn't load — shown in place, with Try again, instead of a misleading zero. */
export interface KpiFailedTile {
  key: string;
  label: string;
  failed: true;
}

export type KpiTile = KpiTileData | KpiFailedTile;

export function isFailedTile(tile: KpiTile): tile is KpiFailedTile {
  return "failed" in tile;
}

export interface AttentionItem {
  key: string;
  /** The record's reference, in mono (invoice number, RN-…, asset code). */
  ref: string;
  /** The record's own stored status, shown next to the reference via <Status>. */
  status?: { domain: StatusDomain; value: string };
  title: string;
  detail: string;
  /** Timing in words: "12 days overdue", "Ends in 3 days". */
  timing?: string;
  severity: Severity;
  /** The row's one action; the whole row opens the record. */
  actionLabel: string;
  /** The specific record, never the bare list (see docs/decisions.md). */
  href: string;
}

export interface ActivityItem {
  id: string;
  title: string;
  message: string;
  /** "3 h ago" */
  when: string;
  /** Full timestamp for the tooltip. */
  whenIso: string;
  icon: IconName;
  unread: boolean;
  /** Where the notification's record opens; absent when it has no page. */
  href?: string;
}
