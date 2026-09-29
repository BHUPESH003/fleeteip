import type { ReactNode } from "react";
import { cx } from "./cx";

export interface DescriptionItem {
  key?: string;
  label: string;
  /** null/undefined/"" renders "Not specified" — never a blank. */
  value: ReactNode | null | undefined;
  /** Codes, dates, money, counts. */
  mono?: boolean;
  /** Replaces the default "Not specified" text for this item. */
  emptyText?: string;
  /** Span the full row in grid layout (long text). */
  wide?: boolean;
}

export type DescriptionLayout = "grid" | "rows" | "inline" | "stacked";

function isEmpty(value: ReactNode | null | undefined) {
  return value === null || value === undefined || value === "" || value === false;
}

/**
 * Labelled values. Replaces the Field/TermCell/StatRow helpers that were
 * copy-pasted per page.
 * - grid: boxed cells, auto-fill minmax(180px, 1fr) — rental terms.
 * - rows: label left, value right — aside facts, drawers.
 * - inline: dt/dd pairs on one wrapping line — header identity.
 * - stacked: label above value, no boxes — card bodies.
 */
export function DescriptionList({
  items,
  layout = "grid",
  className,
  minColumnWidth = 180,
}: {
  items: DescriptionItem[];
  layout?: DescriptionLayout;
  className?: string;
  minColumnWidth?: number;
}) {
  const renderValue = (item: DescriptionItem) =>
    isEmpty(item.value) ? (
      <span className="italic text-disabled-text">{item.emptyText ?? "Not specified"}</span>
    ) : (
      item.value
    );

  if (layout === "inline") {
    return (
      <dl className={cx("m-0 flex flex-wrap items-baseline gap-x-[18px] gap-y-1.5", className)}>
        {items.map((item) => (
          <div key={item.key ?? item.label} className="flex items-baseline gap-1.5">
            <dt className="text-[11px] leading-none text-meta-light">{item.label}</dt>
            <dd className={cx("m-0 text-xs font-medium leading-none text-ink-strong", item.mono && "font-mono")}>
              {renderValue(item)}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  if (layout === "rows") {
    return (
      <dl className={cx("m-0 flex flex-col gap-2", className)}>
        {items.map((item) => (
          <div key={item.key ?? item.label} className="flex items-baseline gap-2.5">
            <dt className="flex-1 text-xs leading-[1.35] text-ink-muted">{item.label}</dt>
            <dd
              className={cx(
                "m-0 max-w-[60%] text-right text-xs leading-[1.35] text-ink",
                item.mono ? "font-mono font-medium" : "font-medium",
              )}
            >
              {renderValue(item)}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  if (layout === "stacked") {
    return (
      <dl
        className={cx("m-0 grid gap-x-7 gap-y-3.5", className)}
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))` }}
      >
        {items.map((item) => (
          <div key={item.key ?? item.label} className={cx("flex min-w-0 flex-col gap-1", item.wide && "col-span-full")}>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-meta">{item.label}</dt>
            <dd className={cx("m-0 break-words text-sm leading-[1.4] text-ink", item.mono && "font-mono")}>
              {renderValue(item)}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <dl
      className={cx("m-0 grid gap-px overflow-hidden rounded-cell border border-border bg-border", className)}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))` }}
    >
      {items.map((item) => (
        <div
          key={item.key ?? item.label}
          className={cx("flex min-w-0 flex-col gap-1 bg-surface px-3 py-[9px]", item.wide && "col-span-full")}
        >
          <dt className="text-[11px] leading-[1.2] text-meta">{item.label}</dt>
          <dd
            className={cx(
              "m-0 break-words text-sm leading-[1.35] text-ink",
              item.mono && "font-mono text-[13px] font-medium",
            )}
          >
            {renderValue(item)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
