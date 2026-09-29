"use client";

import { Dropdown, Icon, cx } from "@fleetip/ui";
import Link from "next/link";
import { useSession } from "../lib/session-context";
import { useSwitchOrganization } from "./OrganizationSwitcher";

function initialsFor(name: string | undefined): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Initials button: who's signed in, organization switch (when several), sign out. */
export function AccountMenu({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { session, currentMembership, logout } = useSession();
  const switchTo = useSwitchOrganization();
  const memberships = session?.memberships ?? [];
  return (
    <Dropdown
      align="right"
      triggerLabel={`Account menu for ${session?.user.displayName ?? "you"}`}
      triggerClassName={cx(tone === "dark" && "focus-visible:!outline-focus-on-dark")}
      panelClassName="w-64 p-0"
      trigger={
        <span
          className={cx(
            "flex h-8 w-8 items-center justify-center rounded-control text-[11px] font-semibold text-white",
            tone === "dark" ? "bg-rail-control-border" : "bg-ink-strong",
          )}
        >
          {initialsFor(session?.user.displayName)}
        </span>
      }
    >
      <div className="flex flex-col gap-0.5 border-b border-border px-3.5 py-2.5">
        <span className="truncate text-sm font-semibold text-ink">{session?.user.displayName}</span>
        <span className="truncate text-xs text-meta">{session?.user.email}</span>
        {currentMembership && (
          <span className="truncate text-[11px] text-meta-light">
            {currentMembership.roleName} · {currentMembership.organization.name}
          </span>
        )}
      </div>
      {memberships.length > 1 && (
        <div className="border-b border-border py-1">
          <p className="m-0 px-3.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-meta">
            Switch organization
          </p>
          {memberships.map((membership) => {
            const selected = membership.organizationId === currentMembership?.organizationId;
            return (
              <button
                key={membership.id}
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => switchTo(membership.organizationId)}
                className="flex w-full items-center gap-2 px-3.5 py-1.5 text-left text-sm text-ink-strong hover:bg-surface-page"
              >
                <span className="min-w-0 flex-1 truncate">{membership.organization.name}</span>
                {selected && <Icon name="check" size={14} className="text-accent" />}
              </button>
            );
          })}
        </div>
      )}
      <div className="py-1">
        <Link href="/settings" className="flex items-center gap-2 px-3.5 py-2 text-sm text-ink-strong no-underline hover:bg-surface-page">
          <Icon name="organization" size={15} className="text-meta" />
          Organization &amp; team
        </Link>
        <button
          type="button"
          onClick={() => void logout()}
          className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm text-ink-strong hover:bg-surface-page"
        >
          <Icon name="back" size={15} className="text-meta" />
          Sign out
        </button>
      </div>
    </Dropdown>
  );
}
