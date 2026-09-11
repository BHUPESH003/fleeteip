"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { filterNavItems, NAV_ITEMS } from "../lib/navigation";
import { useSession } from "../lib/session-context";
import { OrganizationSwitcher } from "./OrganizationSwitcher";

export function Sidebar() {
  const { hasPermission } = useSession();
  const pathname = usePathname();

  const items = filterNavItems(NAV_ITEMS, { hasPermission });

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-gray-200 bg-white sm:flex">
      <div className="border-b border-gray-200 px-4 py-4">
        <p className="mb-3 text-sm font-semibold tracking-tight text-gray-900">FleetIP</p>
        <OrganizationSwitcher />
      </div>
      <nav className="flex-1 space-y-1 px-2 py-4">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "block rounded-md px-3 py-2 text-sm font-medium",
                active ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
