"use client";

/**
 * Shared list helpers for the Wave B lists (maintenance, transport,
 * logsheets, billing, work orders): search, sort and page held in the URL
 * (recipe point 7), the debounced search box, client-side sort + paging
 * (server-side is backend ticket l), the filtered-empty state and a
 * "pick a record first" dialog. It sits in this folder only because
 * apps/web/components was outside the wave's scope — it belongs there.
 */
import {
  Button,
  Dialog,
  EmptyState,
  Icon,
  Input,
  SearchSelect,
  TableFooter,
  TableToolbar,
  UILink,
  cx,
  type IconName,
  type SearchSelectOption,
  type SortDirection,
} from "@fleetip/ui";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useUrlSearch, useUrlState } from "../lib/url-state";

export const PAGE_SIZE = 25;
/** Searches start at two characters (UX pass table rules). */
export const MIN_QUERY = 2;

type Dir = "asc" | "desc";

export interface ListView<S extends string> {
  get: (key: string, fallback?: string) => string;
  set: (updates: Record<string, string | number | null | undefined>, options?: { resetPage?: boolean }) => void;
  search: { value: string; setValue: (value: string) => void; pending: boolean };
  /** Lower-cased search text once it has two characters, else "". */
  query: string;
  /** The applied search as typed, for "No invoices match ‘abc’". */
  queryLabel: string;
  sortKey: S;
  sortDir: Dir;
  /** Spread onto <Th>: sort button + aria-sort. */
  sortProps: (key: S) => { onSort: () => void; sortDirection: SortDirection };
  page: number;
  setPage: (page: number) => void;
}

/**
 * URL-held list state. Values are read from the URL on every render (the
 * App Router doesn't remount on query-only navigation), and the list's URL
 * is remembered for the detail page's Back link (useUrlState does that).
 */
export function useListView<S extends string>(
  listKey: string,
  sorts: Record<S, Dir>,
  defaultSort: S,
): ListView<S> {
  const { get, set } = useUrlState(listKey);
  const search = useUrlSearch("q", get, set);
  const applied = get("q").trim();
  const query = applied.length >= MIN_QUERY ? applied.toLowerCase() : "";

  const sortParam = get("sort");
  const sortKey = (Object.prototype.hasOwnProperty.call(sorts, sortParam) ? sortParam : defaultSort) as S;
  const dirParam = get("dir");
  const sortDir: Dir = dirParam === "asc" || dirParam === "desc" ? dirParam : sorts[sortKey];

  const sortProps = useCallback(
    (key: S) => ({
      onSort: () => {
        const dir: Dir = key === sortKey ? (sortDir === "asc" ? "desc" : "asc") : sorts[key];
        set({ sort: key, dir });
      },
      sortDirection: (key === sortKey ? sortDir : null) as SortDirection,
    }),
    [sortKey, sortDir, sorts, set],
  );

  const page = Math.max(1, Number.parseInt(get("page"), 10) || 1);
  const setPage = useCallback((next: number) => set({ page: next > 1 ? next : null }), [set]);

  return { get, set, search, query, queryLabel: query ? applied : "", sortKey, sortDir, sortProps, page, setPage };
}

/**
 * Stable sort in either direction; ties keep their incoming order. Rows
 * `missing` says have no value for the sorted column go last either way.
 */
export function sortRows<T>(rows: T[], compare: (a: T, b: T) => number, dir: Dir, missing?: (row: T) => boolean): T[] {
  return rows
    .map((row, index) => ({ row, index, absent: missing ? missing(row) : false }))
    .sort((a, b) => {
      if (a.absent !== b.absent) return a.absent ? 1 : -1;
      const result = a.absent ? 0 : compare(a.row, b.row);
      if (result !== 0) return dir === "asc" ? result : -result;
      return a.index - b.index;
    })
    .map(({ row }) => row);
}

/** Compare strings, treating missing values as "after everything". */
export function compareText(a: string | null | undefined, b: string | null | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, "en-IN", { numeric: true, sensitivity: "base" });
}

export function compareNumber(a: number | null | undefined, b: number | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

export function paginate<T>(rows: T[], page: number, pageSize = PAGE_SIZE): { rows: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  return { rows: rows.slice((current - 1) * pageSize, current * pageSize), page: current, pageCount };
}

/** Case-insensitive "does any of these contain the query". */
export function matches(query: string, values: Array<string | null | undefined>): boolean {
  if (!query) return true;
  return values.some((value) => value?.toLowerCase().includes(query));
}

/**
 * Search box: 300 ms debounce (useUrlSearch), two characters minimum, and
 * "Searching…" in the field while the URL catches up — never a page spinner.
 */
export function ListSearch({
  search,
  label,
  placeholder,
  className,
}: {
  search: ListView<string>["search"];
  label: string;
  placeholder: string;
  className?: string;
}) {
  const typed = search.value.trim();
  const status = typed.length > 0 && typed.length < MIN_QUERY ? "2+ characters" : search.pending ? "Searching…" : "";
  return (
    <div className={cx("relative w-full min-[760px]:w-[280px]", className)}>
      <Icon
        name="search"
        size={14}
        className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 text-meta-light"
      />
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={search.value}
        onChange={(event) => search.setValue(event.target.value)}
        inputClassName={cx("!pl-8", status && "!pr-[104px]")}
      />
      <span
        role="status"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] leading-none text-meta-light"
      >
        {status}
      </span>
    </div>
  );
}

