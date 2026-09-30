"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, IconButton } from "./Button";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";
import { UILink } from "./Link";

export interface MenuItem {
  key: string;
  label: string;
  /** One-line explanation under the label; for a disabled item, the reason. */
  hint?: string;
  icon?: IconName;
  onSelect?: () => void;
  href?: string;
  /** Disabled items stay visible and say why (in `hint`). */
  disabled?: boolean;
  danger?: boolean;
  /** Draws a separator above this item. */
  separatorBefore?: boolean;
}

export interface MenuProps {
  items: MenuItem[];
  /** Accessible name of the trigger, e.g. "More actions for MCH-00231". */
  label: string;
  /** Icon-only trigger (default "more"). Ignored when `triggerText` is set. */
  triggerIcon?: IconName;
  /** Text trigger instead of an icon button. */
  triggerText?: string;
  triggerVariant?: "secondary" | "ghost";
  triggerSize?: "sm" | "md";
  align?: "left" | "right";
  /** Panel width in px. Items with hints read best at 292–320. */
  width?: number;
  className?: string;
}

/**
 * Overflow menu (menu button pattern): aria-haspopup="menu", arrow-key
 * navigation, Home/End, Esc returns focus to the trigger, Tab closes.
 * Disabled items remain focusable so their reason can be read.
 */
export function Menu({
  items,
  label,
  triggerIcon = "more",
  triggerText,
  triggerVariant = "secondary",
  triggerSize = "md",
  align = "right",
  width = 292,
  className,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const menuId = useId();

  function focusItem(index: number) {
    const count = items.length;
    if (count === 0) return;
    const next = ((index % count) + count) % count;
    itemRefs.current[next]?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // The panel is portalled out (position: fixed) so a table's or
  // card's overflow can't clip it. Placed under the trigger, flipped above
  // when there's no room below, and kept inside the viewport.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    function place() {
      const trigger = triggerRef.current?.getBoundingClientRect();
      if (!trigger || !panel) return;
      const gap = 6;
      const edge = 12;
      const panelWidth = Math.min(width, window.innerWidth - edge * 2);
      panel.style.width = `${panelWidth}px`;
      const height = panel.offsetHeight;
      const below = trigger.bottom + gap;
      const above = trigger.top - gap - height;
      const preferred = align === "right" ? trigger.right - panelWidth : trigger.left;
      panel.style.top = `${below + height > window.innerHeight - edge && above >= edge ? above : below}px`;
      panel.style.left = `${Math.min(Math.max(preferred, edge), window.innerWidth - panelWidth - edge)}px`;
    }
    place();
    // Follow the trigger when the page or a table scrolls, or the window resizes.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    const firstEnabled = items.findIndex((item) => !item.disabled);
    focusItem(firstEnabled >= 0 ? firstEnabled : 0);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
    // focusItem reads refs only; items are read once when the menu opens.
  }, [open, align, width]);

  // Focus goes back after the re-render: the trigger's tooltip wrapper
  // changes with `open`, so the element focused before may be replaced.
  const returnFocusRef = useRef(false);
  useEffect(() => {
    if (open || !returnFocusRef.current) return;
    returnFocusRef.current = false;
    triggerRef.current?.focus();
  }, [open]);

  function close(returnFocus = true) {
    returnFocusRef.current = returnFocus;
    setOpen(false);
  }

  function onMenuKeyDown(event: React.KeyboardEvent) {
    const current = itemRefs.current.findIndex((el) => el === document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(current + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(current - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusItem(items.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  const triggerProps = {
    ref: triggerRef,
    "aria-haspopup": "menu" as const,
    "aria-expanded": open,
    "aria-controls": open ? menuId : undefined,
    onClick: () => setOpen((value) => !value),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "ArrowDown" && !open) {
        event.preventDefault();
        setOpen(true);
      }
    },
  };

  return (
    <div ref={containerRef} className={cx("relative inline-flex", className)}>
      {triggerText ? (
        <Button variant={triggerVariant === "ghost" ? "tertiary" : "secondary"} size={triggerSize} iconRight="chevron_down" aria-label={label} {...triggerProps}>
          {triggerText}
        </Button>
      ) : (
        <IconButton
          icon={triggerIcon}
          label={label}
          variant={triggerVariant}
          size={triggerSize}
          noTooltip={open}
          tooltipSide="bottom"
          {...triggerProps}
        />
      )}
      {open && createPortal(
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="fixed z-50 rounded-panel border border-border-control bg-surface py-[5px] shadow-menu animate-fip-in"
        >
          {items.map((item, index) => {
            const itemClass = cx(
              "flex w-full items-start gap-2.5 border-0 bg-transparent px-3.5 py-2 text-left no-underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
              item.disabled
                ? "cursor-not-allowed"
                : item.danger
                  ? "cursor-pointer hover:bg-destructive-bg"
                  : "cursor-pointer hover:bg-surface-page",
            );
            const fg = item.disabled ? "text-disabled-text" : item.danger ? "text-destructive" : "text-ink-strong";
            const content = (
              <>
                {item.icon && <Icon name={item.icon} size={15} className={cx("mt-px", fg)} />}
                <span className="flex min-w-0 flex-col gap-[3px]">
                  <span className={cx("text-sm font-medium leading-tight", fg)}>{item.label}</span>
                  {item.hint && <span className="text-[11px] leading-[1.4] text-meta-light">{item.hint}</span>}
                </span>
              </>
            );
            return (
              <div key={item.key} role="none">
                {item.separatorBefore && <div role="separator" className="my-[5px] h-px bg-border" />}
                {item.href && !item.disabled ? (
                  <UILink
                    href={item.href}
                    role="menuitem"
                    tabIndex={-1}
                    className={itemClass}
                    onClick={() => close(false)}
                  >
                    {/* The ref lands on the <a> (this span's parent) so arrow keys can focus it. */}
                    <span
                      ref={(el) => {
                        itemRefs.current[index] = el?.parentElement ?? null;
                      }}
                      className="contents"
                    >
                      {content}
                    </span>
                  </UILink>
                ) : (
                  <button
                    ref={(el) => {
                      itemRefs.current[index] = el;
                    }}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    aria-disabled={item.disabled || undefined}
                    className={itemClass}
                    onClick={() => {
                      if (item.disabled) return;
                      close(false);
                      item.onSelect?.();
                    }}
                  >
                    {content}
                  </button>
                )}
              </div>
            );
          })}
        </div>,
        // Inside a modal (native <dialog> top layer, or a drawer's focus
        // scope) the panel must stay in it, or it would be inert/behind it.
        triggerRef.current?.closest<HTMLElement>('dialog, [role="dialog"]') ?? document.body,
      )}
    </div>
  );
}
