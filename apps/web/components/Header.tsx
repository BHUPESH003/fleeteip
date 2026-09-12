"use client";

import { Dropdown, DropdownItem } from "@fleetip/ui";
import { NotificationBell } from "./NotificationBell";
import { OrganizationSwitcher } from "./OrganizationSwitcher";
import { useSession } from "../lib/session-context";

function initialsFor(name: string | undefined): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const { session, currentMembership, logout } = useSession();
  const searchPlaceholder =
    currentMembership?.organization.organizationTypeCode === "renter"
      ? "Search requirements, quotations, rentals…"
      : "Search machines, rentals, quotations…";

  return (
    <header className="flex h-14 items-center gap-3.5 border-b border-border bg-surface px-5">
      <button
        type="button"
        onClick={onMenuClick}
        className="text-xl text-meta sm:hidden"
        aria-label="Open menu"
      >
        ☰
      </button>
      <div
        className="hidden h-8 max-w-[400px] flex-1 items-center rounded-control border border-border bg-surface-sunk px-2.5 md:flex"
        title="Search — coming soon"
      >
        <span className="truncate text-xs text-meta-light">{searchPlaceholder}</span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <OrganizationSwitcher />
        <NotificationBell />
        <Dropdown
          align="right"
          trigger={
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-control bg-ink-strong text-[11px] font-semibold text-white">
              {initialsFor(session?.user.displayName)}
            </span>
          }
        >
          <div className="border-b border-border px-3 py-2 text-xs text-meta">
            {session?.user.email}
          </div>
          <DropdownItem onClick={() => void logout()}>Log out</DropdownItem>
        </Dropdown>
      </div>
    </header>
  );
}
