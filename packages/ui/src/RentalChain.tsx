import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";
import { UILink } from "./Link";

export type ChainTone = "blue" | "green" | "amber" | "red" | "gray";

export interface ChainStep {
  key: string;
  /** "Work order", "Mobilization"… */
  label: string;
  icon: IconName;
  /** The step's own stored status in words, e.g. "Delivered", "1 overdue". */
  state: string;
  tone: ChainTone;
  /** Small mono line: reference, date, count. */
  meta?: string;
  /** The next step to act on — gets the only orange underline. */
  next?: boolean;
  href?: string;
}

const TONE_CLASS: Record<ChainTone, string> = {
  blue: "text-on-rent",
  green: "text-available",
  amber: "text-attention",
  red: "text-destructive",
  gray: "text-meta-light",
};

/**
 * "Where this rental is": an ordered list of steps, each reading its own
 * stored status — nothing is cascaded. The next step is highlighted and
 * announced as the current step.
 */
export function RentalChain({
  steps,
  label = "Where this rental is",
  note,
  className,
}: {
  steps: ChainStep[];
  label?: string;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-meta">
        {label}
        {note && <span className="font-normal normal-case tracking-normal text-meta-light">{note}</span>}
      </div>
      <ol
        aria-label={label}
        className="m-0 grid list-none gap-px overflow-hidden rounded-cell border border-border-soft bg-border-soft p-0"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))" }}
      >
        {steps.map((step) => {
          const inner = (
            <>
              <span className="flex items-center gap-1.5 text-[11px] font-medium leading-[1.2] text-ink-muted">
                <Icon name={step.icon} size={13} className="text-meta" />
                {step.label}
              </span>
              <span className={cx("truncate text-xs font-semibold leading-[1.25]", TONE_CLASS[step.tone])}>
                {step.state}
              </span>
              {step.meta && (
                <span className="truncate font-mono text-[11px] leading-[1.3] text-meta-light">{step.meta}</span>
              )}
            </>
          );
          return (
            <li
              key={step.key}
              aria-current={step.next ? "step" : undefined}
              className={cx(
                "flex min-w-0 flex-col gap-[5px] px-2.5 py-[9px]",
                step.next ? "bg-next-step shadow-[inset_0_-2px_0_var(--color-accent)]" : "bg-surface",
              )}
            >
              {step.href ? (
                <UILink href={step.href} className="flex min-w-0 flex-col gap-[5px] no-underline hover:underline">
                  {inner}
                </UILink>
              ) : (
                inner
              )}
              {step.next && <span className="sr-only">Next step</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
