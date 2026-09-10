"use client";

import { Dropdown, DropdownItem } from "@fleetip/ui";
import { useSession } from "../lib/session-context";

export function OrganizationSwitcher() {
  const { session, currentOrganizationId, setCurrentOrganizationId } = useSession();
  if (!session) return null;

  const current = session.memberships.find((m) => m.organizationId === currentOrganizationId);
  if (!current) return null;

  if (session.memberships.length === 1) {
    return (
      <div>
        <p className="truncate text-sm font-semibold text-gray-900">{current.organization.name}</p>
        <p className="text-xs text-gray-500">{current.organization.organizationTypeCode}</p>
      </div>
    );
  }

  return (
    <Dropdown
      align="left"
      trigger={
        <div className="text-left">
          <p className="truncate text-sm font-semibold text-gray-900">
            {current.organization.name}
          </p>
          <p className="text-xs text-gray-500">Switch organization</p>
        </div>
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
