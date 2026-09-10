import type { OrganizationTypeCode, PermissionCode } from "@fleetip/contracts/organization";

export interface NavItem {
  label: string;
  href: string;
  requiredPermission?: PermissionCode;
  // Mirrors a real domain rule (see EquipmentService.requireRentalCompanyOrganization) —
  // a backend 403 still applies regardless of what the nav shows.
  requiredOrganizationType?: OrganizationTypeCode;
}

// Only what's real today. Future modules (Rental, RFQ, Quotations,
// Maintenance, Transport, Operators, Auctions, Billing, Analytics) are
// appended here when each one actually exists — not before.
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/" },
  {
    label: "Equipment",
    href: "/machines",
    requiredPermission: "equipment.manage",
    requiredOrganizationType: "rental_company",
  },
  {
    label: "Rentals",
    href: "/rentals",
    requiredPermission: "rental.manage",
    requiredOrganizationType: "rental_company",
  },
  { label: "Settings", href: "/settings" },
];

export function filterNavItems(
  items: NavItem[],
  context: {
    hasPermission: (permission: PermissionCode) => boolean;
    organizationType?: OrganizationTypeCode | null;
  },
): NavItem[] {
  return items.filter((item) => {
    if (item.requiredPermission && !context.hasPermission(item.requiredPermission)) return false;
    if (item.requiredOrganizationType && item.requiredOrganizationType !== context.organizationType)
      return false;
    return true;
  });
}
