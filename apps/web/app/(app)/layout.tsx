"use client";

import { LoadingState } from "@fleetip/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Header } from "../../components/Header";
import { MobileNav } from "../../components/MobileNav";
import { Sidebar } from "../../components/Sidebar";
import { useSession } from "../../lib/session-context";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label={status === "loading" ? "Loading…" : "Redirecting…"} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      {mobileNavOpen && <MobileNav onClose={() => setMobileNavOpen(false)} />}
      <div className="flex flex-1 flex-col">
        <Header onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-x-hidden px-6 py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
