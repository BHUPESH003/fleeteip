"use client";

import { useId, useState, type ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";
import { UILink } from "./Link";

export type AttentionSeverity = "error" | "warning" | "info";

export interface AttentionAction {
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}

export interface AttentionListItem {
  key: string;
  severity: AttentionSeverity;
  title: ReactNode;
  context?: ReactNode;
  /** One action per row, at most. */
  action?: AttentionAction;
}

const SEVERITY: Record<AttentionSeverity, { icon: IconName; className: string; label: string; rank: number }> = {
  error: { icon: "error", className: "text-sev-error", label: "Urgent", rank: 0 },
  warning: { icon: "warning", className: "text-sev-warning", label: "Warning", rank: 1 },
  info: { icon: "info", className: "text-sev-info", label: "Information", rank: 2 },
};

export interface AttentionListProps {
  items: AttentionListItem[];
  title?: string;
  /** Right-aligned note, e.g. "Worked out when this page opened. FleetIP doesn't send reminders for these." */
  note?: ReactNode;
  /** Rows shown before "Show N more". */
  initialVisible?: number;
  className?: string;
}

/**
 * "Needs attention": one row per problem derived from loaded data, one
 * action per row, ordered by severity. Hidden entirely when empty. Not a
 * toast, not a banner.
 */
export function AttentionList({
  items,
  title = "Needs attention",
  note,
  initialVisible = 3,
  className,
}: AttentionListProps) {
  const [expanded, setExpanded] = useState(false);
  const headingId = useId();
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => SEVERITY[a.severity].rank - SEVERITY[b.severity].rank);
  const shown = expanded ? sorted : sorted.slice(0, initialVisible);
  const hidden = sorted.length - initialVisible;

  return (
    <section
      aria-labelledby={headingId}
      className={cx("overflow-hidden rounded-panel border border-accent-wash-border bg-surface", className)}
    >
      <div className="flex flex-wrap items-center gap-2.5 border-b border-accent-wash-divider bg-accent-wash px-4 py-[11px]">
        <h2 id={headingId} className="m-0 text-sm font-semibold leading-none text-ink">
          {title}
        </h2>
        <span className="font-mono text-xs font-semibold leading-none text-attention">{sorted.length}</span>
        {note && <span className="ml-auto text-[11px] leading-[1.3] text-accent-wash-note">{note}</span>}
      </div>
      <ul className="m-0 list-none p-0">
        {shown.map((item) => {
          const sev = SEVERITY[item.severity];
          return (
            <li
              key={item.key}
              className="grid grid-cols-[18px_minmax(0,1fr)] items-start gap-3 border-b border-accent-wash-row px-4 py-[11px] last:border-b-0 sm:grid-cols-[18px_minmax(0,1fr)_auto]"
            >
              <span className="pt-px">
                <Icon name={sev.icon} size={16} label={sev.label} className={sev.className} />
              </span>
              <div className="flex min-w-0 flex-col gap-[3px]">
                <span className="text-sm font-semibold leading-[1.35] text-ink">{item.title}</span>
                {item.context && <span className="text-xs leading-[1.5] text-ink-soft">{item.context}</span>}
              </div>
              {item.action && (
                <div className="col-start-2 sm:col-start-auto">
                  <AttentionActionButton action={item.action} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="h-[34px] w-full border-0 border-t border-accent-wash-row bg-surface pl-[46px] pr-4 text-left text-xs font-medium text-accent-text hover:bg-accent-wash focus-visible:outline-2 focus-visible:-outline-offset-2"
        >
          {expanded ? "Show fewer" : `Show ${hidden} more`}
        </button>
      )}
    </section>
  );
}

const ACTION_CLASS =
  "inline-flex h-7 items-center whitespace-nowrap rounded-cell border border-border-control bg-surface px-[11px] text-xs font-medium text-ink-strong no-underline hover:bg-surface-hover disabled:cursor-not-allowed disabled:text-disabled-text";

function AttentionActionButton({ action }: { action: AttentionAction }) {
  if (action.href && !action.disabled) {
    return (
      <UILink href={action.href} className={ACTION_CLASS}>
        {action.label}
      </UILink>
    );
  }
  return (
    <button type="button" onClick={action.onClick} disabled={action.disabled} className={ACTION_CLASS}>
      {action.label}
    </button>
  );
}
