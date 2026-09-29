import type { AuctionStatus, ParticipantStatus } from "@fleetip/contracts/auction";
import type { InvoiceStatus } from "@fleetip/contracts/billing";
import type { MachineStatus } from "@fleetip/contracts/equipment";
import type { MaintenanceStatus } from "@fleetip/contracts/maintenance";
import type { InviteStatus, MembershipStatus } from "@fleetip/contracts/organization";
import type { ProjectStatus } from "@fleetip/contracts/project";
import type {
  AlternateDateStatus,
  CommercialQuotationStatus,
  QuotationOfferStatus,
  QuotationResponseStatus,
} from "@fleetip/contracts/quotation";
import type { ActualDatesVerificationStatus, RentalStatus } from "@fleetip/contracts/rental";
import type { RequirementStatus } from "@fleetip/contracts/rfq";
import type { TransportStatus } from "@fleetip/contracts/transport";
import type { WorkOrderStatus } from "@fleetip/contracts/work-order";
import { StatusBadge, type BadgeSize, type BadgeTone } from "@fleetip/ui";

/**
 * The one status language (design/design_handoff_machine_detail/FleetIP
 * Status.dc.html). Every stored value renders as a chip; `deployment` is a
 * conclusion FleetIP draws from rentals and renders as a bare uppercase
 * label so stored and derived values never look alike.
 *
 * Tone rules: green = done or healthy, never "in progress"; amber =
 * something is waiting; red only for overdue and disputed (the states that
 * cost money if ignored); grey = cancelled/ended, everywhere.
 *
 * Each map `satisfies Record<ContractEnum, Entry>`, so a new enum value in
 * packages/contracts fails typecheck here until it gets a label and tone.
 */
interface Entry {
  label: string;
  tone: BadgeTone;
}

/** Derived from rentals — not stored. */
export type Deployment = "on_rent" | "available" | "booked" | "off_rent" | "none";
/** Derived from logsheet.customerConfirmed (a boolean). */
export type LogsheetConfirmation = "confirmed" | "unconfirmed";
export type AccountStatus = "active" | "suspended";

export const STATUS_MAPS = {
  machine: {
    active: { label: "Active", tone: "success" },
    under_maintenance: { label: "Under maintenance", tone: "warning" },
    retired: { label: "Retired", tone: "neutral" },
  } satisfies Record<MachineStatus, Entry>,
  rental: {
    confirmed: { label: "Confirmed", tone: "info" },
    active: { label: "Active", tone: "info" },
    off_rent: { label: "Off rent", tone: "warning" },
    completed: { label: "Completed", tone: "neutral" },
    cancelled: { label: "Cancelled", tone: "neutral" },
  } satisfies Record<RentalStatus, Entry>,
  maintenance: {
    scheduled: { label: "Scheduled", tone: "info" },
    in_progress: { label: "In progress", tone: "warning" },
    completed: { label: "Completed", tone: "success" },
    cancelled: { label: "Cancelled", tone: "neutral" },
  } satisfies Record<MaintenanceStatus, Entry>,
  invoice: {
    draft: { label: "Draft", tone: "neutral" },
    issued: { label: "Issued", tone: "info" },
    paid: { label: "Paid", tone: "success" },
    overdue: { label: "Overdue", tone: "danger" },
    cancelled: { label: "Cancelled", tone: "neutral" },
  } satisfies Record<InvoiceStatus, Entry>,
  transport: {
    planned: { label: "Planned", tone: "info" },
    dispatched: { label: "Dispatched", tone: "warning" },
    delivered: { label: "Delivered", tone: "success" },
    cancelled: { label: "Cancelled", tone: "neutral" },
  } satisfies Record<TransportStatus, Entry>,
  work_order: {
    issued: { label: "Issued", tone: "info" },
    completed: { label: "Completed", tone: "success" },
    cancelled: { label: "Cancelled", tone: "neutral" },
  } satisfies Record<WorkOrderStatus, Entry>,
  actual_dates: {
    pending: { label: "Dates pending", tone: "warning" },
    verified: { label: "Dates verified", tone: "success" },
    disputed: { label: "Dates disputed", tone: "danger" },
  } satisfies Record<ActualDatesVerificationStatus, Entry>,
  logsheet: {
    confirmed: { label: "Customer confirmed", tone: "success" },
    unconfirmed: { label: "Not confirmed", tone: "warning" },
  } satisfies Record<LogsheetConfirmation, Entry>,
  deployment: {
    on_rent: { label: "On rent", tone: "info" },
    available: { label: "Available", tone: "success" },
    booked: { label: "Booked", tone: "info" },
    off_rent: { label: "Returning", tone: "warning" },
    none: { label: "Not deployable", tone: "neutral" },
  } satisfies Record<Deployment, Entry>,
  // Domains the design doesn't cover follow the same tone rules.
  requirement: {
    open: { label: "Open", tone: "info" },
    closed: { label: "Closed", tone: "neutral" },
    cancelled: { label: "Cancelled", tone: "neutral" },
  } satisfies Record<RequirementStatus, Entry>,
  quotation: {
    draft: { label: "Draft", tone: "neutral" },
    sent: { label: "Sent", tone: "info" },
    negotiating: { label: "Negotiating", tone: "warning" },
    awarded: { label: "Awarded", tone: "success" },
    rejected: { label: "Rejected", tone: "neutral" },
    expired: { label: "Expired", tone: "neutral" },
    withdrawn: { label: "Withdrawn", tone: "neutral" },
  } satisfies Record<CommercialQuotationStatus, Entry>,
  quotation_response: {
    pending: { label: "Pending", tone: "warning" },
    interested: { label: "Interested", tone: "info" },
    not_interested: { label: "Not interested", tone: "neutral" },
  } satisfies Record<QuotationResponseStatus, Entry>,
  offer: {
    pending: { label: "Pending", tone: "warning" },
    accepted: { label: "Accepted", tone: "success" },
    rejected: { label: "Rejected", tone: "neutral" },
    superseded: { label: "Superseded", tone: "neutral" },
  } satisfies Record<QuotationOfferStatus, Entry>,
  alternate_dates: {
    none: { label: "No date change", tone: "neutral" },
    pending: { label: "New dates proposed", tone: "warning" },
    accepted: { label: "New dates accepted", tone: "success" },
    rejected: { label: "New dates declined", tone: "neutral" },
  } satisfies Record<AlternateDateStatus, Entry>,
  auction: {
    scheduled: { label: "Scheduled", tone: "info" },
    live: { label: "Live", tone: "warning" },
    closed: { label: "Closed", tone: "success" },
    cancelled: { label: "Cancelled", tone: "neutral" },
  } satisfies Record<AuctionStatus, Entry>,
  participant: {
    pending: { label: "Awaiting approval", tone: "warning" },
    approved: { label: "Approved", tone: "info" },
    rejected: { label: "Not approved", tone: "neutral" },
    selected: { label: "Selected", tone: "success" },
  } satisfies Record<ParticipantStatus, Entry>,
  project: {
    active: { label: "Active", tone: "info" },
    completed: { label: "Completed", tone: "success" },
    cancelled: { label: "Cancelled", tone: "neutral" },
  } satisfies Record<ProjectStatus, Entry>,
  membership: {
    active: { label: "Active", tone: "success" },
    invited: { label: "Invited", tone: "warning" },
    suspended: { label: "Suspended", tone: "neutral" },
  } satisfies Record<MembershipStatus, Entry>,
  invite: {
    pending: { label: "Pending", tone: "warning" },
    accepted: { label: "Accepted", tone: "success" },
    revoked: { label: "Revoked", tone: "neutral" },
  } satisfies Record<InviteStatus, Entry>,
  account: {
    active: { label: "Active", tone: "success" },
    suspended: { label: "Suspended", tone: "neutral" },
  } satisfies Record<AccountStatus, Entry>,
} as const;

