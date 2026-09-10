import type { ReactNode } from "react";

export interface ErrorStateProps {
  message: string;
  action?: ReactNode;
}

export function ErrorState({ message, action }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50 px-6 py-8 text-center">
      <p className="text-sm text-red-700">{message}</p>
      {action}
    </div>
  );
}
