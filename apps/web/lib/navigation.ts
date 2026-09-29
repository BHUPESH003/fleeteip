import type { PermissionCode } from "@fleetip/contracts/organization";
import type { IconName } from "@fleetip/ui";

export type NavGroup = "Overview" | "Fleet" | "Commercial" | "Operations" | "Finance";

export const NAV_GROUP_ORDER: NavGroup[] = ["Overview", "Fleet", "Commercial", "Operations", "Finance"];

export interface NavItem {
  label: string;
  href: string;
  group: NavGroup;
  /** Same glyph as the module's records everywhere else. */
  icon: IconName;
  // The item shows if the current membership holds ANY one of these codes.
  // Multiple entries cover a page shared by both organization types (e.g.
  // Quotations: quotation.manage for a Rental Company, quotation.respond
  // for a Renter). This only decides what the nav shows — the backend
  // remains the real enforcement point.
  requiredPermissions?: PermissionCode[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", group: "Overview", icon: "dashboard" },
  // Renter-only — a Rental Company only sees Project context threaded through
  // Requirement/Quotation/Rental.
  { label: "Projects", href: "/projects", group: "Overview", icon: "project", requiredPermissions: ["project.manage"] },
  { label: "Machines", href: "/machines", group: "Fleet", icon: "machine", requiredPermissions: ["equipment.manage"] },
  { label: "Catalogue", href: "/catalogue", group: "Fleet", icon: "catalogue", requiredPermissions: ["equipment.manage"] },
  // Same route, two headings: a Renter sees its own posted requirements; a
  // Rental Company sees the marketplace-wide list. Each is gated by the one
  // permission only that organization type holds, so exactly one renders.
  { label: "Requirements", href: "/requirements", group: "Commercial", icon: "requirement", requiredPermissions: ["rfq.manage"] },
  { label: "Open market", href: "/requirements", group: "Commercial", icon: "requirement", requiredPermissions: ["rfq.respond"] },
  {
    label: "Quotations",
    href: "/quotations",
    group: "Commercial",
    icon: "quotation",
    requiredPermissions: ["quotation.manage", "quotation.respond"],
  },
  {
    label: "Auctions",
    href: "/auctions",
    group: "Commercial",
    icon: "auction",
    requiredPermissions: ["auction.manage", "auction.participate"],
  },
  {
    label: "Rentals",
    href: "/rentals",
    group: "Commercial",
    icon: "rental",
    requiredPermissions: ["rental.manage", "rental.respond"],
  },
  {
    label: "Work orders",
    href: "/work-orders",
    group: "Commercial",
    icon: "work_order",
    requiredPermissions: ["rental.manage", "rental.respond"],
  },
  { label: "Transport", href: "/transport", group: "Operations", icon: "transport", requiredPermissions: ["transport.manage"] },
  { label: "Logsheets", href: "/logsheets", group: "Operations", icon: "logsheet", requiredPermissions: ["logsheet.manage"] },
  { label: "Maintenance", href: "/maintenance", group: "Operations", icon: "maintenance", requiredPermissions: ["maintenance.manage"] },
  {
    label: "Billing",
    href: "/billing",
    group: "Finance",
    icon: "invoice",
    requiredPermissions: ["billing.manage", "billing.respond"],
  },
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

export interface GroupedNav {
  group: NavGroup;
  items: NavItem[];
}

export function groupNavItems(items: NavItem[]): GroupedNav[] {
  return NAV_GROUP_ORDER.map((group) => ({ group, items: items.filter((item) => item.group === group) })).filter(
    (g) => g.items.length > 0,
  );
}

/** Whether a nav item is the current module for this pathname. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** The module root for a pathname ("/machines/abc" → "/machines"). */
export function moduleRoot(pathname: string): string {
  const first = pathname.split("/").filter(Boolean)[0];
  return first ? `/${first}` : "/";
}

// Every resource type a notify() call sets relatedResourceType to gets a
// real deep link — most have an [id] detail route; auctions and invoices
// are selected via a query param on their list page instead.
export const ROUTE_BY_RESOURCE_TYPE: Record<string, (id: string) => string> = {
  requirement: (id) => `/requirements/${id}`,
  // requirement.quotation_requested goes to a Rental Company, which can't
  // open /requirements/[id] (Renter-only) — route it to where they act:
  // the create-quotation flow, prefilled from the requirement.
  quotation_request: (id) => `/quotations?requirementId=${id}`,
  quotation: (id) => `/quotations/${id}`,
  auction: (id) => `/auctions?auctionId=${id}`,
  rental: (id) => `/rentals/${id}`,
  // reminder.logsheet_missing — straight to the rental's Logsheets tab.
  rental_logsheets: (id) => `/rentals/${id}?tab=logsheets`,
  machine: (id) => `/machines/${id}`,
  transport: (id) => `/transport/${id}`,
  work_order: (id) => `/work-orders/${id}`,
  invoice: (id) => `/billing?invoiceId=${id}`,
};
