import type { HTMLAttributes } from "react";
import { cx } from "./cx";

/** Placeholder block; pulses at 1.4 s like the design's skeletons. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cx("animate-fip-pulse rounded-xs bg-[#e6e9ed]", className)}
      {...props}
    />
  );
}
