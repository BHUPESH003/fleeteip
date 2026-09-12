"use client";

import { useEffect, useRef, type ReactNode } from "react";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  className?: string;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR = 'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Generalizes the overlay + slide-in panel pattern (previously hand-rolled
 * once inside MobileNav) into a reusable side drawer. Backs its
 * role="dialog" aria-modal="true" with real modal behavior: focus moves in
 * on open, Tab/Shift+Tab cycles within it, Escape closes, and focus returns
 * to whatever opened it.
 */
export function Drawer({ open, onClose, side = "right", className, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerElementRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    triggerElementRef.current = document.activeElement;
    panelRef.current?.focus();

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("keydown", handleKeydown);
      if (triggerElementRef.current instanceof HTMLElement) triggerElementRef.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-20 flex" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={[
          "relative z-10 flex h-full w-72 flex-col bg-surface shadow-[0_4px_24px_rgba(15,23,32,0.16)] focus:outline-none",
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
