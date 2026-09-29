import type { HTMLAttributes } from "react";
import { cx } from "./cx";

/** green = done/healthy · info = blue · warning = amber (waiting) · danger = red (money at risk) · neutral = gray */
export type BadgeTone = "success" | "warning" | "neutral" | "danger" | "info";
export type BadgeSize = "sm" | "md";
/**
 * `chip` = a value the database stores (dot + text on a tint).
 * `label` = a conclusion FleetIP derived (bare uppercase text, no chip),
 * so stored and derived values never look alike.
 */
export type BadgeVariant = "chip" | "label";

const TONE_CLASSES: Record<BadgeTone, { fg: string; bg: string; dot: string }> = {
  success: { fg: "text-available", bg: "bg-available-bg", dot: "bg-available" },
  info: { fg: "text-on-rent", bg: "bg-on-rent-bg", dot: "bg-on-rent" },
  warning: { fg: "text-attention", bg: "bg-attention-bg", dot: "bg-attention" },
  danger: { fg: "text-destructive", bg: "bg-destructive-chip", dot: "bg-destructive" },
  neutral: { fg: "text-out-of-service", bg: "bg-out-of-service-bg", dot: "bg-out-of-service" },
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: BadgeSize;
  variant?: BadgeVariant;
}

export function Badge({
  tone = "neutral",
  size = "md",
  variant = "chip",
  className,
  children,
  ...props
}: BadgeProps) {
  const t = TONE_CLASSES[tone];
  if (variant === "label") {
    return (
      <span
        className={cx(
          "inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold uppercase leading-none tracking-[0.06em]",
          t.fg,
          className,
        )}
        {...props}
      >
        {children}
      </span>
    );
  }
  // Amber and red dots are square, the others round — state survives
  // greyscale and colour-blindness, not just colour.
  const squareDot = tone === "warning" || tone === "danger";
  return (
    <span
      className={cx(
        "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-xs",
        size === "sm" ? "px-[7px] py-[3px]" : "px-[9px] py-1",
        t.bg,
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cx("h-1.5 w-1.5 flex-none", squareDot ? "rounded-[1px]" : "rounded-full", t.dot)}
      />
      <span className={cx("truncate text-[11px] font-semibold leading-none", t.fg)}>{children}</span>
    </span>
  );
}
