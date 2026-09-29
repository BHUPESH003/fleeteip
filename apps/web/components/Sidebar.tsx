"use client";

import { Icon, cx } from "@fleetip/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, filterNavItems } from "../lib/navigation";
import { useSession } from "../lib/session-context";
import { NavList } from "./NavList";
import { OrganizationSwitcher } from "./OrganizationSwitcher";

/**
 * 232px sidebar ≥1180px; a 60px icon rail from 760px to 1179px (icons keep
 * a tooltip and an accessible name); hidden below 760px, where the dark
 * top bar's menu opens the same nav in a drawer.
 */
export function Sidebar() {
  const { hasPermission } = useSession();
  const pathname = usePathname();
  const items = filterNavItems(NAV_ITEMS, { hasPermission });
  const settingsActive = pathname === "/settings" || pathname.startsWith("/settings/");
  return (
    <aside className="sticky top-0 hidden h-screen w-[60px] flex-none flex-col bg-rail min-[760px]:flex min-[1180px]:w-[232px]">
      <div className="flex flex-none items-center gap-[9px] px-4 pb-4 pt-[18px] min-[1180px]:pl-5 max-[1179px]:justify-center max-[1179px]:px-0">
        <Link
          href="/"
          aria-label="FleetIP dashboard"
          className="h-[26px] w-[26px] flex-none rounded-control bg-accent focus-visible:!outline-focus-on-dark"
        />
        <OrganizationSwitcher className="flex-1 max-[1179px]:hidden" />
      </div>
      <nav aria-label="Main" className="scrollbar-rail min-h-0 flex-1 overflow-y-auto">
        <NavList items={items} />
      </nav>
      <div className="flex-none border-t border-rail-border py-2">
        <Link
          href="/settings"
          aria-current={settingsActive ? "page" : undefined}
          title="Organization & team"
          className={cx(
            "group/nav relative flex items-center gap-2.5 border-l-[3px] py-2 pl-[17px] pr-4 text-sm no-underline hover:bg-rail-active hover:text-white focus-visible:!outline-2 focus-visible:!-outline-offset-2 focus-visible:!outline-focus-on-dark max-[1179px]:justify-center max-[1179px]:px-0",
            settingsActive ? "border-accent bg-rail-active font-semibold text-white" : "border-transparent text-rail-muted",
          )}
        >
          <Icon name="organization" size={16} className={settingsActive ? "text-rail-icon-active" : "text-rail-icon"} />
          <span className="max-[1179px]:sr-only">Organization &amp; team</span>
        </Link>
      </div>
    </aside>
  );
}
