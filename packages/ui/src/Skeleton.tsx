import type { HTMLAttributes } from "react";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["animate-pulse rounded-xs bg-neutral-bg", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}
