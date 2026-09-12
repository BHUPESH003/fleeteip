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
        className="hidden h-8 max-w-[400px] flex-1 cursor-not-allowed items-center gap-1.5 rounded-control border border-border bg-surface-sunk px-2.5 md:flex"
        title="Global search across machines, requirements, quotations and rentals isn't available yet — see the frontend/backend gap report"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-meta-light" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 11L14.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="truncate text-xs text-meta-light">{searchPlaceholder}</span>
        <span className="ml-auto shrink-0 rounded-xs bg-neutral-bg px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-neutral">
          Soon
        </span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <OrganizationSwitcher />
        <NotificationBell />
        <Dropdown
          align="right"
          trigger={
            <span
              aria-label="Account menu"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-control bg-ink-strong text-[11px] font-semibold text-white"
            >
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
