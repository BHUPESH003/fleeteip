"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";

export interface DropdownProps {
  trigger: ReactNode;
  /** Accessible name for the trigger button (its content is often an icon or initials). */
  triggerLabel?: string;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "left" | "right";
  panelClassName?: string;
  triggerClassName?: string;
  /** Close when anything inside the panel is clicked. Default true. */
  closeOnClick?: boolean;
}

/**
 * Popover panel with free-form content (notifications, account, org
 * switcher). For action lists use `Menu`, which has menu semantics.
 */
export function Dropdown({
  trigger,
  triggerLabel,
  children,
  align = "right",
  panelClassName,
  triggerClassName,
  closeOnClick = true,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
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

  const close = () => setOpen(false);

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={triggerLabel}
        onClick={() => setOpen((value) => !value)}
        className={cx("flex items-center rounded-control", triggerClassName)}
      >
        {trigger}
      </button>
      {open && (
        <div
          className={cx(
            "absolute top-[calc(100%+6px)] z-30 min-w-[11rem] rounded-panel border border-border-control bg-surface py-1 shadow-menu animate-fip-in",
            align === "right" ? "right-0" : "left-0",
            panelClassName,
          )}
          onClick={closeOnClick ? close : undefined}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cx(
        "block w-full px-3 py-2 text-left text-sm text-ink-strong hover:bg-surface-page focus-visible:outline-2 focus-visible:-outline-offset-2",
        className,
      )}
      {...props}
    />
  );
}
