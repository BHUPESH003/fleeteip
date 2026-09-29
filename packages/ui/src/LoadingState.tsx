import { cx } from "./cx";

export type LoadingStateSize = "panel" | "inline";

export interface LoadingStateProps {
  label?: string;
  size?: LoadingStateSize;
  className?: string;
}

/** Spinner + words. Prefer a layout-matching skeleton for pages and tables. */
export function LoadingState({ label = "Loading…", size = "panel", className }: LoadingStateProps) {
  return (
    <div
      role="status"
      className={cx(
        "flex items-center justify-center gap-2 text-sm text-meta",
        size === "panel" ? "py-12" : "py-2",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-border-control border-t-accent"
      />
      {label}
    </div>
  );
}
