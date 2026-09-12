import type { HTMLAttributes } from "react";

export type AlertTone = "success" | "warning" | "danger" | "info";

const TONE_CLASSES: Record<AlertTone, string> = {
  success: "border-success/25 bg-success-bg text-success",
  warning: "border-warning/25 bg-warning-bg text-warning",
  danger: "border-danger-border bg-danger-bg text-danger",
  info: "border-info/25 bg-info-bg text-info",
};

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: AlertTone;
  title?: string;
}

export function Alert({ tone = "info", title, children, className, ...props }: AlertProps) {
  return (
    <div
      className={["rounded-panel border p-4 text-sm", TONE_CLASSES[tone], className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? "mt-1" : undefined}>{children}</div>
    </div>
  );
}
