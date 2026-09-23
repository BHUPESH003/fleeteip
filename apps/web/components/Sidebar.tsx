"use client";

import Link from "next/link";
import { NAV_ITEMS, PLANNED_NAV_ITEMS, filterNavItems, filterPlannedNavItems } from "../lib/navigation";
import { useSession } from "../lib/session-context";
import { NavList } from "./NavList";

export function Sidebar() {
  const { hasPermission } = useSession();
  const items = filterNavItems(NAV_ITEMS, { hasPermission });
  const planned = filterPlannedNavItems(PLANNED_NAV_ITEMS, { hasPermission });

  return (
    <aside className="hidden w-[236px] shrink-0 flex-col bg-rail sm:flex">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-rail-border px-4">
        <div className="h-5 w-5 rounded-xs bg-accent" />
        <span className="text-[15px] font-bold tracking-wide text-white">FleetIP</span>
      </div>
      <nav className="scrollbar-rail min-h-0 flex-1 overflow-y-auto px-2.5 py-3.5">
        <NavList items={items} planned={planned} />
      </nav>
      <div className="mt-auto flex flex-col gap-2 border-t border-rail-border px-5 py-3">
        <Link href="/settings?tab=organization" className="text-sm font-medium text-rail-muted hover:text-white">
          Organization
        </Link>
        <Link href="/settings" className="text-sm font-medium text-rail-muted hover:text-white">
          Settings
        </Link>
      </div>
    </aside>
  );
}
