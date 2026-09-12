import type { HTMLAttributes, ReactNode } from "react";

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action, className, ...props }: EmptyStateProps) {
  return (
    <div
      className={[
        "flex flex-col items-center justify-center gap-2 rounded-panel border border-dashed border-border-strong bg-surface-sunk px-6 py-12 text-center",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="text-sm text-meta">{description}</p>}
      {action}
    </div>
  );
}
