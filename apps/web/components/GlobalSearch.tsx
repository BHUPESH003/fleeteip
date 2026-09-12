"use client";

import type { SearchResult, SearchResultType } from "@fleetip/contracts/search";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "../lib/api-client";

const SEARCH_DEBOUNCE_MS = 300;

const GROUP_ORDER: SearchResultType[] = ["machine", "requirement", "quotation", "rental"];
const GROUP_LABELS: Record<SearchResultType, string> = {
  machine: "Machines",
  requirement: "Requirements",
  quotation: "Quotations",
  rental: "Rentals",
};
const HREF_FOR: Record<SearchResultType, (id: string) => string> = {
  machine: (id) => `/machines/${id}`,
  requirement: (id) => `/requirements/${id}`,
  quotation: (id) => `/quotations/${id}`,
  rental: (id) => `/rentals/${id}`,
};

export function GlobalSearch({
  organizationId,
  placeholder,
}: {
  organizationId: string;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const found = (await apiClient.search(organizationId, q)) as SearchResult[];
          setResults(found);
        } catch {
          setResults([]);
        } finally {
          setLoading(false);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, organizationId]);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  const showPanel = open && query.trim().length > 0;
  const grouped = GROUP_ORDER.map((type) => ({
    type,
    items: (results ?? []).filter((r) => r.type === type),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="relative hidden max-w-[400px] flex-1 md:block">
      <div className="flex h-8 items-center gap-1.5 rounded-control border border-border bg-surface-sunk px-2.5 focus-within:border-accent">
        <svg
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5 shrink-0 text-meta-light"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M11 11L14.5 14.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
            setOpen(true);
          }}
          onBlur={() => {
            blurTimeoutRef.current = setTimeout(() => setOpen(false), 150);
          }}
          placeholder={placeholder}
          className="w-full truncate bg-transparent text-xs text-ink outline-none placeholder:text-meta-light"
        />
      </div>

      {showPanel && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-[70vh] overflow-y-auto rounded-panel border border-border bg-surface shadow-lg">
          {loading ? (
            <p className="px-3 py-3 text-xs text-meta">Searching…</p>
          ) : grouped.length === 0 ? (
            <p className="px-3 py-3 text-xs text-meta">
              No results for &quot;{query.trim()}&quot;.
            </p>
          ) : (
            grouped.map((group) => (
              <div key={group.type} className="border-b border-border py-1.5 last:border-0">
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-meta">
                  {GROUP_LABELS[group.type]}
                </p>
                {group.items.map((item) => (
                  <Link
                    key={item.id}
                    href={HREF_FOR[group.type](item.id)}
                    className="flex flex-col gap-0.5 px-3 py-1.5 hover:bg-surface-sunk"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className="text-sm text-ink">{item.title}</span>
                    {item.subtitle && <span className="text-xs text-meta">{item.subtitle}</span>}
                  </Link>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
