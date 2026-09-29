"use client";

import { ToastProvider, UIProvider, type UILinkProps } from "@fleetip/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { SessionProvider } from "../lib/session-context";

/** Router-aware link for @fleetip/ui parts (breadcrumbs, menus, empty-state actions). */
function NextLink({ href, children, ...props }: UILinkProps) {
  return (
    <Link href={href} {...props}>
      {children}
    </Link>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <UIProvider link={NextLink}>
        <ToastProvider>{children}</ToastProvider>
      </UIProvider>
    </SessionProvider>
  );
}
