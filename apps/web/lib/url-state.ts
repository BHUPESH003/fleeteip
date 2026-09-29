"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { rememberListUrl } from "./list-state";

/**
 * List filters, sort and page live in the URL so Back and shared links
 * restore them (recipe point 7). Values are read straight from
 * useSearchParams on every render — never copied into useState, which the
 * App Router doesn't re-run on query-only navigation (see docs/decisions.md).
 */
export function useUrlState(listKey?: string) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const get = useCallback((key: string, fallback = ""): string => searchParams.get(key) ?? fallback, [searchParams]);

  const set = useCallback(
    (updates: Record<string, string | number | null | undefined>, options: { resetPage?: boolean } = {}) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === undefined || value === "") next.delete(key);
        else next.set(key, String(value));
      }
      if (options.resetPage !== false && !("page" in updates)) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  // Remember the list's current URL so a detail page's Back link returns here with filters.
  const query = searchParams.toString();
  useEffect(() => {
    if (listKey) rememberListUrl(listKey, query ? `${pathname}?${query}` : pathname);
  }, [listKey, pathname, query]);

  return { get, set, searchParams };
}

/**
 * Search box bound to a URL param: local state for typing, written to the
 * URL after 300 ms, and re-synced when the URL changes from outside (Back).
 */
export function useUrlSearch(param: string, get: (key: string) => string, set: (u: Record<string, string | null>) => void) {
  const urlValue = get(param);
  const [value, setValue] = useState(urlValue);
  const lastPushed = useRef(urlValue);

  useEffect(() => {
    if (urlValue !== lastPushed.current) {
      lastPushed.current = urlValue;
      setValue(urlValue);
    }
  }, [urlValue]);

  useEffect(() => {
    if (value === urlValue) return;
    const handle = setTimeout(() => {
      lastPushed.current = value.trim();
      set({ [param]: value.trim() || null });
    }, 300);
    return () => clearTimeout(handle);
  }, [value, urlValue, param, set]);

  return { value, setValue, pending: value.trim() !== urlValue };
}
