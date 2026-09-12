import type { HTMLAttributes, ReactNode } from "react";

export interface ErrorStateProps extends HTMLAttributes<HTMLDivElement> {
  message: string;
  action?: ReactNode;
}

export function ErrorState({ message, action, className, ...props }: ErrorStateProps) {
  return (
    <div
      className={[
        "flex flex-col items-center justify-center gap-3 rounded-panel border border-danger-border bg-danger-bg px-6 py-8 text-center",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      <p className="text-sm text-danger">{message}</p>
      {action}
    </div>
  );
}
