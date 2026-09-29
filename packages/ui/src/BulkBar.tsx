import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Selection swaps the table toolbar for this bar — it never adds a
 * second toolbar (UX pass §09). "3 machines selected of 214 matching…".
 */
export function BulkBar({
  count,
  noun,
  context,
  actions,
  onClear,
  className,
}: {
  count: number;
  /** Plural noun, e.g. "machines". */
  noun: string;
  /** e.g. "of 214 matching “Boom pump · Available”" */
  context?: ReactNode;
  actions?: ReactNode;
  onClear: () => void;
  className?: string;
}) {
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className={cx("flex min-h-[46px] flex-wrap items-center gap-3 bg-rail px-3.5 py-2", className)}
    >
      <span
        aria-hidden="true"
        className="flex h-3.5 w-3.5 items-center justify-center rounded-xs bg-accent"
      >
        <span className="h-0.5 w-2 bg-white" />
      </span>
      <span className="text-sm font-semibold text-white" aria-live="polite">
        {count} {count === 1 ? noun.replace(/s$/, "") : noun} selected
      </span>
      {context && <span className="text-xs text-rail-tag">{context}</span>}
      <span className="ml-auto flex flex-wrap items-center gap-2">
        {actions}
        <button
          type="button"
          onClick={onClear}
          className="h-7 rounded-cell border-0 bg-transparent px-[9px] text-xs font-medium text-rail-body hover:text-white focus-visible:!outline-focus-on-dark"
        >
          Clear
        </button>
      </span>
    </div>
  );
}

/** Buttons styled for the dark bulk bar. */
export function BulkBarButton({
  primary,
  children,
  disabled,
  title,
  onClick,
}: {
  primary?: boolean;
  children: ReactNode;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cx(
        "h-7 rounded-cell px-[11px] text-xs focus-visible:!outline-focus-on-dark disabled:cursor-not-allowed disabled:opacity-50",
        primary
          ? "border-0 bg-accent font-semibold text-white hover:bg-accent-press"
          : "border border-rail-control-border bg-transparent font-medium text-white hover:bg-rail-active",
      )}
    >
      {children}
    </button>
  );
}
