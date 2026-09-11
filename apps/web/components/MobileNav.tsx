"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { filterNavItems, NAV_ITEMS } from "../lib/navigation";
import { useSession } from "../lib/session-context";

export function MobileNav({ onClose }: { onClose: () => void }) {
  const { hasPermission } = useSession();
  const pathname = usePathname();

  const items = filterNavItems(NAV_ITEMS, { hasPermission });

  return (
    <div className="fixed inset-0 z-20 flex sm:hidden">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <nav className="relative z-10 flex w-64 flex-col gap-1 bg-white p-4 shadow-lg">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className={[
              "rounded-md px-3 py-2 text-sm font-medium",
              pathname === item.href
                ? "bg-blue-50 text-blue-700"
                : "text-gray-600 hover:bg-gray-50",
            ].join(" ")}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
