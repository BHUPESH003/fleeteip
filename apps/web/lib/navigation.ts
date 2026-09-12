import type { PermissionCode } from "@fleetip/contracts/organization";

export type NavGroup = "Overview" | "Fleet" | "Commercial" | "Operations" | "Finance";

export const NAV_GROUP_ORDER: NavGroup[] = [
  "Overview",
  "Fleet",
  "Commercial",
  "Operations",
  "Finance",
];

export interface NavItem {
  label: string;
  href: string;
  group: NavGroup;
  // The item shows if the current membership holds ANY one of these codes.
  // A single-element array behaves like the old single-permission check;
  // multiple entries cover a page shared by both organization types (e.g.
  // Quotations is visible to a Rental Company via quotation.manage or a
  // Renter via quotation.respond) — the backend remains the real
  // enforcement point regardless of what the nav shows.
  requiredPermissions?: PermissionCode[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", group: "Overview" },
  { label: "Machines", href: "/machines", group: "Fleet", requiredPermissions: ["equipment.manage"] },
  { label: "Catalogue", href: "/catalogue", group: "Fleet", requiredPermissions: ["equipment.manage"] },
  // Same route, two headings: a Renter sees their own posted requirements
  // ("Requirements"); a Rental Company sees the marketplace-wide discover
  // list ("Open market"). Each is gated by the one permission that only
  // that organization type ever holds, so exactly one label renders.
  {
    label: "Requirements",
    href: "/requirements",
    group: "Commercial",
    requiredPermissions: ["rfq.manage"],
  },
  {
    label: "Open market",
    href: "/requirements",
    group: "Commercial",
    requiredPermissions: ["rfq.respond"],
  },
  {
    label: "Quotations",
    href: "/quotations",
    group: "Commercial",
    requiredPermissions: ["quotation.manage", "quotation.respond"],
  },
  {
    label: "Auctions",
    href: "/auctions",
    group: "Commercial",
    requiredPermissions: ["auction.manage", "auction.participate"],
  },
  {
    label: "Rentals",
    href: "/rentals",
    group: "Commercial",
    requiredPermissions: ["rental.manage", "rental.respond"],
  },
  {
    label: "Billing",
    href: "/billing",
    group: "Finance",
    requiredPermissions: ["billing.manage", "billing.respond"],
  },
];

export interface PlannedNavItem {
  label: string;
  group: NavGroup;
  requiredPermissions: PermissionCode[];
}

/**
 * Anticipated nav entries with no page built yet (contracts/permissions
 * already exist — see docs/frontend-backend-gap-report.md). Rendered
 * dimmed with a "Soon" tag rather than omitted, matching the approved
 * design; never linked, so nothing is fabricated.
 */
export const PLANNED_NAV_ITEMS: PlannedNavItem[] = [
  { label: "Transport", group: "Operations", requiredPermissions: ["transport.manage"] },
  { label: "Logsheets", group: "Operations", requiredPermissions: ["logsheet.manage"] },
  { label: "Maintenance", group: "Operations", requiredPermissions: ["maintenance.manage"] },
];

function holdsAny(
  requiredPermissions: PermissionCode[] | undefined,
  hasPermission: (permission: PermissionCode) => boolean,
): boolean {
  if (!requiredPermissions) return true;
  return requiredPermissions.some((permission) => hasPermission(permission));
}

export function filterNavItems(
  items: NavItem[],
  context: { hasPermission: (permission: PermissionCode) => boolean },
): NavItem[] {
  return items.filter((item) => holdsAny(item.requiredPermissions, context.hasPermission));
}

export function filterPlannedNavItems(
  items: PlannedNavItem[],
  context: { hasPermission: (permission: PermissionCode) => boolean },
): PlannedNavItem[] {
  return items.filter((item) => holdsAny(item.requiredPermissions, context.hasPermission));
}

export interface GroupedNav {
  group: NavGroup;
  items: NavItem[];
  planned: PlannedNavItem[];
}

export function groupNavItems(items: NavItem[], planned: PlannedNavItem[]): GroupedNav[] {
  return NAV_GROUP_ORDER.map((group) => ({
    group,
    items: items.filter((item) => item.group === group),
    planned: planned.filter((item) => item.group === group),
  })).filter((g) => g.items.length > 0 || g.planned.length > 0);
}
