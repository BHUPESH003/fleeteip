"use client";

import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";
import { IconButton } from "./Button";
import { cx } from "./cx";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  /** Panel width classes; right drawers default to min(440px, 100vw). */
  className?: string;
  /** Small line above the title, e.g. "Workshop record". */
  kicker?: ReactNode;
  /** Renders the standard header (kicker + h2 + close). Omit for custom content (mobile nav). */
  title?: ReactNode;
  /** Accessible name when there's no visible title. */
  label?: string;
  footer?: ReactNode;
  /** Wraps body + footer in <form noValidate>. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  /** False while a write is in flight — Esc/backdrop don't close. */
  dismissible?: boolean;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Side panel with real modal behaviour: focus moves in on open,
 * Tab/Shift+Tab cycle inside, Escape closes, focus returns to the opener.
 * Right drawers hold record details and short forms (logsheet).
 */
export function Drawer({
  open,
  onClose,
  side = "right",
  className,
  kicker,
  title,
  label,
  footer,
  onSubmit,
  dismissible = true,
  children,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    const panel = panelRef.current;
    const firstField = panel?.querySelector<HTMLElement>("[data-autofocus]");
    (firstField ?? panel)?.focus();

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (dismissibleRef.current) {
          event.stopPropagation();
          onCloseRef.current();
        }
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null,
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeydown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeydown);
      document.body.style.overflow = previousOverflow;
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  const content = (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer && (
        <div className="flex flex-none flex-wrap justify-end gap-2 border-t border-border bg-surface-sunk px-[18px] py-3">
          {footer}
        </div>
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-40 flex">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[rgba(15,23,32,0.28)]"
        onClick={() => dismissible && onClose()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : label}
        tabIndex={-1}
        className={cx(
          "relative z-10 flex h-full flex-col bg-surface focus:outline-none animate-fip-in",
          side === "right"
            ? "ml-auto w-[min(440px,100vw)] border-l border-border-control shadow-drawer"
            : "w-72 shadow-drawer",
          className,
        )}
      >
        {title && (
          <div className="flex flex-none items-start gap-2.5 border-b border-border px-[18px] py-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {kicker && <span className="text-[11px] font-medium leading-none text-meta">{kicker}</span>}
              <h2 id={titleId} className="m-0 break-words text-[17px] font-semibold leading-[1.2] text-ink">
                {title}
              </h2>
            </div>
            <IconButton
              icon="close"
              label="Close panel"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={!dismissible}
              noTooltip
            />
          </div>
        )}
        {onSubmit ? (
          <form noValidate onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
            {content}
          </form>
        ) : (
          content
        )}
      </div>
    </div>
  );
}
