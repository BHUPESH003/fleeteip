import type { ReactNode } from "react";
import { cx } from "./cx";
import { Skeleton } from "./Skeleton";

export type FigureTone = "default" | "danger" | "warning" | "success" | "info" | "muted";

export interface KeyFigure {
  key: string;
  /** Uppercase label: "Contracted rate". */
  label: string;
  /** The figure itself, in mono: "₹48,000". */
  value: ReactNode;
  /** Unit as stored: "per day", "days", "h". */
  unit?: ReactNode;
  /** Context line — a number never appears without one. */
  context: ReactNode;
  tone?: FigureTone;
}

const TONE_CLASS: Record<FigureTone, string> = {
  default: "text-ink",
  danger: "text-destructive",
  warning: "text-attention",
  success: "text-available",
  info: "text-on-rent",
  muted: "text-disabled-text",
};

/**
 * Label / value / context cells (never a bare number). Cells are
 * flex: 1 1 180px so the last row stretches — no empty grey cells.
 */
export function KeyFigures({
  items,
  label = "Key figures",
  className,
}: {
  items: KeyFigure[];
  label?: string;
  className?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cx(
        "flex flex-wrap gap-px overflow-hidden rounded-panel border border-border-strong bg-border-soft",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.key} className="flex min-w-0 flex-[1_1_180px] flex-col gap-[5px] bg-surface px-4 py-3">
          <span className="text-[10px] font-semibold uppercase leading-[1.2] tracking-[0.1em] text-meta">
            {item.label}
          </span>
          <span className="flex flex-wrap items-baseline gap-1.5">
            <span className={cx("font-mono text-[19px] font-semibold leading-[1.1]", TONE_CLASS[item.tone ?? "default"])}>
              {item.value}
            </span>
            {item.unit && <span className="text-xs leading-none text-ink-muted">{item.unit}</span>}
          </span>
          <span className="text-[11px] leading-[1.4] text-meta">{item.context}</span>
        </div>
      ))}
    </section>
  );
}

export function KeyFiguresSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex h-[78px] gap-px overflow-hidden rounded-panel border border-border-soft bg-surface">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-1 flex-col gap-[9px] px-4 py-3.5">
          <div className="h-2 w-3/5 rounded-xs bg-[#eef0f2]" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ))}
    </div>
  );
}
