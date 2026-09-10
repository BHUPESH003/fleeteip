import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-6 py-12 text-center">
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {description && <p className="text-sm text-gray-500">{description}</p>}
      {action}
    </div>
  );
}
