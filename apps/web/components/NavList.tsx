"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { groupNavItems, type NavItem, type PlannedNavItem } from "../lib/navigation";

export interface NavListProps {
  items: NavItem[];
  planned: PlannedNavItem[];
  onNavigate?: () => void;
}

/**
 * Shared by Sidebar and MobileNav so the grouped nav is rendered once
 * instead of duplicated per breakpoint.
 */
export function NavList({ items, planned, onNavigate }: NavListProps) {
  const pathname = usePathname();
  const groups = groupNavItems(items, planned);

  return (
    <div className="flex flex-col gap-3.5">
      {groups.map((group) => (
        <div key={group.group} className="flex flex-col gap-0.5">
          <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-rail-group">
            {group.group}
          </div>
          {group.items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                onClick={onNavigate}
                className={[
                  "flex items-center justify-between rounded-control border-l-2 px-2.5 py-[7px] text-sm font-medium",
                  active
                    ? "border-accent bg-rail-active text-white"
                    : "border-transparent text-rail-muted hover:bg-rail-active/40 hover:text-white",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
          {group.planned.map((item) => (
            <div
              key={item.label}
              title="Not built yet"
              className="flex cursor-default items-center justify-between rounded-control border-l-2 border-transparent px-2.5 py-[7px] text-sm font-medium text-rail-planned"
            >
              {item.label}
              <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-rail-tag">
                Soon
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
