import { cx } from "@fleetip/ui";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The frame for every page outside the tenant shell that a visitor may
 * see signed out: sign in, sign up, invite links, and the app-wide 404/500
 * pages. No hooks, so it also works in server components.
 */

/** FleetIP wordmark on the dark band, linking home. */
export function Wordmark({ suffix }: { suffix?: string }) {
  return (
    <header className="flex h-12 flex-none items-center gap-2.5 bg-rail px-4 min-[760px]:px-6">
      <Link href="/" className="flex items-center gap-2.5 rounded-cell no-underline focus-visible:!outline-focus-on-dark">
        <span aria-hidden="true" className="h-[22px] w-[22px] flex-none rounded-cell bg-accent" />
        <span className="text-sm font-bold text-white">FleetIP</span>
      </Link>
      {suffix && <span className="truncate text-xs text-rail-tag">· {suffix}</span>}
    </header>
  );
}

export function AuthShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface-page">
      <Wordmark />
      <main id="main" className="flex flex-1 justify-center px-4 py-10 min-[760px]:py-16">
        <div className={cx("flex w-full flex-col gap-4", wide ? "max-w-[520px]" : "max-w-[440px]")}>{children}</div>
      </main>
    </div>
  );
}

/** White card with a titled header, body and an optional footer line (links between auth pages). */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section aria-labelledby="auth-card-title" className="overflow-hidden rounded-panel border border-border-strong bg-surface">
      <div className="flex flex-col gap-1.5 border-b border-border px-5 pb-4 pt-5">
        <h1 id="auth-card-title" className="m-0 text-[20px] font-semibold leading-[1.25] text-ink">
          {title}
        </h1>
        {description && <div className="text-sm leading-[1.5] text-ink-soft">{description}</div>}
      </div>
      <div className="flex flex-col gap-3.5 px-5 py-5">{children}</div>
      {footer && <div className="border-t border-border bg-surface-sunk px-5 py-3.5 text-sm leading-[1.5] text-ink-soft">{footer}</div>}
    </section>
  );
}

export const AUTH_LINK = "font-medium text-accent-text no-underline hover:text-accent-text-hover hover:underline";

export const LINK_PRIMARY =
  "inline-flex h-[34px] items-center justify-center gap-[7px] rounded-control bg-accent px-[15px] text-sm font-semibold text-white no-underline hover:bg-accent-press";

export const LINK_SECONDARY =
  "inline-flex h-[34px] items-center justify-center gap-[7px] rounded-control border border-border-control bg-surface px-[13px] text-sm font-medium text-ink-strong no-underline hover:bg-surface-hover";
