"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "./cx";
import { controlStateClasses, FieldShell, type FieldStateProps } from "./Field";
import { Icon } from "./Icon";

export interface SearchSelectOption {
  value: string;
  label: string;
  /** Second line in the list, e.g. manufacturer · capacity. */
  description?: string;
  /** Extra text matched by the filter but not shown. */
  keywords?: string;
  disabled?: boolean;
}

export interface SearchSelectProps extends FieldStateProps {
  options: SearchSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Shown when the filter matches nothing. */
  emptyText?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  onBlur?: () => void;
}

/**
 * Searchable single select (ARIA 1.2 combobox + listbox). Used where a
 * native <select> gets long — the catalogue cascade on Register machine,
 * customer pickers. Typing filters; ↑/↓ move; Enter picks; Esc restores.
 */
export function SearchSelect({
  label,
  required,
  hideOptional,
  hint,
  error,
  warning,
  options,
  value,
  onChange,
  placeholder = "Type to search…",
  emptyText = "Nothing matches.",
  loading,
  disabled,
  id,
  className,
  onBlur,
}: SearchSelectProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId = `${inputId}-list`;
  const selected = options.find((o) => o.value === value) ?? null;
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the box text in step with the selected value (external resets, cascade clears).
  useEffect(() => {
    if (!open) setQuery(selected?.label ?? "");
  }, [selected?.label, open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || (selected && q === selected.label.toLowerCase())) return options;
    return options.filter((o) =>
      `${o.label} ${o.description ?? ""} ${o.keywords ?? ""}`.toLowerCase().includes(q),
    );
  }, [options, query, selected]);

  useEffect(() => {
    if (!open) return;
    function handle(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function pick(option: SearchSelectOption) {
    if (option.disabled) return;
    onChange(option.value);
    setQuery(option.label);
    setOpen(false);
  }

  const state = { label, required, hint, error, warning };
  const activeOption = filtered[activeIndex];

  return (
    <FieldShell id={inputId} {...state} hideOptional={hideOptional} className={className}>
      <div ref={containerRef} className="relative">
        <div
          className={cx(
            "flex h-[34px] w-full items-center rounded-control bg-surface",
            controlStateClasses({ error: Boolean(error), warning: Boolean(warning) }),
            disabled && "bg-surface-page",
          )}
        >
          <Icon name="search" size={14} className="ml-2.5 text-meta-light" />
          <input
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && activeOption ? `${listId}-${activeIndex}` : undefined}
            aria-invalid={error ? true : undefined}
            aria-required={required || undefined}
            aria-describedby={error || warning ? `${inputId}-msg` : hint ? `${inputId}-hint` : undefined}
            autoComplete="off"
            disabled={disabled}
            value={query}
            placeholder={loading ? "Loading…" : placeholder}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onBlur={() => {
              onBlur?.();
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
              setOpen(true);
              if (!event.target.value) onChange("");
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
                setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((i) => Math.max(0, i - 1));
              } else if (event.key === "Enter") {
                if (open && activeOption) {
                  event.preventDefault();
                  pick(activeOption);
                }
              } else if (event.key === "Escape") {
                if (open) {
                  event.stopPropagation();
                  setOpen(false);
                  setQuery(selected?.label ?? "");
                }
              } else if (event.key === "Tab") {
                setOpen(false);
              }
            }}
            className="min-w-0 flex-1 bg-transparent px-2 text-sm text-ink outline-none placeholder:text-meta-light disabled:cursor-not-allowed disabled:text-disabled-text"
          />
          {loading ? (
            <span className="mr-2.5 h-3 w-3 animate-spin rounded-full border-2 border-meta-light border-t-transparent" />
          ) : (
            <Icon name="chevron_down" size={14} className="mr-2.5 text-meta" />
          )}
        </div>
        {open && !disabled && (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={typeof label === "string" ? label : undefined}
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-40 m-0 max-h-64 list-none overflow-y-auto rounded-panel border border-border-control bg-surface p-1 shadow-menu"
          >
            {filtered.length === 0 ? (
              <li className="px-2.5 py-2 text-xs text-meta">{loading ? "Loading…" : emptyText}</li>
            ) : (
              filtered.map((option, index) => {
                const isActive = index === activeIndex;
                const isSelected = option.value === value;
                return (
                  <li
                    key={option.value}
                    id={`${listId}-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled || undefined}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => pick(option)}
                    className={cx(
                      "flex cursor-pointer items-start gap-2 rounded-cell px-2.5 py-2",
                      isActive && "bg-surface-hover",
                      option.disabled && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm font-medium leading-tight text-ink-strong">{option.label}</span>
                      {option.description && (
                        <span className="text-[11px] leading-tight text-meta">{option.description}</span>
                      )}
                    </span>
                    {isSelected && <Icon name="check" size={14} className="mt-0.5 text-accent" />}
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>
    </FieldShell>
  );
}
