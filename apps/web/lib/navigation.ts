import type { PermissionCode } from "@fleetip/contracts/organization";

export interface NavItem {
  label: string;
  href: string;
  // The item shows if the current membership holds ANY one of these codes.
  // A single-element array behaves like the old single-permission check;
  // multiple entries cover a page shared by both organization types (e.g.
  // Requirements is visible to a Renter via rfq.manage or a Rental Company
  // via rfq.respond) — the backend remains the real enforcement point
  // regardless of what the nav shows.
  requiredPermissions?: PermissionCode[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Equipment", href: "/machines", requiredPermissions: ["equipment.manage"] },
  { label: "Rentals", href: "/rentals", requiredPermissions: ["rental.manage"] },
  {
    label: "Requirements",
    href: "/requirements",
    requiredPermissions: ["rfq.manage", "rfq.respond"],
  },
  {
    label: "Quotations",
    href: "/quotations",
    requiredPermissions: ["quotation.manage", "quotation.respond"],
  },
  {
    label: "Auctions",
    href: "/auctions",
    requiredPermissions: ["auction.manage", "auction.participate"],
  },
  {
    label: "Billing",
    href: "/billing",
    requiredPermissions: ["billing.manage", "billing.respond"],
  },
  { label: "Settings", href: "/settings" },
];

export function filterNavItems(
  items: NavItem[],
  context: { hasPermission: (permission: PermissionCode) => boolean },
): NavItem[] {
  return items.filter((item) => {
    if (!item.requiredPermissions) return true;
    return item.requiredPermissions.some((permission) => context.hasPermission(permission));
  });
}
