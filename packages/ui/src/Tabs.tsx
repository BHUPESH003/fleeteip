"use client";

import { useRef, type HTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";

export interface TabItem {
  key: string;
  label: string;
  /** Record count shown after the label (mono). */
  count?: number | string;
  disabled?: boolean;
  /** Tooltip — for a disabled tab, the reason. */
  title?: string;
}

export interface TabsProps {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  /** Accessible name of the tablist, e.g. "Machine record". */
  label?: string;
  /** Prefix for tab/panel ids; pair with <TabPanel idBase=…>. */
  idBase?: string;
  /** `card` sits inside a records card (16px inset); `page` spans a page section. */
  variant?: "card" | "page";
  className?: string;
}

/**
 * Tablist with roving tabindex: ←/→ move between tabs, Home/End jump,
 * selection follows focus. Selected tab = 2px orange underline, 600 ink.
 */
export function Tabs({ items, active, onChange, label, idBase = "tabs", variant = "page", className }: TabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = items.map((item, index) => ({ item, index })).filter(({ item }) => !item.disabled);

  function move(fromIndex: number, delta: number) {
    const position = enabled.findIndex(({ index }) => index === fromIndex);
    const next = enabled[(position + delta + enabled.length) % enabled.length];
    if (!next) return;
    refs.current[next.index]?.focus();
    onChange(next.item.key);
  }

  return (
    <div
      className={cx(
        "relative overflow-x-auto border-b border-border-soft",
        variant === "card" ? "px-4 pt-3" : "",
        className,
      )}
    >
      <div role="tablist" aria-label={label} className="flex w-max min-w-full gap-[22px]">
        {items.map((item, index) => {
          const isActive = item.key === active;
          return (
            <button
              key={item.key}
              ref={(el) => {
                refs.current[index] = el;
              }}
              id={`${idBase}-tab-${item.key}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`${idBase}-panel-${item.key}`}
              tabIndex={isActive ? 0 : -1}
              disabled={item.disabled}
              title={item.title}
              onClick={() => !item.disabled && onChange(item.key)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  move(index, 1);
                } else if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  move(index, -1);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  const first = enabled[0];
                  if (first) {
                    refs.current[first.index]?.focus();
                    onChange(first.item.key);
                  }
                } else if (event.key === "End") {
                  event.preventDefault();
                  const last = enabled[enabled.length - 1];
                  if (last) {
                    refs.current[last.index]?.focus();
                    onChange(last.item.key);
                  }
                }
              }}
              className={cx(
                "inline-flex flex-none items-baseline gap-1.5 border-0 border-b-2 bg-transparent px-0 pb-[11px] pt-0 text-sm leading-none",
                isActive ? "border-accent font-semibold text-ink" : "border-transparent font-medium text-meta hover:text-ink",
                item.disabled && "cursor-not-allowed text-disabled-text hover:text-disabled-text",
              )}
            >
              {item.label}
              {item.count !== undefined && (
                <span className="font-mono text-[11px] font-medium text-meta-light">{item.count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  idBase?: string;
  tabKey: string;
  children: ReactNode;
}

export function TabPanel({ idBase = "tabs", tabKey, children, className, ...props }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={`${idBase}-panel-${tabKey}`}
      aria-labelledby={`${idBase}-tab-${tabKey}`}
      tabIndex={0}
      className={cx("focus-visible:outline-2 focus-visible:-outline-offset-2", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export interface SegmentedOption {
  value: string;
  label: string;
}

/** Two-to-four way toggle (e.g. "90 days | 12 months"); buttons carry aria-pressed. */
export function SegmentedControl({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx("inline-flex overflow-hidden rounded-cell border border-border-control", className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cx(
              "h-[26px] border-0 px-2.5 text-xs font-medium focus-visible:outline-2 focus-visible:-outline-offset-2",
              selected ? "bg-ink text-white" : "bg-surface text-ink-strong hover:bg-[#eef1f4]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
