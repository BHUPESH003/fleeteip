"use client";

import { Button, PageError } from "@fleetip/ui";
import Link from "next/link";
import { useEffect } from "react";
import { LINK_SECONDARY, Wordmark } from "./(public)/AuthShell";

/**
 * App-wide 500: anything a page throws while rendering lands here. The
 * raw error never reaches the screen (it can carry internals) — it's
 * logged for whoever is debugging instead.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col bg-surface-page">
      <Wordmark />
      <PageError
        code="500 · Something went wrong"
        title="This page couldn't be shown"
        body="The problem is on our side, not with your data. Try again; if it keeps happening, contact FleetIP support."
        primary={
          <Button icon="refresh" onClick={reset}>
            Try again
          </Button>
        }
        secondary={
          <Link href="/" className={LINK_SECONDARY}>
            Back to dashboard
          </Link>
        }
      />
    </div>
  );
}
