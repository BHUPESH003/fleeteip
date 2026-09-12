"use client";

import type { ReactNode } from "react";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  className?: string;
  children: ReactNode;
}

/**
 * Generalizes the overlay + slide-in panel pattern (previously hand-rolled
 * once inside MobileNav) into a reusable side drawer.
 */
export function Drawer({ open, onClose, side = "right", className, children }: DrawerProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-20 flex" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div
        className={[
          "relative z-10 flex h-full w-72 flex-col bg-surface shadow-[0_4px_24px_rgba(15,23,32,0.16)]",
          side === "right" ? "ml-auto" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </div>
    </div>
  );
}
