"use client";

import { useEffect, useState } from "react";

/**
 * Detail pages link "back" to the list the user came from, with its
 * filters. Lists write their current URL here (useUrlState does it); detail
 * breadcrumbs read it, falling back to the bare list path on direct links.
 */
const PREFIX = "fleetip.list.";

export function rememberListUrl(key: string, url: string): void {
  try {
    sessionStorage.setItem(PREFIX + key, url);
  } catch {
    // Storage unavailable (private mode) — Back falls back to the bare list.
  }
}

export function useListBackHref(key: string, fallback: string): string {
  const [href, setHref] = useState(fallback);
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(PREFIX + key);
      if (stored && stored.startsWith(fallback)) setHref(stored);
    } catch {
      // keep fallback
    }
  }, [key, fallback]);
  return href;
}