export type StatusDomain = keyof typeof STATUS_MAPS;
export type StatusValue<D extends StatusDomain> = keyof (typeof STATUS_MAPS)[D] & string;

const DOMAIN_WORD: Record<StatusDomain, string> = {
  machine: "Machine",
  rental: "Rental",
  maintenance: "Workshop job",
  invoice: "Invoice",
  transport: "Transport",
  work_order: "Work order",
  actual_dates: "Actual dates",
  logsheet: "Logsheet",
  deployment: "Right now",
  requirement: "Requirement",
  quotation: "Quotation",
  quotation_response: "Response",
  offer: "Offer",
  alternate_dates: "Date change",
  auction: "Auction",
  participant: "Participant",
  project: "Project",
  membership: "Membership",
  invite: "Invite",
  account: "Account",
};

const DERIVED: ReadonlySet<StatusDomain> = new Set(["deployment"]);

export function statusLabel<D extends StatusDomain>(domain: D, value: StatusValue<D> | string): string {
  const map = STATUS_MAPS[domain] as Record<string, Entry>;
  return map[value]?.label ?? String(value).replace(/_/g, " ");
}

export function statusTone<D extends StatusDomain>(domain: D, value: StatusValue<D> | string): BadgeTone {
  const map = STATUS_MAPS[domain] as Record<string, Entry>;
  return map[value]?.tone ?? "neutral";
}

/** Options for a status filter <Select>, in contract order. */
export function statusOptions<D extends StatusDomain>(domain: D): { value: string; label: string }[] {
  return Object.entries(STATUS_MAPS[domain] as Record<string, Entry>).map(([value, entry]) => ({
    value,
    label: entry.label,
  }));
}

/**
 * The only way to render a status. Always sits beside the record it
 * belongs to (RN-1042 Active); hover says whether it is stored or derived.
 */
export function Status<D extends StatusDomain>({
  domain,
  value,
  size,
  className,
}: {
  domain: D;
  value: StatusValue<D> | string;
  size?: BadgeSize;
  className?: string;
}) {
  const derived = DERIVED.has(domain);
  return (
    <StatusBadge
      status={value}
      map={STATUS_MAPS[domain] as Record<string, Entry>}
      size={size}
      variant={derived ? "label" : "chip"}
      title={
        derived
          ? "Worked out from rentals — not stored"
          : `${DOMAIN_WORD[domain]} status: ${statusLabel(domain, value)}`
      }
      className={className}
    />
  );
}
