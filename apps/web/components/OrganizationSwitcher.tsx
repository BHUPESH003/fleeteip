"use client";

import { Dropdown, Icon, cx } from "@fleetip/ui";
import { usePathname, useRouter } from "next/navigation";
import { moduleRoot } from "../lib/navigation";
import { useSession } from "../lib/session-context";

const ORG_TYPE_LABEL: Record<string, string> = {
  rental_company: "Rental company",
  renter: "Renter",
};

/**
 * Organization name under the logo; a switcher when the user belongs to
 * more than one. Switching keeps you on the same module (a record from the
 * previous organization wouldn't open in the new one, so detail pages go
 * back to their list).
 */
export function useSwitchOrganization() {
  const { setCurrentOrganizationId, currentOrganizationId } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  return (organizationId: string) => {
    if (organizationId === currentOrganizationId) return;
    setCurrentOrganizationId(organizationId);
    const root = moduleRoot(pathname);
    if (root !== pathname) router.push(root);
  };
}

export function OrganizationSwitcher({ className }: { className?: string }) {
  const { session, currentOrganizationId } = useSession();
  const switchTo = useSwitchOrganization();
  if (!session) return null;
  const current = session.memberships.find((m) => m.organizationId === currentOrganizationId);
  if (!current) return null;

  const name = (
    <span className="flex min-w-0 flex-col gap-[3px] text-left">
      <span className="text-[15px] font-bold leading-none text-white">FleetIP</span>
      <span className="truncate text-[11px] leading-[1.2] text-rail-tag">{current.organization.name}</span>
    </span>
  );

  if (session.memberships.length === 1) return <div className={cx("min-w-0", className)}>{name}</div>;

  return (
    <div className={cx("min-w-0", className)}>
      <Dropdown
        align="left"
        triggerLabel={`Organization: ${current.organization.name}. Switch organization`}
        triggerClassName="w-full gap-2 rounded-cell text-left hover:bg-rail-active focus-visible:!outline-focus-on-dark"
        panelClassName="w-64"
        trigger={
          <>
            {name}
            <Icon name="chevron_down" size={13} className="ml-auto flex-none text-rail-tag" />
          </>
        }
      >
        <div className="border-b border-border px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-meta">
          Switch organization
        </div>
        {session.memberships.map((membership) => {
          const selected = membership.organizationId === currentOrganizationId;
          return (
            <button
              key={membership.id}
              type="button"
              aria-current={selected ? "true" : undefined}
              onClick={() => switchTo(membership.organizationId)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-surface-page"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-ink-strong">{membership.organization.name}</span>
                <span className="text-[11px] text-meta">
                  <span className="font-mono">{membership.organization.code}</span> ·{" "}
                  {ORG_TYPE_LABEL[membership.organization.organizationTypeCode] ?? ""} · {membership.roleName}
                </span>
              </span>
              {selected && <Icon name="check" size={14} className="mt-0.5 text-accent" />}
            </button>
          );
        })}
      </Dropdown>
    </div>
  );
}
