"use client";

import { Button, PageBanner, useToast } from "@fleetip/ui";
import { useState } from "react";
import { useConnection } from "../lib/connection";
import { formatTime } from "../lib/format";

/**
 * Page banner while FleetIP can't be reached: says when data last loaded,
 * that nothing can be saved, and offers Try again (it also retries every
 * 30 s). Pages re-fetch on reconnect via useReloadOnReconnect.
 */
export function OfflineBanner() {
  const { online, lastSuccessAt, retry } = useConnection();
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  if (online) return null;
  return (
    <PageBanner
      tone="warning"
      icon="offline"
      action={
        <Button
          variant="secondary"
          size="sm"
          busy={checking}
          busyLabel="Checking…"
          onClick={async () => {
            setChecking(true);
            const ok = await retry();
            setChecking(false);
            if (!ok) toast.error({ id: "offline-retry", title: "Still offline", body: "We'll try again automatically every 30 seconds." });
          }}
        >
          Try again
        </Button>
      }
    >
      You&apos;re offline.
      {lastSuccessAt ? ` Showing what loaded at ${formatTime(lastSuccessAt)}.` : ""} Nothing you change can be saved
      until the connection is back.
    </PageBanner>
  );
}
