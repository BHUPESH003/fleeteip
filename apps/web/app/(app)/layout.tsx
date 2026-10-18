"use client";

import { Button, ErrorState, LoadingState } from "@fleetip/ui";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { Header, TopBar } from "../../components/Header";
import { MobileNav } from "../../components/MobileNav";
import { OfflineBanner } from "../../components/OfflineBanner";
import { Sidebar } from "../../components/Sidebar";
import { useConnection } from "../../lib/connection";
import { useSession } from "../../lib/session-context";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { status, refresh } = useSession();
  const { online, retry } = useConnection();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Keep the query string so ?tab=, ?invoiceId= etc. survive sign-in.
  useEffect(() => {
    if (status === "unauthenticated") router.replace(`/login?next=${encodeURIComponent(pathname + window.location.search)}`);
  }, [status, router, pathname]);

  // Close the drawer after navigating.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  if (status === "loading" && !online) {
    // The session check can't reach the API (down, or the browser blocked it,
    // e.g. CORS from an origin the API doesn't allow). Say so; don't spin forever.
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-page px-4">
        <ErrorState
          title="Can't reach the FleetIP server"
          message="Check your connection. If you're running the app locally against a deployed API, that API must allow this address."
          action={
            <Button variant="secondary" size="sm" onClick={async () => ((await retry()) ? void refresh() : undefined)}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-page">
        <LoadingState label={status === "loading" ? "Loading FleetIP…" : "Redirecting to sign in…"} />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface-page">
      <a
        href="#main"
        className="sr-only z-[70] rounded-control bg-surface px-3 py-2 text-sm font-semibold text-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <Sidebar />
      <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar onMenuClick={() => setMobileNavOpen(true)} />
        <Header />
        <OfflineBanner />
        {/* relative: absolute children (sr-only headings) are placed and clipped
            in this scroll area; otherwise they hang off the page root and make
            the whole window scroll. */}
        <main id="main" tabIndex={-1} className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden focus:outline-none">
          <Suspense fallback={<LoadingState label="Loading…" />}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}
