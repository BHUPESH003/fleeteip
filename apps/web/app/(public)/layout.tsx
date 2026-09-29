"use client";

import { LoadingState } from "@fleetip/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, type ReactNode } from "react";
import { useSession } from "../../lib/session-context";
import { AuthShell } from "./AuthShell";
import { safeNextPath } from "./next-param";

// useSearchParams needs a Suspense boundary above it for static rendering;
// the pages below read ?next= too and share this boundary.
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <LoadingState label="Loading…" />
        </AuthShell>
      }
    >
      <SignedInRedirect>{children}</SignedInRedirect>
    </Suspense>
  );
}

/**
 * Signed-in visitors don't belong on sign in / sign up: send them to the
 * validated ?next= (where the app shell was sending them before they
 * signed in), else the dashboard. This is also what completes sign-in —
 * the pages only refresh the session.
 */
function SignedInRedirect({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get("next"));

  useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, router, next]);

  if (status === "authenticated") {
    return (
      <AuthShell>
        <LoadingState label="Signed in. Taking you there…" />
      </AuthShell>
    );
  }
  return <AuthShell>{children}</AuthShell>;
}
