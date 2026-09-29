import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { Skeleton } from "./Skeleton";

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  /** Min width before the table scrolls horizontally (design: 620px in cards). */
  minWidth?: number;
  /** Render without the outer card border (when already inside a Panel). */
  bare?: boolean;
  /** Accessible caption (visually hidden). */
  caption?: string;
}

/** Real table semantics; scrolls horizontally inside its own box on narrow screens. */
export function Table({ minWidth, bare, caption, className, children, ...props }: TableProps) {
  return (
    <div
      className={cx(
        // relative: sr-only (absolute) header labels would otherwise escape the scroller and widen the page.
        "relative w-full overflow-x-auto",
        !bare && "rounded-panel border border-border-strong bg-surface",
      )}
    >
      <table
        className={cx("w-full border-collapse text-sm", className)}
        style={minWidth ? { minWidth } : undefined}
        {...props}
      >
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function Thead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cx("border-b border-border bg-surface-sunk", className)} {...props} />;
}

export function Tbody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export interface TrProps extends HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
  /** Hover highlight for clickable rows. */
  interactive?: boolean;
}

export function Tr({ className, selected, interactive, ...props }: TrProps) {
  return (
    <tr
      aria-selected={selected || undefined}
      className={cx(
        "border-b border-border last:border-0",
        selected && "bg-accent-wash",
        interactive && !selected && "hover:bg-surface-row-hover",
        className,
      )}
      {...props}
    />
  );
}

export type SortDirection = "asc" | "desc" | null;

export interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  sortDirection?: SortDirection;
  onSort?: () => void;
  align?: "left" | "right" | "center";
}

/** Column header. Sortable headers are buttons, and the <th> carries aria-sort. */
export function Th({ sortDirection, onSort, align = "left", className, children, ...props }: ThProps) {
  const base = cx(
    "h-8 whitespace-nowrap px-4 py-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-meta",
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
    className,
  );
  if (!onSort) {
    return (
      <th scope="col" className={base} {...props}>
        {children}
      </th>
    );
  }
  const ariaSort = sortDirection === "asc" ? "ascending" : sortDirection === "desc" ? "descending" : "none";
  return (
    <th scope="col" aria-sort={ariaSort} className={base} {...props}>
      <button
        type="button"
        onClick={onSort}
        className={cx(
          "inline-flex items-center gap-1 border-0 bg-transparent p-0 text-[10px] font-semibold uppercase tracking-[0.1em] hover:text-ink",
          sortDirection ? "text-ink" : "text-meta",
          align === "right" && "flex-row-reverse",
        )}
      >
        {children}
        <Icon
          name="chevron_down"
          size={11}
          className={cx(
            "transition-transform",
            sortDirection === "asc" && "rotate-180",
            !sortDirection && "opacity-35",
          )}
        />
      </button>
    </th>
  );
}

export interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  align?: "left" | "right" | "center";
}

/** 44px minimum row height; money/figures right-aligned via align="right". */
export function Td({ className, align, ...props }: TdProps) {
  return (
    <td
      className={cx(
        "h-11 px-4 py-2 align-middle text-ink-strong",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
      {...props}
    />
  );
}

/** Two-line primary cell: title (clamped to 2 lines with a tooltip) + optional sub line. */
export function CellStack({
  title,
  sub,
  titleClassName,
  mono,
}: {
  title: ReactNode;
  sub?: ReactNode;
  titleClassName?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span
        title={typeof title === "string" ? title : undefined}
        className={cx("clamp-2 leading-tight", mono ? "font-mono text-xs font-medium" : "text-sm font-medium text-ink-strong", titleClassName)}
      >
        {title}
      </span>
      {sub && <span className="truncate text-[11px] leading-tight text-meta-light">{sub}</span>}
    </div>
  );
}

/** Loading rows: same height as data (44px), header stays real, default 8 rows. */
export function TableSkeleton({
  columns,
  rows = 8,
  label = "Loading",
}: {
  columns: number;
  rows?: number;
  label?: string;
}) {
  return (
    <tbody aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row} className="border-b border-border last:border-0">
          {Array.from({ length: columns }, (_, col) => (
            <td key={col} className="h-11 px-4 py-2">
              <Skeleton className={cx("h-3", col === 0 ? "w-24" : col % 3 === 0 ? "w-16" : "w-[70%]")} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

/** Toolbar row above a table (search, filters) — swapped for BulkBar while rows are selected. */
export function TableToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "flex min-h-[46px] flex-wrap items-center gap-2 border-b border-border-soft bg-surface-sunk px-3.5 py-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Footer row under a table: "Showing 1–10 of 42" + pagination. */
export function TableFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "flex flex-wrap items-center gap-3 border-t border-border-soft bg-surface-sunk px-3.5 py-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
