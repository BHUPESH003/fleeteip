"use client";

import { Icon, Input, Skeleton, TableSkeleton, type SortDirection } from "@fleetip/ui";
import { useCallback, useEffect, useState } from "react";
import { useUrlSearch, useUrlState } from "../../../lib/url-state";

/**
 * Small list plumbing shared by the Wave C lists (requirements, open
 * market, quotations, auctions, projects). Filters, sort, page and tab all
 * live in the URL (recipe point 7) and are read from useSearchParams on
 * every render — never copied into state. Filtering/sorting/paging is
 * client-side until the API can do it (backend ticket l).
 */
export const PAGE_SIZE = 25;
/** Search applies from 2 characters (UX pass table rules). */
export const MIN_SEARCH = 2;

type Dir = "asc" | "desc";

export function useListState(listKey: string, defaults: { sort: string; dir: Dir }) {
  const { get, set } = useUrlState(listKey);
  const search = useUrlSearch("q", get, set);

  const rawSort = get("sort");
  const rawDir = get("dir");
  const sortKey = rawSort || defaults.sort;
  const dir: Dir = rawDir === "asc" || rawDir === "desc" ? rawDir : rawSort ? "asc" : defaults.dir;
  const query = get("q").trim();
  const activeQuery = query.length >= MIN_SEARCH ? query.toLowerCase() : "";
  const page = Math.max(1, Math.floor(Number(get("page")) || 1));

  const toggleSort = useCallback(
    (key: string) => {
      if (key === sortKey) set({ sort: key, dir: dir === "asc" ? "desc" : "asc" });
      else set({ sort: key, dir: "asc" });
    },
    [set, sortKey, dir],
  );

  const sortDirection = (key: string): SortDirection => (key === sortKey ? dir : null);
  const setPage = (next: number) => set({ page: next <= 1 ? null : next });

  return { get, set, search, sortKey, dir, activeQuery, page, setPage, toggleSort, sortDirection };
}

/** The current page of rows, with the page clamped to what exists. */
export function pageSlice<T>(rows: T[], page: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  return {
    rows: rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
    page: current,
    pageCount,
    total: rows.length,
  };
}

export function compareText(a: string | null | undefined, b: string | null | undefined): number {
  return (a ?? "").localeCompare(b ?? "", "en", { sensitivity: "base", numeric: true });
}

export function compareNumber(a: number | null | undefined, b: number | null | undefined): number {
  // Missing values sort last in ascending order.
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

/** Applies a direction to an ascending comparator. */
export function directed<T>(compare: (a: T, b: T) => number, dir: Dir): (a: T, b: T) => number {
  return dir === "asc" ? compare : (a, b) => compare(b, a);
}

/** Toolbar search box: 300 ms debounce, 2+ characters, "Searching…" in the field. */
export function SearchField({
  search,
  label,
  placeholder,
}: {
  search: { value: string; setValue: (value: string) => void; pending: boolean };
  label: string;
  placeholder: string;
}) {
  const typed = search.value.trim();
  const suffix = typed.length > 0 && typed.length < MIN_SEARCH ? "2+ characters" : search.pending ? "Searching…" : undefined;
  return (
    <Input
      size="sm"
      type="search"
      aria-label={label}
      placeholder={placeholder}
      value={search.value}
      onChange={(event) => search.setValue(event.target.value)}
      prefix={<Icon name="search" size={13} />}
      suffix={suffix}
      className="w-[300px] max-[760px]:w-full"
    />
  );
}

/** Header + toolbar + 8 skeleton rows — matches a list page while the session/organization resolves. */
export function ListPageSkeleton({ label, columns }: { label: string; columns: number }) {
  return (
    <div aria-busy="true" aria-label={label} className="flex flex-col">
      <div className="flex flex-col gap-2.5 border-b border-border-header bg-surface px-6 pb-4 pt-3.5 max-[760px]:px-4">
        <Skeleton className="h-5 w-[200px]" />
        <Skeleton className="h-3 w-[380px] max-w-[85%]" />
      </div>
      <div className="px-6 pb-8 pt-4 max-[760px]:px-4">
        <div className="overflow-hidden rounded-panel border border-border-strong bg-surface">
          <div className="h-[46px] border-b border-border-soft bg-surface-sunk" />
          <table className="w-full">
            <TableSkeleton columns={columns} rows={8} label={label} />
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * Keeps the last non-null value. A dialog's subject (the row it's about)
 * stays rendered while `open` turns false, so the native <dialog> closes
 * normally and returns focus to the button that opened it, instead of
 * unmounting mid-close.
 */
export function useSticky<T>(value: T | null): T | null {
  const [sticky, setSticky] = useState<T | null>(value);
  useEffect(() => {
    if (value !== null) setSticky(value);
  }, [value]);
  return value ?? sticky;
}
