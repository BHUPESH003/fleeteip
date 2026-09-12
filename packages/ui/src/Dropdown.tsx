"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

export interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
}

/**
 * Minimal hand-rolled menu (trigger + outside-click-to-close panel). Covers
 * the org switcher and account menu without pulling in a headless-UI
 * dependency — revisit only if a future menu needs real keyboard nav or
 * nesting that this can't reasonably grow into.
 */
export function Dropdown({ trigger, children, align = "right" }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1"
      >
        {trigger}
      </button>
      {open && (
        <div
          className={[
            "absolute z-10 mt-2 min-w-[11rem] rounded-panel border border-border bg-surface py-1 shadow-[0_4px_12px_rgba(15,23,32,0.1)]",
            align === "right" ? "right-0" : "left-0",
          ].join(" ")}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={[
        "block w-full px-3 py-2 text-left text-sm text-ink-strong hover:bg-surface-sunk",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-inset",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}
