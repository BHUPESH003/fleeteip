"use client";

import { OrganizationTypeCode } from "@fleetip/contracts/organization";
import { IconButton } from "@fleetip/ui";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, filterNavItems, isNavItemActive } from "../lib/navigation";
import { useSession } from "../lib/session-context";
import { AccountMenu } from "./AccountMenu";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationBell } from "./NotificationBell";

/** Utility bar above every page (≥760px): search, notifications, account. */
export function Header() {
  const { currentMembership } = useSession();
  const searchPlaceholder =
    currentMembership?.organization.organizationTypeCode === OrganizationTypeCode.renter
      ? "Search requirements, quotations, rentals…"
      : "Search machines, rentals, quotations…";
  return (
    <div className="hidden h-12 flex-none items-center gap-3.5 border-b border-border-header bg-surface px-6 min-[760px]:flex">
      {currentMembership && (
        <GlobalSearch organizationId={currentMembership.organizationId} placeholder={searchPlaceholder} />
      )}
      <div className="ml-auto flex items-center gap-2.5">
        <NotificationBell />
        <AccountMenu />
      </div>
    </div>
  );
}

/** Below 760px the sidebar is hidden: a 48px dark bar with menu, logo and the current module. */
export function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const { hasPermission } = useSession();
  const pathname = usePathname();
  const module =
    pathname === "/settings" || pathname.startsWith("/settings/")
      ? "Organization & team"
      : filterNavItems(NAV_ITEMS, { hasPermission }).find((item) => isNavItemActive(item, pathname))?.label;
  return (
    <div className="flex h-12 flex-none items-center gap-2.5 bg-rail px-3 min-[760px]:hidden">
      <IconButton icon="menu" label="Open navigation" variant="dark" onClick={onMenuClick} iconSize={18} noTooltip />
      <div aria-hidden="true" className="h-[22px] w-[22px] flex-none rounded-cell bg-accent" />
      <span className="text-sm font-bold text-white">FleetIP</span>
      {module && <span className="truncate text-xs text-rail-tag">· {module}</span>}
      <div className="ml-auto flex items-center gap-1.5">
        <NotificationBell tone="dark" />
        <AccountMenu tone="dark" />
      </div>
    </div>
  );
}
