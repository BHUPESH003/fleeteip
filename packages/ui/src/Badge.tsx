import type { HTMLAttributes } from "react";

export type BadgeTone = "success" | "warning" | "neutral" | "danger";

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  neutral: "bg-gray-200 text-gray-600",
  danger: "bg-red-100 text-red-800",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}
