"use client";

import { useEffect, useState } from "react";
import { connectionSnapshot, pingApi, subscribeConnection } from "./api-client";

export interface ConnectionState {
  online: boolean;
  /** When the last API response arrived — "Showing what loaded at 10:42". */
  lastSuccessAt: Date | null;
}

/** Retry event: pages that loaded data re-fetch when the connection comes back. */
export const RECONNECTED_EVENT = "fleetip:reconnected";

/**
 * Online = the browser reports a network AND the API answered the last
 * request. While offline, the shell shows a banner and writes are disabled
 * on the pages that check `online`.
 */
export function useConnection(): ConnectionState & { retry: () => Promise<boolean> } {
  const [state, setState] = useState<ConnectionState>(() => {
    const snap = connectionSnapshot();
    return { online: snap.reachable, lastSuccessAt: snap.lastSuccessAt };
  });

  useEffect(() => {
    let browserOnline = typeof navigator === "undefined" ? true : navigator.onLine;
    let apiReachable = connectionSnapshot().reachable;
    const update = () =>
      setState({ online: browserOnline && apiReachable, lastSuccessAt: connectionSnapshot().lastSuccessAt });
    const onOnline = () => {
      browserOnline = true;
      void pingApi();
      update();
    };
    const onOffline = () => {
      browserOnline = false;
      update();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const unsubscribe = subscribeConnection((s) => {
      const wasOffline = !apiReachable;
      apiReachable = s.reachable;
      update();
      if (wasOffline && s.reachable) window.dispatchEvent(new Event(RECONNECTED_EVENT));
    });
    update();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      unsubscribe();
    };
  }, []);

  // Retry every 30 s while offline.
  useEffect(() => {
    if (state.online) return;
    const id = setInterval(() => void pingApi(), 30_000);
    return () => clearInterval(id);
  }, [state.online]);

  return { ...state, retry: pingApi };
}

/** Re-run `reload` whenever the connection comes back. */
export function useReloadOnReconnect(reload: () => void): void {
  useEffect(() => {
    const handler = () => reload();
    window.addEventListener(RECONNECTED_EVENT, handler);
    return () => window.removeEventListener(RECONNECTED_EVENT, handler);
  }, [reload]);
}
