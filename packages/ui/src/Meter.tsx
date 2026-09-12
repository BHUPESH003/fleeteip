import type { BadgeTone } from "./Badge";

export interface MeterSegment {
  label: string;
  count: number;
  pct: number;
  tone: BadgeTone;
}

const TONE_FG: Record<BadgeTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-neutral",
};

export interface MeterProps {
  segments: MeterSegment[];
}

/** Stacked horizontal bar + legend, e.g. fleet availability mix. */
export function Meter({ segments }: MeterProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-2.5 overflow-hidden rounded-xs">
        {segments.map((segment) => (
          <div
            key={segment.label}
            className={TONE_FG[segment.tone]}
            style={{ width: `${segment.pct}%` }}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-3.5 gap-y-2">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-2">
            <span className={["h-1.5 w-1.5 shrink-0 rounded-full", TONE_FG[segment.tone]].join(" ")} />
            <span className="flex-1 text-xs text-ink-muted">{segment.label}</span>
            <span className="font-mono text-sm font-medium text-ink">{segment.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
