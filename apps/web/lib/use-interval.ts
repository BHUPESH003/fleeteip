import { useEffect, useRef } from "react";

// MVP "realtime": short-interval polling of the same authoritative REST
// endpoints, not a WebSocket/SSE/Redis push channel — see
// docs/marketplace-core-loop-design.md §8 and
// docs/autonomus-building-instructions.md §14. The server remains the sole
// source of truth; this just re-asks it periodically.
export function useInterval(callback: () => void, delayMs: number, enabled: boolean): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => callbackRef.current(), delayMs);
    return () => clearInterval(id);
  }, [delayMs, enabled]);
}
