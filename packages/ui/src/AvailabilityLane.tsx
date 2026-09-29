"use client";

import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";

/**
 * Timeline lanes (design: Machine Detail v2 "Availability"). One scale spans
 * every lane so vertical comparison is valid. Draws dates, never a
 * percentage — "60% complete" tells an operator nothing about when a
 * machine comes back.
 */
export type LaneBlockKind =
  | "rental_active"
  | "rental_confirmed"
  | "rental_completed"
  | "rental_off_rent"
  | "workshop_in_progress"
  | "workshop_completed"
  | "workshop_scheduled"
  | "marker"
  | "tick_confirmed"
  | "tick_unconfirmed"
  | "tick_missing"
  // legacy aliases (machines list)
  | "active"
  | "confirmed"
  | "maintenance"
  | "past";

export interface LaneBlock {
  key?: string;
  /** ISO date (YYYY-MM-DD), inclusive. */
  from: string;
  /** ISO date, inclusive; null = open-ended, runs to the window edge. */
  to: string | null;
  kind: LaneBlockKind;
  /** Text drawn inside the block when it fits. */
  label?: string;
  /** Accessible name + tooltip, e.g. "RN-1042, ABC Infra, 18 Apr to 15 Oct 2026". */
  tip?: string;
}

interface KindStyle {
  bg: string;
  edge: string;
  fg: string;
  border?: string;
  inset?: number;
  minWidth?: number;
  /** Fraction of a day's width the tick occupies (logsheet ticks). */
  shrink?: number;
}

const KIND_STYLE: Record<LaneBlockKind, KindStyle> = {
  rental_active: { bg: "#DCE7F5", edge: "#1B4D8F", fg: "#12325C" },
  rental_confirmed: { bg: "#FFFFFF", edge: "#1B4D8F", fg: "#1B4D8F", border: "1px dashed #1B4D8F" },
  rental_completed: { bg: "#E9ECEF", edge: "#8A95A2", fg: "#47525E" },
  rental_off_rent: { bg: "#FBF1DF", edge: "#B8730F", fg: "#6B3F05" },
  workshop_in_progress: { bg: "#FBE3C4", edge: "#B8730F", fg: "#6B3F05" },
  workshop_completed: { bg: "#F2E7D6", edge: "#A67C3D", fg: "#5E4420" },
  workshop_scheduled: { bg: "#FFFFFF", edge: "#B8730F", fg: "#6B3F05", border: "1px dashed #B8730F" },
  marker: { bg: "#0F1720", edge: "#0F1720", fg: "#FFFFFF", inset: 5, minWidth: 8 },
  tick_confirmed: { bg: "#1B4D8F", edge: "#1B4D8F", fg: "#FFFFFF", minWidth: 2, shrink: 0.62 },
  tick_unconfirmed: { bg: "#FFFFFF", edge: "#1B4D8F", fg: "#FFFFFF", border: "1px solid #1B4D8F", minWidth: 2, shrink: 0.62 },
  tick_missing: { bg: "transparent", edge: "#B4453C", fg: "#FFFFFF", inset: 10, minWidth: 2, shrink: 0.62 },
  active: { bg: "#DCE7F5", edge: "#1B4D8F", fg: "#12325C" },
  confirmed: { bg: "#FFFFFF", edge: "#1B4D8F", fg: "#1B4D8F", border: "1px dashed #1B4D8F" },
  maintenance: { bg: "#FBE3C4", edge: "#B8730F", fg: "#6B3F05" },
  past: { bg: "#E9ECEF", edge: "#8A95A2", fg: "#47525E" },
};

function dayNumber(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;
}

function pct(day: number, start: number, span: number): number {
  return Math.max(0, Math.min(100, ((day - start) / span) * 100));
}

interface Geometry {
  left: number;
  width: number;
}

