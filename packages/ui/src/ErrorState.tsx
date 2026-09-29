import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";

export interface ErrorStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Plain sentence: what didn't happen. */
  title?: ReactNode;
  /** Whose problem it is and the one next step. */
  message: ReactNode;
  action?: ReactNode;
}

/**
 * A section (or small page) that couldn't load. Raw API text never reaches
 * the screen — pass a translated message (apps/web lib/errors.ts).
 */
export function ErrorState({ title, message, action, className, ...props }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cx(
        "flex items-start gap-3 rounded-panel border border-destructive-border bg-destructive-wash px-4 py-3.5",
        className,
      )}
      {...props}
    >
      <Icon name="error" size={16} className="mt-px text-sev-error" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <p className="m-0 text-sm font-semibold text-ink">{title}</p>}
        <p className="m-0 text-sm leading-[1.5] text-ink-body">{message}</p>
        {action && <div className="mt-1.5 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}

export interface PageErrorProps {
  /** Code line, e.g. "404 · Not found". */
  code: string;
  title: ReactNode;
  body: ReactNode;
  primary?: ReactNode;
  secondary?: ReactNode;
  /** Optional reference line (only when the server provides a request id). */
  reference?: ReactNode;
}

/** Full-page 403 / 404 / 500: code line, plain title, body, primary + secondary action. */
export function PageError({ code, title, body, primary, secondary, reference }: PageErrorProps) {
  return (
    <main className="flex flex-1 items-start justify-center px-6 py-24">
      <section aria-labelledby="page-error-title" className="flex max-w-[520px] flex-col gap-3.5">
        <span className="font-mono text-xs font-semibold text-meta">{code}</span>
        <h1 id="page-error-title" className="m-0 text-2xl font-semibold leading-[1.25] text-ink">
          {title}
        </h1>
        <p className="m-0 text-[14px] leading-[1.6] text-ink-muted">{body}</p>
        {(primary || secondary) && (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {primary}
            {secondary}
          </div>
        )}
        {reference && <span className="font-mono text-xs text-meta-light">{reference}</span>}
      </section>
    </main>
  );
}
