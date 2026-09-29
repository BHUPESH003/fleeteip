import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { UILink } from "./Link";

export interface Breadcrumb {
  label: string;
  href?: string;
  /** Codes (asset code, invoice number) render in mono. */
  mono?: boolean;
}

export interface PageHeaderProps {
  title: ReactNode;
  /** h1 in IBM Plex Mono — for record pages whose name is a code (MCH-00231). */
  titleMono?: boolean;
  /** Line under the title (model line, count, one-sentence purpose). */
  description?: ReactNode;
  /**
   * The first crumb with an href gets a back arrow; the last crumb is the
   * current page (aria-current). Back links should restore list filters —
   * pass the remembered list URL (apps/web lib/list-state.ts).
   */
  breadcrumbs?: Breadcrumb[];
  /** Right side of the breadcrumb row. */
  note?: ReactNode;
  /** Identity tile left of the title (category glyph). */
  leading?: ReactNode;
  /** Status chips etc. on the title line. */
  meta?: ReactNode;
  /** Extra rows under the title block (identity <dl>). */
  children?: ReactNode;
  /** One state-aware primary, a secondary or two, and the More menu. */
  actions?: ReactNode;
  className?: string;
}

/** Full-width white page header band (Machine Detail v2 header). */
export function PageHeader({
  title,
  titleMono,
  description,
  breadcrumbs,
  note,
  leading,
  meta,
  children,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cx(
        "flex flex-col gap-3.5 border-b border-border-header bg-surface px-6 pb-4 pt-3.5 max-[760px]:px-4",
        className,
      )}
    >
      {(breadcrumbs?.length || note) && (
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-[7px] text-xs leading-none text-meta">
          {breadcrumbs?.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <span key={`${crumb.label}-${index}`} className="inline-flex items-center gap-[7px]">
                {index > 0 && (
                  <span aria-hidden="true" className="text-separator-text">
                    /
                  </span>
                )}
                {crumb.href && !isLast ? (
                  <UILink
                    href={crumb.href}
                    className="inline-flex items-center gap-[5px] text-ink-muted no-underline hover:text-ink hover:underline"
                  >
                    {index === 0 && <Icon name="back" size={14} className="text-meta" />}
                    {crumb.label}
                  </UILink>
                ) : (
                  <span
                    aria-current={isLast ? "page" : undefined}
                    className={cx(isLast && "font-medium text-ink-strong", crumb.mono && "font-mono")}
                  >
                    {crumb.label}
                  </span>
                )}
              </span>
            );
          })}
          {note && <span className="ml-auto text-[11px] leading-none text-meta-light">{note}</span>}
        </nav>
      )}
      <div className="flex flex-wrap items-start gap-4">
        {leading}
        <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-[7px]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1
              className={cx(
                "m-0 text-[22px] font-semibold leading-[1.1] text-ink",
                titleMono && "font-mono tracking-[-0.01em]",
              )}
            >
              {title}
            </h1>
            {meta}
          </div>
          {description && <div className="text-sm leading-[1.45] text-ink-soft">{description}</div>}
          {children}
        </div>
        {actions && <div className="relative flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** Page content column under the header: 16px 24px 32px padding, 14px gap. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-3.5 px-6 pb-8 pt-4 max-[760px]:px-4", className)}>{children}</div>
  );
}

/** 52×52 identity tile holding the category glyph. */
export function IdentityTile({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div
      title={title}
      className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-control border border-tile-border bg-tile text-tile-icon"
    >
      {children}
    </div>
  );
}
