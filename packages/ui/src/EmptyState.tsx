import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Module glyph shown in a tile (page-level empties). */
  icon?: IconName;
  /**
   * `inline` — left-aligned text inside a card/tab (default).
   * `page` — centred with an icon tile, for a whole list with no records.
   */
  variant?: "inline" | "page";
}

/**
 * Two kinds of empty, never confused (UX pass §09):
 * first-run ("No machines yet — register your first") vs filtered
 * ("No machines match Boom pump · Retired. Clear filters").
 * Both are just copy + action choices at the call site.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  variant = "inline",
  className,
  ...props
}: EmptyStateProps) {
  if (variant === "page") {
    return (
      <div
        className={cx("flex flex-col items-center justify-center gap-2.5 px-6 py-14 text-center", className)}
        {...props}
      >
        {icon && (
          <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-control border border-tile-border bg-tile text-tile-icon">
            <Icon name={icon} size={22} strokeWidth={1.4} />
          </span>
        )}
        <p className="m-0 text-[15px] font-semibold text-ink">{title}</p>
        {description && <p className="m-0 max-w-[56ch] text-sm leading-[1.55] text-ink-soft">{description}</p>}
        {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
      </div>
    );
  }
  return (
    <div className={cx("flex flex-col items-start gap-1.5 px-4 py-[26px]", className)} {...props}>
      <p className="m-0 text-sm font-semibold leading-[1.3] text-ink">{title}</p>
      {description && <p className="m-0 max-w-[62ch] text-sm leading-[1.55] text-ink-soft">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}
