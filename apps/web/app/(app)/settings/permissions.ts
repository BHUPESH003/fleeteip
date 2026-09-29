import {
  OrganizationTypeCode,
  PERMISSION_ORGANIZATION_TYPES,
  permissionCodeSchema,
  type PermissionCode,
} from "@fleetip/contracts/organization";

/**
 * Plain-language names for the fixed permission list in
 * packages/contracts/src/organization (permissionCodeSchema). The
 * `Record<PermissionCode, …>` makes a new permission code fail typecheck
 * here until it's explained. Grouping is for reading only — it isn't a
 * permission model of its own.
 */
export interface PermissionInfo {
  label: string;
  description: string;
}

export const PERMISSION_INFO: Record<PermissionCode, PermissionInfo> = {
  "organization.manage": {
    label: "Organization and roles",
    description: "See the organization's roles and create, edit or delete them. Also needed to pick a role when inviting or moving members.",
  },
  "membership.manage": {
    label: "Members and invites",
    description: "See who's in the organization, create invite links and move members between roles.",
  },
  "equipment.manage": {
    label: "Machines",
    description: "Register machines, correct their details, change their status and see the whole fleet and the catalogue.",
  },
  "catalogue.manage": {
    label: "Catalogue editing",
    description: "Add and edit categories, subcategories and products in the catalogue every rental company shares.",
  },
  "maintenance.manage": {
    label: "Maintenance",
    description: "Log and schedule workshop jobs on your machines and move them through their stages.",
  },
  "project.manage": {
    label: "Projects",
    description: "Create and manage the projects your requirements belong to.",
  },
  "rfq.manage": {
    label: "Requirements",
    description: "Post, edit and close requirements, compare responses and ask rental companies to quote.",
  },
  "rfq.respond": {
    label: "Open market",
    description: "See renters' open requirements, respond to them and see requests to quote.",
  },
  "quotation.manage": {
    label: "Quotations",
    description: "Draft, send, negotiate, withdraw and award quotations, and look up renter organizations.",
  },
  "quotation.respond": {
    label: "Quotations sent to you",
    description: "Review quotations from rental companies, negotiate, and accept or reject them.",
  },
  "auction.manage": {
    label: "Running auctions",
    description: "Run auctions for your requirements, approve participants and choose who to proceed with.",
  },
  "auction.participate": {
    label: "Auction bidding",
    description: "Ask to join renters' auctions and place bids.",
  },
  "rental.manage": {
    label: "Rentals and work orders",
    description: "Create rentals, edit their terms, start and end them, check availability and see work orders.",
  },
  "rental.respond": {
    label: "Rentals you hire",
    description: "See the rentals and work orders for machines you hire, and verify or dispute their actual dates.",
  },
  "transport.manage": {
    label: "Transport",
    description: "Plan and update mobilization and demobilization for your rentals.",
  },
  "transport.respond": {
    label: "Transport for your rentals",
    description: "See mobilization and demobilization for the machines you hire.",
  },
  "logsheet.manage": {
    label: "Logsheets",
    description: "Submit daily hours for rentals that are running and see machine utilization.",
  },
  "logsheet.respond": {
    label: "Logsheets for your rentals",
    description: "See the hours logged for the machines you hire.",
  },
  "billing.manage": {
    label: "Billing",
    description: "Raise, issue and cancel invoices and record payments.",
  },
  "billing.respond": {
    label: "Invoices sent to you",
    description: "See invoices from rental companies and what's still due.",
  },
};

export interface PermissionGroup {
  key: string;
  label: string;
  codes: PermissionCode[];
}

const GROUPS: PermissionGroup[] = [
  { key: "organization", label: "Organization and team", codes: ["organization.manage", "membership.manage"] },
  { key: "fleet", label: "Fleet and catalogue", codes: ["equipment.manage", "catalogue.manage", "maintenance.manage"] },
  {
    key: "marketplace",
    label: "Projects, requirements, quotations and auctions",
    codes: ["project.manage", "rfq.manage", "rfq.respond", "quotation.manage", "quotation.respond", "auction.manage", "auction.participate"],
  },
  {
    key: "operations",
    label: "Rentals and operations",
    codes: ["rental.manage", "rental.respond", "transport.manage", "transport.respond", "logsheet.manage", "logsheet.respond"],
  },
  { key: "billing", label: "Billing", codes: ["billing.manage", "billing.respond"] },
];

/** Every code, grouped; a code missing from GROUPS still shows, under "Other". */
export const PERMISSION_GROUPS: PermissionGroup[] = (() => {
  const grouped = new Set(GROUPS.flatMap((group) => group.codes));
  const rest = permissionCodeSchema.options.filter((code) => !grouped.has(code));
  return rest.length ? [...GROUPS, { key: "other", label: "Other", codes: rest }] : GROUPS;
})();

export const ORGANIZATION_TYPE_LABEL: Record<OrganizationTypeCode, string> = {
  rental_company: "Rental company",
  renter: "Renter",
};

/** "Rental companies only" / "Renters only" / "Rental companies and renters". */
export function appliesTo(code: PermissionCode): string {
  const types = PERMISSION_ORGANIZATION_TYPES[code];
  if (types.length > 1) return "Rental companies and renters";
  return types[0] === OrganizationTypeCode.renter ? "Renters only" : "Rental companies only";
}

/**
 * Only the permissions that mean something for this organization type —
 * the API rejects the rest at role-save time (400), and a Renter's role
 * holding equipment.manage could never use it anyway.
 */
export function groupsFor(organizationType: OrganizationTypeCode | undefined): PermissionGroup[] {
  if (!organizationType) return [];
  return PERMISSION_GROUPS.map((group) => ({
    ...group,
    codes: group.codes.filter((code) => PERMISSION_ORGANIZATION_TYPES[code].includes(organizationType)),
  })).filter((group) => group.codes.length > 0);
}

export function permissionLabel(code: PermissionCode): string {
  return PERMISSION_INFO[code]?.label ?? code;
}

/** Codes in `next` but not `current`, and the other way round, in display order. */
export function permissionDiff(current: PermissionCode[], next: PermissionCode[]) {
  const order = PERMISSION_GROUPS.flatMap((group) => group.codes);
  const a = new Set(current);
  const b = new Set(next);
  return {
    gained: order.filter((code) => b.has(code) && !a.has(code)),
    lost: order.filter((code) => a.has(code) && !b.has(code)),
  };
}
