"use client";

import type { SearchResult, SearchResultType } from "@fleetip/contracts/search";
import { Icon, type IconName } from "@fleetip/ui";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { apiClient } from "../lib/api-client";

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY = 2;
const GROUP_ORDER: SearchResultType[] = ["machine", "requirement", "quotation", "rental"];
const GROUP: Record<SearchResultType, { label: string; icon: IconName; href: (id: string) => string }> = {
  machine: { label: "Machines", icon: "machine", href: (id) => `/machines/${id}` },
  requirement: { label: "Requirements", icon: "requirement", href: (id) => `/requirements/${id}` },
  quotation: { label: "Quotations", icon: "quotation", href: (id) => `/quotations/${id}` },
  rental: { label: "Rentals", icon: "rental", href: (id) => `/rentals/${id}` },
};

/** Header search: 300 ms debounce, 2 characters minimum, "Searching…" shown in place. */
export function GlobalSearch({ organizationId, placeholder }: { organizationId: string; placeholder: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      void (async () => {
        try {
          setResults((await apiClient.search(organizationId, q)) as SearchResult[]);
          setFailed(false);
        } catch {
          setResults([]);
          setFailed(true);
        } finally {
          setLoading(false);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, organizationId]);

  useEffect(() => {
    if (!open) return;
    function handle(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const q = query.trim();
  const showPanel = open && q.length > 0;
  const grouped = GROUP_ORDER.map((type) => ({
    type,
    items: (results ?? []).filter((r) => r.type === type),
  })).filter((group) => group.items.length > 0);

  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} role="search" className="relative hidden max-w-[420px] flex-1 md:block">
      <label htmlFor={`${panelId}-input`} className="sr-only">
        Search FleetIP
      </label>
      <div className="flex h-8 items-center gap-2 rounded-control border border-border-control bg-surface px-2.5 focus-within:border-accent focus-within:shadow-[0_0_0_3px_rgba(210,100,12,0.14)]">
        <Icon name="search" size={14} className="text-meta-light" />
        <input
          id={`${panelId}-input`}
          type="search"
          value={query}
          autoComplete="off"
          aria-controls={showPanel ? panelId : undefined}
          aria-expanded={showPanel}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            } else if (event.key === "ArrowDown" && showPanel) {
              event.preventDefault();
              containerRef.current?.querySelector<HTMLElement>("[data-search-result]")?.focus();
            }
          }}
          placeholder={placeholder}
          className="w-full min-w-0 bg-transparent text-xs text-ink outline-none placeholder:text-meta-light [&::-webkit-search-cancel-button]:hidden"
        />
        {loading && <span className="flex-none text-[11px] text-meta">Searching…</span>}
      </div>
      {showPanel && (
        <div
          id={panelId}
          onKeyDown={(event) => {
            const links = Array.from(containerRef.current?.querySelectorAll<HTMLElement>("[data-search-result]") ?? []);
            const index = links.indexOf(document.activeElement as HTMLElement);
            if (event.key === "ArrowDown") {
              event.preventDefault();
              links[Math.min(links.length - 1, index + 1)]?.focus();
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              if (index <= 0) containerRef.current?.querySelector<HTMLElement>("input")?.focus();
              else links[index - 1]?.focus();
            } else if (event.key === "Escape") {
              setOpen(false);
              containerRef.current?.querySelector<HTMLElement>("input")?.focus();
            }
          }}
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-[70vh] overflow-y-auto rounded-panel border border-border-control bg-surface shadow-menu"
        >
          {q.length < MIN_QUERY ? (
            <p className="m-0 px-3 py-3 text-xs text-meta">Type at least {MIN_QUERY} characters.</p>
          ) : loading && !results ? (
            <p className="m-0 px-3 py-3 text-xs text-meta">Searching…</p>
          ) : failed ? (
            <p className="m-0 px-3 py-3 text-xs text-meta">Search didn&apos;t respond. Try again in a moment.</p>
          ) : grouped.length === 0 ? (
            <p className="m-0 px-3 py-3 text-xs text-meta">No machines, requirements, quotations or rentals match “{q}”.</p>
          ) : (
            grouped.map((group) => (
              <div key={group.type} className="border-b border-border py-1.5 last:border-0">
                <p className="m-0 px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-meta">
                  {GROUP[group.type].label}
                </p>
                {group.items.map((item) => (
                  <Link
                    key={item.id}
                    data-search-result=""
                    href={GROUP[group.type].href(item.id)}
                    className="flex items-start gap-2.5 px-3 py-1.5 no-underline hover:bg-surface-page focus-visible:outline-2 focus-visible:-outline-offset-2"
                    onClick={close}
                  >
                    <Icon name={GROUP[group.type].icon} size={14} className="mt-0.5 text-meta" />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm text-ink">{item.title}</span>
                      {item.subtitle && <span className="truncate text-xs text-meta">{item.subtitle}</span>}
                    </span>
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
