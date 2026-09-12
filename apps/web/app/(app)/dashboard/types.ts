import type { BadgeTone } from "@fleetip/ui";

export interface KpiTileData {
  label: string;
  value: string;
  note?: string;
  noteTone?: BadgeTone;
  href?: string;
}

export interface AttentionItem {
  ref: string;
  title: string;
  detail: string;
  state: string;
  tone: BadgeTone;
  actionLabel: string;
  href: string;
}

export interface ActivityItem {
  id: string;
  text: string;
  when: string;
  tone: BadgeTone;
}
