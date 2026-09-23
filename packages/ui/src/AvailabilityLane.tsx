/**
 * The shared timeline part described in the FleetIP design system
 * ("availability lane" section 05): one scale spans every row in a
 * table, so vertical comparison down a column is valid. Used at 90 days
 * for the Machines/Rentals list and at 12 months for Machine detail —
 * same component, different `windowStart`/`windowDays`/`monthScale`.
 *
 * Deliberately draws dates, never a percentage: a bar that is "60%
 * complete" tells an operator nothing about when a machine comes back.
 */

export type LaneBlockKind = "active" | "confirmed" | "maintenance" | "past";

export interface LaneBlock {
  /** ISO date (YYYY-MM-DD) the block starts. */
  from: string;
  /** ISO date the block ends, or null for an open-ended block that runs to the window's edge. */
  to: string | null;
  kind: LaneBlockKind;
  /** Optional label drawn inside the block (used at the 12-month density, not the dense 90-day one). */
  label?: string;
}

export interface LaneGapLabel {
  /** 0-100, position along the lane. */
  left: number;
  text: string;
  tone?: "free" | "warn";
}

export interface AvailabilityLaneProps {
  /** ISO date the visible window starts at. */
  windowStart: string;
  windowDays: number;
  blocks: LaneBlock[];
  /** Short month/period labels drawn above the lane, evenly spaced (e.g. ["Sep","Oct","Nov"]). */
  scale?: string[];
  gapLabels?: LaneGapLabel[];
  /** ISO date for the vertical "today" marker. Omitted if outside the window. */
  today?: string;
  height?: number;
  className?: string;
}

const KIND_CLASSES: Record<LaneBlockKind, { bg: string; edge: string }> = {
  active: { bg: "bg-on-rent-lane", edge: "border-l-on-rent-lane-edge" },
  confirmed: { bg: "bg-confirmed-lane", edge: "border-l-confirmed-lane-edge" },
  maintenance: { bg: "bg-attention-lane", edge: "border-l-attention-lane-edge" },
  past: { bg: "bg-past-lane", edge: "border-l-past-lane-edge" },
};

const GAP_TONE_CLASS: Record<"free" | "warn", string> = {
  free: "text-available",
  warn: "text-attention",
};

function pct(iso: string, windowStart: string, windowDays: number): number {
  const value =
    ((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${windowStart}T00:00:00Z`)) / 86_400_000 / windowDays) * 100;
  return Math.max(0, Math.min(100, value));
}

/** The lane strip alone (scale + track + today marker) — no legend, for embedding in a table cell. */
export function AvailabilityLane({
  windowStart,
  windowDays,
  blocks,
  scale,
  gapLabels,
  today,
  height = 26,
  className,
}: AvailabilityLaneProps) {
  const todayPct = today ? pct(today, windowStart, windowDays) : null;
  const showToday = todayPct !== null && todayPct > 0 && todayPct < 100;

  return (
    <div className={["flex flex-col gap-1", className].filter(Boolean).join(" ")}>
      {scale && scale.length > 0 && (
        <div className="flex">
          {scale.map((label, i) => (
            <span
              key={`${label}-${i}`}
              className="flex-1 border-l border-border pb-0.5 pl-1 font-mono text-[9px] leading-none text-meta"
            >
              {label}
            </span>
          ))}
        </div>
      )}
      <div
        className="relative overflow-hidden rounded-cell border border-border-soft bg-surface-rail-track"
        style={{ height }}
      >
        {blocks.map((block, i) => {
          const left = pct(block.from, windowStart, windowDays);
          const right = block.to ? pct(block.to, windowStart, windowDays) : 100;
          const width = right - left;
          if (width <= 0 || left >= 100 || right <= 0) return null;
          const cls = KIND_CLASSES[block.kind];
          return (
            <div
              key={i}
              className={["absolute box-border overflow-hidden rounded-xs border-l-2", cls.bg, cls.edge].join(" ")}
              style={{ top: 4, bottom: 4, left: `${left}%`, width: `${width}%` }}
            >
              {block.label && (
                <span className="whitespace-nowrap px-1.5 text-[10px] font-medium leading-[1] text-ink-strong">
                  {block.label}
                </span>
              )}
            </div>
          );
        })}
        {showToday && (
          <div className="absolute inset-y-0 w-px bg-accent" style={{ left: `${todayPct}%` }} />
        )}
        {gapLabels?.map((gap, i) => (
          <span
            key={i}
            className={[
              "absolute top-1.5 whitespace-nowrap font-mono text-[9px] font-medium leading-[1.4]",
              GAP_TONE_CLASS[gap.tone ?? "free"],
            ].join(" ")}
            style={{ left: `${gap.left}%` }}
          >
            {gap.text}
          </span>
        ))}
      </div>
    </div>
  );
}

export interface LaneLegendItem {
  label: string;
  kind: LaneBlockKind;
}

const DEFAULT_LEGEND: LaneLegendItem[] = [
  { label: "On rent", kind: "active" },
  { label: "Confirmed ahead", kind: "confirmed" },
  { label: "Maintenance block", kind: "maintenance" },
];

/** The legend row shared beneath every lane instance on a page — one legend, not one per row. */
export function AvailabilityLaneLegend({
  items = DEFAULT_LEGEND,
  showOpen = true,
  showToday = true,
  className,
}: {
  items?: LaneLegendItem[];
  showOpen?: boolean;
  showToday?: boolean;
  className?: string;
}) {
  return (
    <div className={["flex flex-wrap items-center gap-4", className].filter(Boolean).join(" ")}>
      {items.map((item) => {
        const cls = KIND_CLASSES[item.kind];
        return (
          <span key={item.label} className="inline-flex items-center gap-1.5 text-xs text-meta">
            <span className={["h-2 w-3.5 rounded-xs border-l-2 box-border", cls.bg, cls.edge].join(" ")} />
            {item.label}
          </span>
        );
      })}
      {showOpen && (
        <span className="inline-flex items-center gap-1.5 text-xs text-meta">
          <span className="h-2 w-3.5 rounded-xs border-l-2 border-l-border-soft bg-surface-rail-track box-border" />
          Open to quote
        </span>
      )}
      {showToday && (
        <span className="inline-flex items-center gap-1.5 text-xs text-meta">
          <span className="h-3 w-px bg-accent" />
          Today
        </span>
      )}
    </div>
  );
}
