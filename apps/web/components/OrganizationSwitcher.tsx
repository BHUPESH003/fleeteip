"use client";

import { Dropdown, DropdownItem } from "@fleetip/ui";
import { useSession } from "../lib/session-context";

const ORG_TYPE_LABEL: Record<string, string> = {
  rental_company: "Rental company",
  renter: "Renter",
};

function OrgChip({ code, name, typeLabel }: { code: string; name: string; typeLabel?: string }) {
  return (
    <div className="flex h-[30px] items-center gap-2 rounded-control border border-border px-2.5">
      <span className="font-mono text-[11px] font-semibold text-accent-text">{code}</span>
      <span className="max-w-[10rem] truncate text-xs font-medium text-ink-strong">{name}</span>
      {typeLabel && <span className="hidden text-xs text-meta-light lg:inline">{typeLabel}</span>}
    </div>
  );
}

export function OrganizationSwitcher() {
  const { session, currentOrganizationId, setCurrentOrganizationId } = useSession();
  if (!session) return null;

  const current = session.memberships.find((m) => m.organizationId === currentOrganizationId);
  if (!current) return null;

  const typeLabel = ORG_TYPE_LABEL[current.organization.organizationTypeCode];

  if (session.memberships.length === 1) {
    return <OrgChip code={current.organization.code} name={current.organization.name} typeLabel={typeLabel} />;
  }

  return (
    <Dropdown
      align="left"
      trigger={
        <OrgChip code={current.organization.code} name={current.organization.name} typeLabel={typeLabel} />
      }
    >
      {session.memberships.map((membership) => (
        <DropdownItem
          key={membership.id}
          onClick={() => setCurrentOrganizationId(membership.organizationId)}
        >
          {membership.organization.name}
        </DropdownItem>
      ))}
    </Dropdown>
  );
}
