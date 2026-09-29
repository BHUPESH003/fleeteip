"use client";

import { Drawer, Icon, IconButton } from "@fleetip/ui";
import Link from "next/link";
import { NAV_ITEMS, filterNavItems } from "../lib/navigation";
import { useSession } from "../lib/session-context";
import { NavList } from "./NavList";
import { OrganizationSwitcher } from "./OrganizationSwitcher";

/** The full nav in a left drawer, opened from the top bar below 760px. */
export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { hasPermission } = useSession();
  const items = filterNavItems(NAV_ITEMS, { hasPermission });
  return (
    <Drawer open={open} onClose={onClose} side="left" label="Navigation" className="w-[264px] bg-rail">
      <div className="flex h-full flex-col">
        <div className="flex flex-none items-center gap-[9px] px-4 pb-4 pt-[18px]">
          <div aria-hidden="true" className="h-[26px] w-[26px] flex-none rounded-control bg-accent" />
          <OrganizationSwitcher className="flex-1" />
          <IconButton icon="close" label="Close navigation" variant="dark" size="sm" onClick={onClose} noTooltip />
        </div>
        <nav aria-label="Main" className="scrollbar-rail min-h-0 flex-1 overflow-y-auto">
          <NavList items={items} onNavigate={onClose} mode="full" />
        </nav>
        <div className="flex-none border-t border-rail-border py-2">
          <Link
            href="/settings"
            onClick={onClose}
            className="flex items-center gap-2.5 border-l-[3px] border-transparent py-2 pl-[17px] pr-4 text-sm text-rail-muted no-underline hover:bg-rail-active hover:text-white"
          >
            <Icon name="organization" size={16} className="text-rail-icon" />
            Organization &amp; team
          </Link>
        </div>
      </div>
    </Drawer>
  );
}
