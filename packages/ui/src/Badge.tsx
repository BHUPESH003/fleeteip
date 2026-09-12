import type { HTMLAttributes } from "react";

export type BadgeTone = "success" | "warning" | "neutral" | "danger" | "info";

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  neutral: "bg-neutral-bg text-neutral",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-xs px-2.5 py-1 text-xs font-semibold",
        TONE_CLASSES[tone],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {children}
    </span>
  );
}
