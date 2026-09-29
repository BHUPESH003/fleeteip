import { cx } from "./cx";

export type MeterTone = "success" | "warning" | "danger" | "info" | "neutral" | "operating" | "idle" | "overtime";

export interface MeterSegment {
  label: string;
  /** Display value, e.g. "2,486.5 h" or 12. */
  count: number | string;
  /** Share of the bar, 0–100. */
  pct: number;
  tone: MeterTone;
  /** Optional right-hand share text, e.g. "73%". */
  share?: string;
}

const TONE_BG: Record<MeterTone, string> = {
  success: "bg-available",
  warning: "bg-attention",
  danger: "bg-destructive",
  info: "bg-on-rent",
  neutral: "bg-out-of-service",
  operating: "bg-util-operating",
  idle: "bg-util-idle",
  overtime: "bg-util-overtime",
};

export interface MeterProps {
  segments: MeterSegment[];
  /** `rows` = one row per segment (aside); `grid` = two-column legend. */
  layout?: "rows" | "grid";
  className?: string;
}

/** Stacked bar + labelled rows (square swatches, so it survives greyscale). */
export function Meter({ segments, layout = "rows", className }: MeterProps) {
  return (
    <div className={cx("flex flex-col gap-2.5", className)}>
      <div aria-hidden="true" className="flex h-2 overflow-hidden rounded-xs bg-surface-hover">
        {segments.map((segment) => (
          <div key={segment.label} className={TONE_BG[segment.tone]} style={{ width: `${segment.pct}%` }} />
        ))}
      </div>
      <dl className={cx("m-0", layout === "grid" ? "grid grid-cols-2 gap-x-3.5 gap-y-2" : "flex flex-col gap-2")}>
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-baseline gap-2">
            <span aria-hidden="true" className={cx("h-2 w-2 flex-none rounded-[1px]", TONE_BG[segment.tone])} />
            <dt className="flex-1 text-xs leading-[1.3] text-ink-muted">{segment.label}</dt>
            <dd className="m-0 font-mono text-sm font-semibold leading-none text-ink">{segment.count}</dd>
            {segment.share !== undefined && (
              <span className="w-[34px] text-right font-mono text-[11px] leading-none text-meta-light">{segment.share}</span>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}