function geometry(block: LaneBlock, windowStart: string, windowDays: number): Geometry | null {
  const start = dayNumber(windowStart);
  const end = start + windowDays;
  const a = dayNumber(block.from);
  const b = block.to ? dayNumber(block.to) + 1 : end;
  if (b <= start || a >= end) return null;
  const left = pct(a, start, windowDays);
  const style = KIND_STYLE[block.kind];
  const width = (pct(b, start, windowDays) - left) * (style.shrink ?? 1);
  return { left, width };
}

function BlockView({
  block,
  geo,
  selected,
  onSelect,
  showLabel,
}: {
  block: LaneBlock;
  geo: Geometry;
  selected: boolean;
  onSelect?: (block: LaneBlock) => void;
  showLabel: boolean;
}) {
  const s = KIND_STYLE[block.kind];
  const inset = s.inset ?? 4;
  const style: CSSProperties = {
    top: inset,
    bottom: inset,
    left: `${geo.left}%`,
    width: `${geo.width}%`,
    minWidth: s.minWidth ?? 4,
    background: s.bg,
    border: s.border ?? "none",
    borderLeft: `2px solid ${s.edge}`,
    outline: selected ? "2px solid #0F1720" : undefined,
    outlineOffset: selected ? 0 : undefined,
    zIndex: selected ? 2 : 1,
  };
  const label = showLabel && block.label ? (
    <span className="truncate pl-1.5 text-[10px] font-medium leading-none" style={{ color: s.fg }}>
      {block.label}
    </span>
  ) : null;
  const className = "absolute box-border flex items-center overflow-hidden rounded-[2px] p-0";
  if (onSelect) {
    return (
      <button
        type="button"
        title={block.tip}
        aria-label={block.tip}
        aria-pressed={selected}
        onClick={() => onSelect(block)}
        className={cx(className, "cursor-pointer hover:brightness-[0.96] focus-visible:outline-2 focus-visible:outline-offset-1")}
        style={style}
      >
        {label}
      </button>
    );
  }
  return (
    <span title={block.tip} className={className} style={style}>
      {label}
      {block.tip && <span className="sr-only">{block.tip}</span>}
    </span>
  );
}

export interface AvailabilityLaneProps {
  windowStart: string;
  windowDays: number;
  blocks: LaneBlock[];
  /** Evenly-spaced labels above the track (list rows). */
  scale?: string[];
  gapLabels?: LaneGapLabel[];
  today?: string;
  height?: number;
  selectedKey?: string | null;
  onSelect?: (block: LaneBlock) => void;
  showLabels?: boolean;
  className?: string;
}

export interface LaneGapLabel {
  left: number;
  text: string;
  tone?: "free" | "warn";
}

/** A single track (used in list rows); `LaneChart` stacks several with labels. */
export function AvailabilityLane({
  windowStart,
  windowDays,
  blocks,
  scale,
  gapLabels,
  today,
  height = 26,
  selectedKey,
  onSelect,
  showLabels = true,
  className,
}: AvailabilityLaneProps) {
  const start = dayNumber(windowStart);
  const todayPct = today ? pct(dayNumber(today), start, windowDays) : null;
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      {scale && scale.length > 0 && (
        <div className="flex" aria-hidden="true">
          {scale.map((label, i) => (
            <span key={`${label}-${i}`} className="flex-1 border-l border-border-header pb-0.5 pl-1 font-mono text-[9px] leading-none text-meta">
              {label}
            </span>
          ))}
        </div>
      )}
      <div
        className="relative overflow-hidden rounded-xs border border-border-lane bg-surface-rail-track"
        style={{ height }}
      >
        {blocks.map((block, i) => {
          const geo = geometry(block, windowStart, windowDays);
          if (!geo) return null;
          return (
            <BlockView
              key={block.key ?? i}
              block={block}
              geo={geo}
              selected={Boolean(selectedKey && block.key === selectedKey)}
              onSelect={onSelect}
              showLabel={showLabels}
            />
          );
        })}
        {todayPct !== null && todayPct > 0 && todayPct < 100 && (
          <div aria-hidden="true" className="absolute inset-y-0 z-[3] w-px bg-accent" style={{ left: `${todayPct}%` }} />
        )}
        {gapLabels?.map((gap, i) => (
          <span
            key={i}
            className={cx(
              "absolute top-1.5 whitespace-nowrap font-mono text-[9px] font-medium leading-[1.4]",
              gap.tone === "warn" ? "text-attention" : "text-available",
            )}
            style={{ left: `${gap.left}%` }}
          >
            {gap.text}
          </span>
        ))}
      </div>
    </div>
  );
}

