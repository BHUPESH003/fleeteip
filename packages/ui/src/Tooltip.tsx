import type { ReactNode } from "react";
import { cx } from "./cx";

export type TooltipSide = "top" | "bottom" | "right" | "left";

const SIDE_CLASSES: Record<TooltipSide, string> = {
  top: "bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2",
  bottom: "top-[calc(100%+6px)] left-1/2 -translate-x-1/2",
  right: "left-[calc(100%+8px)] top-1/2 -translate-y-1/2",
  left: "right-[calc(100%+8px)] top-1/2 -translate-y-1/2",
};

export interface TooltipProps {
  /** Short text; the trigger must already carry the same accessible name. */
  content: ReactNode;
  side?: TooltipSide;
  children: ReactNode;
  className?: string;
}

/**
 * Visual-only tooltip shown on hover and on keyboard focus. The wrapped
 * control keeps its own accessible name (aria-label), so the bubble is
 * hidden from assistive tech to avoid announcing it twice. CSS-only — no
 * positioning library.
 */
export function Tooltip({ content, side = "bottom", children, className }: TooltipProps) {
  return (
    <span className={cx("group/tt relative inline-flex", className)}>
      {children}
      <span
        aria-hidden="true"
        className={cx(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-cell bg-rail px-2 py-1 text-[11px] font-medium leading-tight text-white opacity-0 shadow-menu transition-opacity duration-100",
          "group-hover/tt:opacity-100 group-has-[:focus-visible]/tt:opacity-100",
          SIDE_CLASSES[side],
        )}
      >
        {content}
      </span>
    </span>
  );
}
