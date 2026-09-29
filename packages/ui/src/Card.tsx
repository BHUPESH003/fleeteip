"use client";

import { useId, type HTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export type CardPadding = "none" | "sm" | "md";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
}

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: "",
  sm: "px-4 py-3",
  md: "px-4 py-3.5",
};

export function Card({ padding = "md", className, ...props }: CardProps) {
  return (
    <div
      className={cx("rounded-panel border border-border-strong bg-surface", PADDING_CLASSES[padding], className)}
      {...props}
    />
  );
}

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  /** Mono count after the title. */
  count?: ReactNode;
  /** Small text after the title ("from catalogue product"). */
  subtitle?: ReactNode;
  icon?: IconName;
  iconClassName?: string;
  actions?: ReactNode;
  /** Body padding. Tables and lists use "none". */
  padding?: CardPadding;
  /** Rendered between header and body (tabs). */
  toolbar?: ReactNode;
  children?: ReactNode;
  /** Visually hide the header but keep it for assistive tech. */
  hideTitle?: boolean;
}

/** Card with a titled header — the standard section on every page. */
export function Panel({
  title,
  count,
  subtitle,
  icon,
  iconClassName,
  actions,
  padding = "md",
  toolbar,
  children,
  hideTitle,
  className,
  ...props
}: PanelProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      className={cx("min-w-0 overflow-hidden rounded-panel border border-border-strong bg-surface", className)}
      {...props}
    >
      {title && !hideTitle && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-border px-4 py-3">
          {icon && <Icon name={icon} size={15} className={cx("text-on-rent", iconClassName)} />}
          <h2 id={headingId} className="m-0 text-sm font-semibold leading-none text-ink">
            {title}
          </h2>
          {count !== undefined && <span className="font-mono text-xs font-medium text-meta-light">{count}</span>}
          {subtitle && <span className="text-[11px] leading-none text-meta">{subtitle}</span>}
          {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {title && hideTitle && (
        <h2 id={headingId} className="sr-only">
          {title}
        </h2>
      )}
      {toolbar}
      <div className={PADDING_CLASSES[padding]}>{children}</div>
    </section>
  );
}