/** Filtered-empty: names the filters and offers Clear filters (distinct from first-run empty). */
export function NoMatches({
  noun,
  parts,
  onClear,
  extra,
}: {
  /** Plural noun: "invoices". */
  noun: string;
  /** Active filter words, e.g. ["Overdue", "‘ABC’"]. */
  parts: string[];
  onClear: () => void;
  extra?: ReactNode;
}) {
  return (
    <EmptyState
      title={parts.length ? `No ${noun} match ${parts.join(" · ")}.` : `No ${noun} match these filters.`}
      description={extra ?? "Change or clear the filters to see more."}
      action={
        <Button variant="secondary" size="sm" icon="close" onClick={onClear}>
          Clear filters
        </Button>
      }
    />
  );
}

/** ‘abc’ — how an applied search reads in filter summaries. */
export function quoted(text: string): string {
  return `‘${text}’`;
}

/**
 * "Pick the record first" step for page-level actions that need a parent
 * record (Log maintenance → which machine; Plan transport → which rental).
 */
export function PickRecordDialog({
  open,
  onClose,
  title,
  description,
  icon,
  label,
  placeholder,
  options,
  emptyText,
  hint,
  requiredMessage,
  confirmLabel,
  onPick,
  initialValue = "",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  icon: IconName;
  label: string;
  placeholder: string;
  options: SearchSelectOption[];
  emptyText: string;
  hint?: ReactNode;
  requiredMessage: string;
  confirmLabel: string;
  onPick: (value: string) => void;
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    setTouched(false);
  }, [open, initialValue]);

  const error = touched && !value ? requiredMessage : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (!value) return;
    onPick(value);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      icon={icon}
      size="md"
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={options.length === 0}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {options.length === 0 ? (
        <p className="m-0 text-sm leading-[1.5] text-ink-soft">{emptyText}</p>
      ) : (
        <SearchSelect
          label={label}
          required
          options={options}
          value={value}
          onChange={setValue}
          onBlur={() => setTouched(true)}
          placeholder={placeholder}
          emptyText="Nothing matches. Try another code or name."
          error={error}
          hint={hint}
        />
      )}
    </Dialog>
  );
}

/** Uppercase section label used above small groups inside cards. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx("block text-[10px] font-semibold uppercase tracking-[0.1em] text-meta", className)}>{children}</span>
  );
}

/** The card that holds a list: toolbar, table (or empty state), footer. */
export function ListCard({
  label,
  toolbar,
  footer,
  children,
}: {
  label: string;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={label} className="min-w-0 overflow-hidden rounded-panel border border-border-strong bg-surface">
      {toolbar && <TableToolbar>{toolbar}</TableToolbar>}
      {children}
      {footer && <TableFooter>{footer}</TableFooter>}
    </section>
  );
}

/**
 * Context bar for a list narrowed to one parent record (?machine=,
 * ?rental=): says what's shown and offers the way back to everything.
 */
export function DrillDownBar({
  icon,
  children,
  exitLabel,
  onExit,
}: {
  icon: IconName;
  children: ReactNode;
  exitLabel: string;
  onExit: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-panel border border-border-strong bg-surface px-4 py-3">
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-control border border-tile-border bg-tile text-tile-icon">
        <Icon name={icon} size={17} />
      </span>
      <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1">{children}</div>
      <Button variant="secondary" size="sm" icon="back" onClick={onExit}>
        {exitLabel}
      </Button>
    </div>
  );
}

/**
 * First cell of a row: a reference/code link (never truncated) with an
 * optional sub line, or plain text when the role can't open the record.
 */
export function RefCell({
  href,
  label,
  sub,
  mono = true,
  className,
}: {
  href?: string | null;
  label: ReactNode;
  sub?: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  const text = cx(
    "whitespace-nowrap",
    mono ? "font-mono text-xs font-medium" : "text-sm font-medium",
    href ? "text-accent-text no-underline hover:text-accent-text-hover hover:underline" : "text-ink-strong",
    className,
  );
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {href ? (
        <UILink href={href} className={text}>
          {label}
        </UILink>
      ) : (
        <span className={text}>{label}</span>
      )}
      {sub && (
        <span className="truncate text-[11px] leading-tight text-meta-light" title={typeof sub === "string" ? sub : undefined}>
          {sub}
        </span>
      )}
    </div>
  );
}

export const REF_LINK =
  "font-mono text-xs font-medium text-accent-text no-underline hover:text-accent-text-hover hover:underline";
export const TEXT_LINK = "font-medium text-accent-text no-underline hover:text-accent-text-hover hover:underline";

/** Main + aside columns that wrap to one column below ~900px (recipe point 14). */
export function DetailColumns({ main, aside, asideLabel }: { main: ReactNode; aside: ReactNode; asideLabel: string }) {
  return (
    <div className="flex flex-wrap items-start gap-3.5">
      <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-3.5">{main}</div>
      <aside aria-label={asideLabel} className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5 min-[1180px]:max-w-[380px]">
        {aside}
      </aside>
    </div>
  );
}
