"use client";

import { Icon, cx } from "@fleetip/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { groupNavItems, isNavItemActive, type NavItem } from "../lib/navigation";

export interface NavListProps {
  items: NavItem[];
  onNavigate?: () => void;
  /**
   * `responsive` — full labels ≥1180px, 60px icon rail 760–1179px (labels
   * become tooltips + accessible names). `full` — always labelled (mobile drawer).
   */
  mode?: "responsive" | "full";
}

/** Grouped nav, shared by the sidebar and the mobile drawer. */
export function NavList({ items, onNavigate, mode = "responsive" }: NavListProps) {
  const pathname = usePathname();
  const groups = groupNavItems(items);
  const railable = mode === "responsive";
  return (
    <div className="flex flex-col pb-2">
      {groups.map((group, index) => (
        <div key={group.group} className="flex flex-col">
          <div
            className={cx(
              "px-5 pb-[5px] pt-3.5 text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-rail-group",
              railable && "max-[1179px]:hidden",
            )}
          >
            {group.group}
          </div>
          {railable && index > 0 && (
            <div aria-hidden="true" className="mx-4 my-2 h-px bg-rail-border min-[1180px]:hidden" />
          )}
          {group.items.map((item) => {
            const active = isNavItemActive(item, pathname);
            return (
              <Link
                key={item.href + item.label}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                // The collapsed rail shows icons only: the label stays as the
                // accessible name (sr-only span) and as the native tooltip.
                title={railable ? item.label : undefined}
                className={cx(
                  "group/nav relative flex items-center gap-2.5 border-l-[3px] py-2 pl-[17px] pr-4 text-sm leading-[1.3] no-underline",
                  "hover:bg-rail-active hover:text-white focus-visible:!outline-2 focus-visible:!-outline-offset-2 focus-visible:!outline-focus-on-dark",
                  active
                    ? "border-accent bg-rail-active font-semibold text-white"
                    : "border-transparent font-normal text-rail-muted",
                  railable && "max-[1179px]:justify-center max-[1179px]:px-0",
                )}
              >
                <Icon
                  name={item.icon}
                  size={16}
                  className={cx(active ? "text-rail-icon-active" : "text-rail-icon group-hover/nav:text-white")}
                />
                <span className={cx(railable && "max-[1179px]:sr-only")}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
