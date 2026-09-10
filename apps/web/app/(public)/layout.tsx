"use client";

import { LoadingState } from "@fleetip/ui";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useSession } from "../../lib/session-context";

export default function PublicLayout({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  if (status === "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Redirecting…" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <h1 className="text-center text-2xl font-semibold text-gray-900">FleetIP</h1>
      {children}
    </div>
  );
}
