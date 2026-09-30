"use client";

import { useToast } from "@fleetip/ui";
import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";
import { useReloadOnReconnect } from "./connection";
import { describeError } from "./errors";

export interface LoadState<T> {
  data: T | null;
  error: unknown;
  /** True only for the first load (show a skeleton); refreshes keep the data on screen. */
  loading: boolean;
  /** True while a background refresh runs. */
  refreshing: boolean;
  reload: () => Promise<void>;
  /** Replace data locally after a write returned the updated record. */
  setData: (updater: T | ((previous: T | null) => T | null)) => void;
}

/**
 * Loads page data, ignores out-of-order responses (fast id changes),
 * keeps showing the last data while refreshing, and re-fetches when the
 * connection comes back. Pass `enabled=false` until the org id is known.
 */
export function useLoad<T>(loader: () => Promise<T>, deps: DependencyList, enabled = true): LoadState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const hasData = useRef(false);
  const toastRef = useRef(useToast());

  const run = useCallback(async (mode: "initial" | "refresh") => {
    const id = ++requestId.current;
    if (mode === "initial") {
      setLoading(true);
      setError(null);
    } else {
      setRefreshing(true);
    }
    try {
      const result = await loaderRef.current();
      if (id !== requestId.current) return;
      hasData.current = true;
      setDataState(result);
      setError(null);
    } catch (err) {
      if (id !== requestId.current) return;
      // A failed refresh keeps the loaded page on screen; only a first load
      // fails the page. Offline is already announced by the offline banner.
      if (mode === "refresh" && hasData.current) {
        const friendly = describeError(err, "Couldn't refresh");
        if (!friendly.network) toastRef.current.warning({ title: "Couldn't refresh", body: "Showing what was last loaded. " + friendly.body });
        return;
      }
      setError(err);
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    hasData.current = false;
    setDataState(null);
    void run("initial");
  }, [enabled, ...deps]);

  const reload = useCallback(() => run(hasData.current ? "refresh" : "initial"), [run]);
  const onReconnect = useCallback(() => {
    if (enabled) void reload();
  }, [enabled, reload]);
  useReloadOnReconnect(onReconnect);
  useEffect(() => {
    if (!enabled) return;
    window.addEventListener(REFRESH_EVENT, onReconnect);
    return () => window.removeEventListener(REFRESH_EVENT, onReconnect);
  }, [enabled, onReconnect]);

  const setData = useCallback((updater: T | ((previous: T | null) => T | null)) => {
    setDataState((previous) =>
      typeof updater === "function" ? (updater as (p: T | null) => T | null)(previous) : updater,
    );
  }, []);

  return { data, error, loading: enabled ? loading : true, refreshing, reload, setData };
}

const REFRESH_EVENT = "fleetip:refresh-page-data";

/**
 * Re-fetches every useLoad on screen, keeping the data shown meanwhile.
 * For links that land on the page already open (router.push to the same
 * path doesn't remount it, so nothing would reload otherwise).
 */
export function refreshPageData(): void {
  window.dispatchEvent(new Event(REFRESH_EVENT));
}

/** Run an optional enrichment call; a failure (e.g. missing permission) yields the fallback instead of failing the page. */
export async function optional<T>(enabled: boolean, call: () => Promise<T | undefined>, fallback: T): Promise<T> {
  if (!enabled) return fallback;
  try {
    const result = await call();
    return result ?? fallback;
  } catch {
    return fallback;
  }
}
