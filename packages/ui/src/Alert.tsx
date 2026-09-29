import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export type AlertTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE: Record<AlertTone, { box: string; icon: IconName; iconClass: string }> = {
  success: { box: "border-available-border bg-available-wash", icon: "success", iconClass: "text-available" },
  warning: { box: "border-attention-border bg-attention-bg", icon: "warning", iconClass: "text-attention" },
  danger: { box: "border-destructive-border bg-destructive-wash", icon: "error", iconClass: "text-sev-error" },
  info: { box: "border-on-rent/20 bg-on-rent-bg", icon: "info", iconClass: "text-on-rent" },
  neutral: { box: "border-border-strong bg-out-of-service-bg", icon: "info", iconClass: "text-out-of-service" },
};

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: AlertTone;
  title?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
}

/** Inline note inside a page or card. Icon + words, never colour alone. */
export function Alert({ tone = "info", title, icon, action, children, className, role, ...props }: AlertProps) {
  const t = TONE[tone];
  return (
    <div
      role={role ?? "note"}
      className={cx("flex items-start gap-2.5 rounded-panel border px-3.5 py-[11px]", t.box, className)}
      {...props}
    >
      <Icon name={icon ?? t.icon} size={16} className={cx("mt-px", t.iconClass)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm leading-[1.5] text-ink-body">
        {title && <p className="m-0 font-semibold text-ink">{title}</p>}
        {children && <div>{children}</div>}
      </div>
      {action && <div className="flex flex-none items-center gap-2">{action}</div>}
    </div>
  );
}

/**
 * Page banner: sits under the page header and stays until the condition
 * clears — offline, read-only, retired machine (UX pass §05).
 */
export function PageBanner({
  tone = "warning",
  icon,
  children,
  action,
  className,
}: {
  tone?: AlertTone;
  icon?: IconName;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const styles: Record<AlertTone, string> = {
    warning: "border-attention-border bg-attention-bg text-attention-strong",
    danger: "border-destructive-border bg-destructive-wash text-destructive",
    info: "border-on-rent/20 bg-on-rent-bg text-on-rent",
    success: "border-available-border bg-available-wash text-available",
    neutral: "border-border-strong bg-out-of-service-bg text-ink-body",
  };
  return (
    <div
      role="status"
      className={cx("flex flex-wrap items-center gap-2.5 border-b px-6 py-[9px] text-sm font-medium", styles[tone], className)}
    >
      <Icon name={icon ?? TONE[tone].icon} size={16} />
      <span className="min-w-[220px] flex-1 leading-[1.4]">{children}</span>
      {action}
    </div>
  );
}