export interface LaneRow {
  key: string;
  label: string;
  height: number;
  blocks: LaneBlock[];
}

export interface LaneMonth {
  date: string;
  label: string;
}

/** Labelled multi-lane chart with a shared month scale and today line. */
export function LaneChart({
  windowStart,
  windowDays,
  today,
  months,
  lanes,
  selectedKey,
  onSelect,
}: {
  windowStart: string;
  windowDays: number;
  today: string;
  months: LaneMonth[];
  lanes: LaneRow[];
  selectedKey?: string | null;
  onSelect?: (block: LaneBlock) => void;
}) {
  const start = dayNumber(windowStart);
  return (
    <div className="grid items-center gap-x-2.5 gap-y-1.5" style={{ gridTemplateColumns: "86px minmax(0,1fr)" }}>
      <span />
      <div className="relative h-3.5" aria-hidden="true">
        {months.map((month) => (
          <span
            key={month.date}
            className="absolute top-0 whitespace-nowrap border-l border-border-header pb-[3px] pl-1 font-mono text-[10px] font-medium leading-none text-meta"
            style={{ left: `${pct(dayNumber(month.date), start, windowDays)}%` }}
          >
            {month.label}
          </span>
        ))}
      </div>
      {lanes.map((lane) => (
        <LaneRowView
          key={lane.key}
          lane={lane}
          windowStart={windowStart}
          windowDays={windowDays}
          today={today}
          selectedKey={selectedKey}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function LaneRowView({
  lane,
  windowStart,
  windowDays,
  today,
  selectedKey,
  onSelect,
}: {
  lane: LaneRow;
  windowStart: string;
  windowDays: number;
  today: string;
  selectedKey?: string | null;
  onSelect?: (block: LaneBlock) => void;
}) {
  return (
    <>
      <span className="text-[11px] font-medium leading-[1.2] text-ink-muted">{lane.label}</span>
      <AvailabilityLane
        windowStart={windowStart}
        windowDays={windowDays}
        blocks={lane.blocks}
        today={today}
        height={lane.height}
        selectedKey={selectedKey}
        onSelect={onSelect}
      />
    </>
  );
}

export interface LaneLegendItem {
  label: string;
  kind: LaneBlockKind;
}

/** Legend row shared beneath the lanes — one legend, not one per row. */
export function AvailabilityLaneLegend({
  items,
  todayLabel = "Today",
  trailing,
  className,
}: {
  items: LaneLegendItem[];
  todayLabel?: string;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-wrap items-center gap-x-3.5 gap-y-1.5", className)}>
      {items.map((item) => {
        const s = KIND_STYLE[item.kind];
        return (
          <span key={item.label} className="inline-flex items-center gap-1.5 text-[11px] leading-none text-meta">
            <span
              aria-hidden="true"
              className="box-border h-2 w-3.5 rounded-[2px]"
              style={{ background: s.bg, border: s.border ?? "none", borderLeft: `2px solid ${s.edge}` }}
            />
            {item.label}
          </span>
        );
      })}
      {todayLabel && (
        <span className="inline-flex items-center gap-1.5 text-[11px] leading-none text-meta">
          <span aria-hidden="true" className="h-2.5 w-px bg-accent" />
          {todayLabel}
        </span>
      )}
      {trailing && <span className="ml-auto text-[11px] text-meta">{trailing}</span>}
    </div>
  );
}
