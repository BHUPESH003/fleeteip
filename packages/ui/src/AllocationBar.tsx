/**
 * "A summary that is also the filter" (design system section 06). Segment
 * widths follow each group's share of the total, so the shape of the bar
 * is the shape of the fleet/book — and clicking a segment selects it,
 * replacing a separate tab strip or KPI-card row entirely.
 *
 * Every segment states a consequence in its `sub` line rather than a bare
 * percentage ("4 idle over 30 days", not "25%") per the design system's
 * "say what a count means" rule.
 */

export type AllocationTone = "on-rent" | "available" | "attention" | "out-of-service" | "neutral";

const TONE_FG: Record<AllocationTone, string> = {
  "on-rent": "text-on-rent",
  available: "text-available",
  attention: "text-attention",
  "out-of-service": "text-out-of-service",
  neutral: "text-meta",
};

const TONE_TOP_BORDER: Record<AllocationTone, string> = {
  "on-rent": "border-t-on-rent",
  available: "border-t-available",
  attention: "border-t-attention-lane-edge",
  "out-of-service": "border-t-border-stronger",
  neutral: "border-t-border-stronger",
};

export interface AllocationSegment {
  key: string;
  count: number;
  /** Pre-formatted share, e.g. "60%" — shown next to the count, not used for sizing. */
  pct?: string;
  label: string;
  sub?: string;
  tone: AllocationTone;
  /** Relative flex-grow driving the segment's width — pass the fleet share so segment width matches segment size. */
  grow?: number;
}

export interface AllocationBarProps {
  /** The leading "total" tile — omitted if not needed. */
  total?: { count: number; label: string; sub?: string };
  segments: AllocationSegment[];
  /** Key of the currently-selected segment, or null/undefined for "all". */
  active?: string | null;
  onSelect?: (key: string | null) => void;
  className?: string;
}

export function AllocationBar({ total, segments, active, onSelect, className }: AllocationBarProps) {
  return (
    <div
      className={[
        "flex overflow-hidden rounded-panel border border-border-strong bg-surface",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {total && (
        <button
          type="button"
          onClick={() => onSelect?.(null)}
          disabled={!onSelect}
          className={[
            "flex w-[150px] flex-none flex-col gap-1 border-r border-border-soft px-4 py-3 text-left",
            !active ? "bg-surface-sunk" : "bg-surface",
            onSelect ? "cursor-pointer" : "cursor-default",
          ].join(" ")}
        >
          <span className="font-mono text-[27px] font-semibold leading-none tracking-tight text-ink">
            {total.count}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-meta">{total.label}</span>
          {total.sub && <span className="text-[11px] leading-tight text-meta-light">{total.sub}</span>}
        </button>
      )}
      {segments.map((segment) => {
        const isActive = active === segment.key;
        return (
          <button
            type="button"
            key={segment.key}
            onClick={() => onSelect?.(isActive ? null : segment.key)}
            disabled={!onSelect}
            style={{ flexGrow: segment.grow ?? 1 }}
            className={[
              "flex min-w-0 flex-1 flex-col gap-1 border-r border-t-[3px] border-border-soft px-4 py-3 text-left last:border-r-0",
              TONE_TOP_BORDER[segment.tone],
              isActive ? "bg-surface-sunk" : "bg-surface",
              onSelect ? "cursor-pointer" : "cursor-default",
            ].join(" ")}
          >
            <div className="flex items-baseline gap-1.5">
              <span
                className={["font-mono text-[27px] font-semibold leading-none tracking-tight", TONE_FG[segment.tone]].join(
                  " ",
                )}
              >
                {segment.count}
              </span>
              {segment.pct && <span className="font-mono text-[11px] text-meta">{segment.pct}</span>}
            </div>
            <span
              className={["text-[10px] font-semibold uppercase tracking-wider", TONE_FG[segment.tone]].join(" ")}
            >
              {segment.label}
            </span>
            {segment.sub && (
              <span className="truncate text-[11px] leading-tight text-meta">{segment.sub}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
