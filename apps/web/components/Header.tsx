"use client";

import { Dropdown, DropdownItem } from "@fleetip/ui";
import { useSession } from "../lib/session-context";

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const { session, logout } = useSession();

  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <button
        type="button"
        onClick={onMenuClick}
        className="text-xl text-gray-500 sm:hidden"
        aria-label="Open menu"
      >
        ☰
      </button>
      <span />
      <Dropdown
        align="right"
        trigger={
          <span className="text-sm font-medium text-gray-700">
            {session?.user.displayName ?? "Account"}
          </span>
        }
      >
        <div className="border-b border-gray-100 px-3 py-2 text-xs text-gray-500">
          {session?.user.email}
        </div>
        <DropdownItem onClick={() => void logout()}>Log out</DropdownItem>
      </Dropdown>
    </header>
  );
}
