/**
 * Rental detail — every derived value on the page, as pure functions over
 * records already loaded (backend tier B). Mirrors machines/[id]/derive.ts,
 * scoped to one rental. Facts respected (docs/redesign-plan.md §1): overdue
 * and balanceDue come on the invoice list rows (InvoiceListItem), maintenance
 * has no rentalId, one transport record per leg, a work order isn't cascaded
 * from the rental.
 */
import { InvoiceStatus, type InvoiceListItem } from "@fleetip/contracts/billing";
import type { Product } from "@fleetip/contracts/catalogue";
import { MachineStatus, type Machine } from "@fleetip/contracts/equipment";
import type { Logsheet } from "@fleetip/contracts/logsheet";
import { MaintenanceStatus, type MaintenanceRecord } from "@fleetip/contracts/maintenance";
import { ActualDatesVerificationStatus, RentalStatus, type Rental, type RentalEvent } from "@fleetip/contracts/rental";
import { TransportLeg, TransportStatus, type TransportRecord } from "@fleetip/contracts/transport";
import { WorkOrderStatus, type WorkOrder } from "@fleetip/contracts/work-order";
import type { AttentionSeverity, ChainStep, DescriptionItem, KeyFigure } from "@fleetip/ui";
import {
  addDays,
  dayNumber,
  daysBetween,
  formatDate,
  formatDateRange,
  formatHours,
  formatMoney,
  formatNumber,
  formatRateUnit,
  formatShortDate,
  humanize,
  isoFromDayNumber,
  plural,
  rentalRef,
} from "../../../../lib/format";
import { statusLabel } from "../../../../lib/status";
import { MAINTENANCE_TYPE_LABEL, conflictingMaintenance } from "../../machines/shared";
import { legalNextRentalStatuses } from "../shared";

export interface RentalAccess {
  isRenter: boolean;
  /** rental.manage — transitions and terms (Rental Company). */
  manage: boolean;
  /** rental.respond — verify or dispute actual dates (Renter). */
  respond: boolean;
  /** equipment.manage — the machine record and its product (Rental Company). */
  machines: boolean;
  /** transport.manage (Rental Company) or transport.respond (Renter). */
  transport: boolean;
  transportWrite: boolean;
  /** logsheet.manage (Rental Company) or logsheet.respond (Renter). */
  logsheets: boolean;
  logsheetWrite: boolean;
  /** billing.manage (Rental Company) or billing.respond (Renter). */
  billing: boolean;
  billingWrite: boolean;
  /** rental.manage or rental.respond — listWorkOrders serves both sides. */
  workOrders: boolean;
  /** quotation.manage — names of customers that are FleetIP organizations. */
  customers: boolean;
  /** maintenance.manage — workshop jobs on the rental's machine. */
  maintenance: boolean;
}

export interface RentalData {
  rental: Rental;
  machine: Machine | null;
  product: Product | null;
  /** Every rental on the same machine, this one included (Rental Company). */
  machineRentals: Rental[];
  /** This rental's transport records — at most one per leg. */
  transport: TransportRecord[];
  /** This rental's invoices, newest period first, with balanceDue/overdue. */
  invoices: InvoiceListItem[];
  /** The rental's activity log, newest first. */
  events: RentalEvent[];
  logsheets: Logsheet[];
  workOrder: WorkOrder | null;
  /** Workshop jobs on the rental's machine (not linked to the rental — there's no rentalId). */
  maintenance: MaintenanceRecord[];
  customerNames: Map<string, string>;
  access: RentalAccess;
  today: string;
}

export const ENDING_SOON_DAYS = 14;
const UNBILLED_THRESHOLD_DAYS = 7;

// ------------------------------------------------------------------ basics

export function customerName(rental: Rental, names: Map<string, string>): string {
  if (rental.clientSnapshot) return rental.clientSnapshot.name;
  if (rental.renterOrganizationId) return names.get(rental.renterOrganizationId) ?? "FleetIP customer";
  return "Customer not recorded";
}

/** Who's on the other side: the customer for the Rental Company, the rental company for a Renter. */
export function counterpartyName(data: RentalData): string {
  return data.access.isRenter
    ? (data.rental.rentalCompanyOrganizationName ?? "The rental company")
    : customerName(data.rental, data.customerNames);
}

export function assetCodeOf(data: RentalData): string | null {
  return data.machine?.assetCode ?? data.rental.machineAssetCode ?? null;
}

export function legsOf(data: RentalData): { mob: TransportRecord | null; demob: TransportRecord | null } {
  return {
    mob: data.transport.find((t) => t.leg === TransportLeg.mobilization) ?? null,
    demob: data.transport.find((t) => t.leg === TransportLeg.demobilization) ?? null,
  };
}

/** Customers outside FleetIP can't verify dates, so their "pending" never clears. */
export function verificationApplies(rental: Rental): boolean {
  return Boolean(rental.renterOrganizationId);
}

export type ForwardTransition = "active" | "off_rent" | "completed";

/** The one forward transition for the header's primary button (cancel lives in the menu). */
export function forwardTransition(status: RentalStatus): ForwardTransition | null {
  const next = legalNextRentalStatuses(status).find((s) => s !== RentalStatus.cancelled);
  return next === RentalStatus.active || next === RentalStatus.off_rent || next === RentalStatus.completed ? next : null;
}

export function canCancel(status: RentalStatus): boolean {
  return legalNextRentalStatuses(status).includes(RentalStatus.cancelled);
}

/** The workshop job that would make "Start rental" fail (the API refuses to activate over one). */
export function startBlocker(data: RentalData): MaintenanceRecord | null {
  return conflictingMaintenance(data.maintenance, data.rental.startDate, data.rental.endDate);
}

/** Header line: dates, or "No end date · 15-day notice" for an open-ended rental. */
export function datesSummary(rental: Rental): { dates: string; openNote: string | null } {
  if (rental.endDate) return { dates: formatDateRange(rental.startDate, rental.endDate), openNote: null };
  return {
    dates: `From ${formatDate(rental.startDate)}`,
    openNote:
      rental.noticePeriodDays != null ? `No end date · ${rental.noticePeriodDays}-day notice` : "No end date · notice period not specified",
  };
}

// ------------------------------------------------------------------ logsheet coverage

export interface Coverage {
  from: string;
  to: string;
  elapsed: number;
  logged: number;
  /** Missing dates, most recent first. */
  missing: string[];
  /** Logged but not customer-confirmed, most recent first. */
  unconfirmed: string[];
}

/**
 * Days a logsheet is expected: from the later of planned and actual start
 * (the API only accepts dates inside the rental) to yesterday, capped at the
 * planned end and at the actual end once it's off rent. Today is excluded —
 * it's logged once it's over. Null while nothing can be logged yet.
 */
export function coverageFor(rental: Rental, logsheets: Logsheet[], today: string): Coverage | null {
  if (rental.status === RentalStatus.confirmed || rental.status === RentalStatus.cancelled) return null;
  const from = rental.actualStartDate && rental.actualStartDate > rental.startDate ? rental.actualStartDate : rental.startDate;
  let to = addDays(today, -1);
  if (rental.endDate && rental.endDate < to) to = rental.endDate;
  if (rental.actualEndDate && rental.actualEndDate < to) to = rental.actualEndDate;
  if (to < from) return { from, to, elapsed: 0, logged: 0, missing: [], unconfirmed: [] };
  const byDate = new Map(logsheets.map((l) => [l.logDate, l]));
  const missing: string[] = [];
  const unconfirmed: string[] = [];
  let logged = 0;
  for (let day = dayNumber(to); day >= dayNumber(from); day--) {
    const iso = isoFromDayNumber(day);
    const sheet = byDate.get(iso);
    if (!sheet) missing.push(iso);
    else {
      logged++;
      if (!sheet.customerConfirmed) unconfirmed.push(iso);
    }
  }
  return { from, to, elapsed: daysBetween(from, to) + 1, logged, missing, unconfirmed };
}

// ------------------------------------------------------------------ money

export interface Receivables {
  invoiced: number;
  invoicedCount: number;
  drafts: number;
  outstanding: number;
  overdue: Array<{ invoice: InvoiceListItem; daysOverdue: number; balance: number }>;
  issuedCount: number;
  lastBilledTo: string | null;
}

/** The list row's `overdue` counts before the lazy issued → overdue flip has run. */
export function invoiceStatus(invoice: InvoiceListItem): InvoiceListItem["status"] {
  return invoice.overdue ? InvoiceStatus.overdue : invoice.status;
}

export function receivables(data: RentalData): Receivables {
  let invoiced = 0;
  let invoicedCount = 0;
  let drafts = 0;
  let outstanding = 0;
  let issuedCount = 0;
  const overdue: Receivables["overdue"] = [];
  let lastBilledTo: string | null = null;
  for (const invoice of data.invoices) {
    const status = invoiceStatus(invoice);
    if (status === InvoiceStatus.cancelled) continue;
    if (!lastBilledTo || invoice.billingPeriodEnd > lastBilledTo) lastBilledTo = invoice.billingPeriodEnd;
    if (status === InvoiceStatus.draft) {
      drafts++;
      continue;
    }
    invoiced += invoice.totalAmount;
    invoicedCount++;
    if (status !== InvoiceStatus.issued && status !== InvoiceStatus.overdue) continue;
    const balance = invoice.balanceDue;
    if (balance <= 0) continue;
    outstanding += balance;
    if (status === InvoiceStatus.overdue) overdue.push({ invoice, daysOverdue: daysBetween(invoice.dueDate, data.today), balance });
    else issuedCount++;
  }
  overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);
  return { invoiced, invoicedCount, drafts, outstanding, overdue, issuedCount, lastBilledTo };
}

// ------------------------------------------------------------------ attention

export type RentalTab = "transport" | "logsheets" | "invoices" | "workshop";
export const RENTAL_TABS: RentalTab[] = ["transport", "logsheets", "invoices", "workshop"];
/** Old ?tab= keys other screens and notifications still link with. */
export const LEGACY_TAB: Record<string, RentalTab> = { billing: "invoices", maintenance: "workshop" };

export type AttentionIntent =
  | { kind: "href"; href: string }
  | { kind: "tab"; tab: RentalTab }
  | { kind: "log"; date: string }
  | { kind: "dialog"; dialog: "start" | "offrent" };

export interface AttentionRow {
  key: string;
  severity: AttentionSeverity;
  title: string;
  context: string;
  action?: { label: string; intent: AttentionIntent };
}

function joinDates(dates: string[], max = 4): string {
  const shown = dates.slice(0, max).map((d) => formatShortDate(d));
  if (dates.length > max) return `${shown.join(", ")} and ${dates.length - max} more`;
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

/** Needs-attention rows, worked out when the page loads (FleetIP sends no reminders — ticket i). */
export function attentionRows(data: RentalData, coverage: Coverage | null): AttentionRow[] {
  const rows: AttentionRow[] = [];
  const { rental, today, access } = data;
  const ref = rentalRef(rental.id);
  const counterparty = counterpartyName(data);
  const money = receivables(data);

  // Overdue money first — the costliest thing to miss. Both sides see it.
  if (access.billing) {
    for (const { invoice, daysOverdue, balance } of money.overdue) {
      const received = invoice.totalAmount - balance;
      rows.push({
        key: `overdue:${invoice.id}`,
        severity: "error",
        title: `Invoice ${invoice.invoiceNumber} is ${plural(Math.max(1, daysOverdue), "day")} overdue`,
        context: `${formatMoney(balance)} still due for ${formatShortDate(invoice.billingPeriodStart)} → ${formatShortDate(invoice.billingPeriodEnd)}${access.isRenter ? ` to ${counterparty}` : ""}. It was due ${formatDate(invoice.dueDate)}${received > 0 ? `; ${formatMoney(received)} of ${formatMoney(invoice.totalAmount)} has been received` : ""}.`,
        action: {
          label: access.isRenter ? "Open invoice" : "Record payment",
          intent: { kind: "href", href: `/billing?invoiceId=${invoice.id}` },
        },
      });
    }
  }

  // Everything below is the rental company's to act on.
  if (access.isRenter) return rows;

  if (rental.actualDatesVerificationStatus === ActualDatesVerificationStatus.disputed) {
    rows.push({
      key: "disputed",
      severity: "error",
      title: `${counterparty} disputed the actual dates on ${ref}`,
      context: `${rental.actualDatesDisputeReason ? `Reason given: “${rental.actualDatesDisputeReason}”. ` : ""}Recorded start ${formatDate(rental.actualStartDate)}, end ${rental.actualEndDate ? formatDate(rental.actualEndDate) : "not recorded yet"}. Agree the dates with the customer before invoicing; recorded dates can't be edited in FleetIP yet.`,
    });
  }

  if (rental.status === RentalStatus.confirmed && rental.startDate < today) {
    rows.push({
      key: "late-start",
      severity: "warning",
      title: `${ref} was due to start on ${formatDate(rental.startDate)}`,
      context: "It's still Confirmed. Start the rental once the machine is on site, or cancel it.",
      action: access.manage ? { label: "Start rental", intent: { kind: "dialog", dialog: "start" } } : undefined,
    });
  }

  if (rental.status === RentalStatus.active && rental.endDate && rental.endDate < today) {
    rows.push({
      key: "past-end",
      severity: "warning",
      title: `${ref} passed its planned end on ${formatDate(rental.endDate)}`,
      context: "It's still Active. Mark it off rent when the machine stops work. Rental dates can't be extended in FleetIP yet.",
      action: access.manage ? { label: "Mark off rent", intent: { kind: "dialog", dialog: "offrent" } } : undefined,
    });
  }

  const job = data.maintenance.find((m) => m.status === MaintenanceStatus.in_progress) ?? null;
  if (rental.status === RentalStatus.active && (job || data.machine?.status === MachineStatus.under_maintenance)) {
    rows.push({
      key: "workshop",
      severity: "warning",
      title: `The machine is in the workshop while ${ref} is Active`,
      context: `${job ? `${MAINTENANCE_TYPE_LABEL[job.maintenanceType]} since ${formatDate(job.startDate)}. ` : ""}Workshop jobs don't carry a rental, so the two can't be linked. Decide with the customer whether the rental goes off rent.`,
      action: { label: "Open workshop", intent: { kind: "tab", tab: "workshop" } },
    });
  }

  if (rental.status === RentalStatus.active && coverage && access.logsheets) {
    if (coverage.missing.length > 0) {
      const [latest, ...earlier] = coverage.missing;
      rows.push({
        key: "missing-logs",
        severity: "warning",
        title: `${plural(coverage.missing.length, "day")} on ${ref} ${coverage.missing.length === 1 ? "has" : "have"} no logsheet`,
        context: `Most recent: ${formatShortDate(latest)}.${earlier.length ? ` Earlier: ${joinDates(earlier)}.` : ""} Logsheets can only be submitted while the rental is Active.`,
        action:
          access.logsheetWrite && latest
            ? { label: `Log ${formatShortDate(latest)}`, intent: { kind: "log", date: latest } }
            : { label: "Open logsheets", intent: { kind: "tab", tab: "logsheets" } },
      });
    }
  }
  if ((rental.status === RentalStatus.active || rental.status === RentalStatus.off_rent) && coverage && access.logsheets && coverage.unconfirmed.length > 0) {
    rows.push({
      key: "unconfirmed-logs",
      severity: "warning",
      title: `${plural(coverage.unconfirmed.length, "logsheet")} not confirmed by the customer`,
      context: `${joinDates(coverage.unconfirmed)}. Unconfirmed days are the ones most likely to be disputed when the invoice goes out.`,
      action: { label: "Review logsheets", intent: { kind: "tab", tab: "logsheets" } },
    });
  }

  if (access.transport) {
    const { mob, demob } = legsOf(data);
    if (rental.status === RentalStatus.confirmed && !mob) {
      rows.push({
        key: "mob",
        severity: "warning",
        title: `Mobilization for ${ref} isn't planned`,
        context: `The rental starts ${formatDate(rental.startDate)}${rental.projectLocation ? ` at ${rental.projectLocation}` : ""}. No trip to site is recorded.`,
        action: { label: "Plan mobilization", intent: { kind: "tab", tab: "transport" } },
      });
    }
    const endingSoon =
      rental.status === RentalStatus.active && rental.endDate !== null && daysBetween(today, rental.endDate) <= ENDING_SOON_DAYS;
    if ((endingSoon || rental.status === RentalStatus.off_rent) && !demob) {
      rows.push({
        key: "demob",
        severity: "warning",
        title: `Demobilization for ${ref} isn't planned`,
        context: `No return trip is recorded.${rental.projectLocation ? ` Pickup would be ${rental.projectLocation}.` : ""}${rental.status === RentalStatus.off_rent ? " The rental is already off rent." : rental.endDate ? ` It ends ${formatDate(rental.endDate)}.` : ""}`,
        action: { label: "Plan demobilization", intent: { kind: "tab", tab: "transport" } },
      });
    }
  }

  if (access.billingWrite && (rental.status === RentalStatus.active || rental.status === RentalStatus.off_rent)) {
    const unbilledFrom = money.lastBilledTo ? addDays(money.lastBilledTo, 1) : (rental.actualStartDate ?? rental.startDate);
    const billableTo = rental.status === RentalStatus.off_rent && rental.actualEndDate ? addDays(rental.actualEndDate, 1) : today;
    const unbilledDays = daysBetween(unbilledFrom, billableTo);
    if (unbilledDays >= (rental.status === RentalStatus.off_rent ? 1 : UNBILLED_THRESHOLD_DAYS)) {
      const overtime = data.logsheets
        .filter((l) => l.logDate >= unbilledFrom)
        .reduce((sum, l) => sum + (l.overtimeHours ?? 0), 0);
      rows.push({
        key: "unbilled",
        severity: "info",
        title: `${plural(unbilledDays, "day")} not invoiced yet`,
        context: `${money.lastBilledTo ? `The last billing period ended ${formatShortDate(money.lastBilledTo)}.` : `Nothing has been invoiced since the rental started ${formatShortDate(rental.actualStartDate ?? rental.startDate)}.`}${overtime > 0 && rental.overtimeRate ? ` About ${formatMoney(overtime * rental.overtimeRate)} overtime (${formatHours(overtime)} × ${formatMoney(rental.overtimeRate)}) is logged since then — an estimate; invoice lines are entered by hand.` : ""}`,
        action: { label: "Raise invoice", intent: { kind: "href", href: `/billing?create=1&rentalId=${rental.id}` } },
      });
    }
  }

  if (rental.actualDatesVerificationStatus === ActualDatesVerificationStatus.pending && verificationApplies(rental) && (rental.actualStartDate || rental.actualEndDate)) {
    const which = rental.actualEndDate ? "return" : "start";
    rows.push({
      key: "verify",
      severity: "info",
      title: `${counterparty} hasn't verified the ${which} date yet`,
      context: `You recorded ${formatDate(rental.actualEndDate ?? rental.actualStartDate)} as the actual ${which} date. They can verify or dispute it from their side of FleetIP.`,
    });
  }

  if (access.workOrders && data.workOrder?.status === WorkOrderStatus.issued && (rental.status === RentalStatus.completed || rental.status === RentalStatus.cancelled)) {
    rows.push({
      key: `wo:${data.workOrder.id}`,
      severity: "info",
      title: `Work order ${data.workOrder.referenceNumber} is still Issued`,
      context: `${ref} is ${statusLabel("rental", rental.status)}. Work orders aren't completed or cancelled automatically when a rental ends.`,
      action: { label: "Open work order", intent: { kind: "href", href: `/work-orders/${data.workOrder.id}` } },
    });
  }

  return rows;
}

// ------------------------------------------------------------------ key figures

function daysFigure(rental: Rental, today: string): KeyFigure {
  if (rental.status === RentalStatus.confirmed) {
    const days = daysBetween(today, rental.startDate);
    return {
      key: "days",
      label: "Starts",
      value: formatShortDate(rental.startDate),
      unit: rental.startDate.slice(0, 4),
      context:
        days > 0
          ? `In ${plural(days, "day")} · ${rental.endDate ? `runs to ${formatShortDate(rental.endDate)}` : "open-ended"}`
          : days === 0
            ? "Today · still Confirmed"
            : `${plural(-days, "day")} ago · still Confirmed`,
      tone: days < 0 ? "warning" : "default",
    };
  }
  const from = rental.actualStartDate ?? rental.startDate;
  if (rental.status === RentalStatus.active) {
    const elapsed = Math.max(0, daysBetween(from, today) + 1);
    const left = rental.endDate ? daysBetween(today, rental.endDate) : null;
    return {
      key: "days",
      label: "Days on rent",
      value: formatNumber(elapsed, 0),
      unit: elapsed === 1 ? "day" : "days",
      context: `Since ${formatShortDate(from)} · ${
        left === null
          ? rental.noticePeriodDays != null
            ? `no end date, ${rental.noticePeriodDays}-day notice`
            : "no end date"
          : left >= 0
            ? `${plural(left, "day")} to the planned end`
            : `planned end passed ${formatShortDate(rental.endDate)}`
      }`,
      tone: left !== null && left < 0 ? "warning" : "default",
    };
  }
  if (rental.status === RentalStatus.cancelled) {
    return {
      key: "days",
      label: "Days on rent",
      value: "—",
      context: rental.actualStartDate ? `Cancelled after starting ${formatShortDate(rental.actualStartDate)}` : "Cancelled before it started",
      tone: "muted",
    };
  }
  const to = rental.actualEndDate ?? rental.endDate ?? today;
  const days = Math.max(0, daysBetween(from, to) + 1);
  return {
    key: "days",
    label: "Days on rent",
    value: formatNumber(days, 0),
    unit: days === 1 ? "day" : "days",
    context: `${formatShortDate(from)} → ${formatShortDate(to)}${rental.actualEndDate ? ", actual dates" : ""}`,
  };
}

export function keyFigures(data: RentalData, coverage: Coverage | null): KeyFigure[] {
  const { rental, access, today } = data;
  const figures: KeyFigure[] = [
    {
      key: "rate",
      label: "Contracted rate",
      value: formatMoney(rental.rate),
      unit: formatRateUnit(rental.rateUnit),
      context: rental.overtimeRate != null ? `Overtime ${formatMoney(rental.overtimeRate)} per h` : "No overtime rate agreed",
    },
    daysFigure(rental, today),
  ];

  if (!access.logsheets) {
    figures.push({ key: "coverage", label: "Logsheet coverage", value: "—", context: "Your role can't view logsheets", tone: "muted" });
  } else if (!coverage) {
    figures.push({
      key: "coverage",
      label: "Logsheet coverage",
      value: "—",
      context: rental.status === RentalStatus.confirmed ? "Logsheets start once the rental is Active" : "No days to log on a cancelled rental",
      tone: "muted",
    });
  } else if (coverage.elapsed === 0) {
    figures.push({ key: "coverage", label: "Logsheet coverage", value: "—", context: "Nothing to log yet — a day is logged once it's over", tone: "muted" });
  } else {
    figures.push({
      key: "coverage",
      label: "Logsheet coverage",
      value: `${coverage.logged} / ${coverage.elapsed}`,
      unit: "days",
      context: `${coverage.missing.length} missing · ${coverage.unconfirmed.length} not confirmed${rental.status === RentalStatus.active ? " · today excluded" : ""}`,
      tone: coverage.missing.length || coverage.unconfirmed.length ? "warning" : "success",
    });
  }

  if (!access.billing) {
    figures.push(
      { key: "invoiced", label: "Invoiced", value: "—", context: "Your role can't view billing", tone: "muted" },
      { key: "outstanding", label: "Outstanding", value: "—", context: "Your role can't view billing", tone: "muted" },
    );
    return figures;
  }
  const money = receivables(data);
  figures.push({
    key: "invoiced",
    label: "Invoiced",
    value: formatMoney(money.invoiced),
    context: money.invoicedCount
      ? `${plural(money.invoicedCount, "invoice")}${money.lastBilledTo ? ` · billed to ${formatShortDate(money.lastBilledTo)}` : ""}${money.drafts ? ` · ${plural(money.drafts, "draft")} not issued` : ""}`
      : money.drafts
        ? `${plural(money.drafts, "draft")} not issued yet`
        : "Nothing invoiced yet",
  });
  const parts = [money.overdue.length ? `${money.overdue.length} overdue` : null, money.issuedCount ? `${money.issuedCount} issued` : null].filter(Boolean);
  figures.push({
    key: "outstanding",
    label: "Outstanding",
    value: formatMoney(money.outstanding),
    context: money.outstanding > 0 ? `${parts.join(", ")} · balance from each invoice` : "Nothing outstanding on this rental",
    tone: money.overdue.length ? "danger" : "default",
  });
  return figures;
}

// ------------------------------------------------------------------ chain

/**
 * "Where this rental is": each step reads its own stored status (nothing
 * is cascaded) and exactly one open step is marked next while there's
 * something to do.
 */
export function chainSteps(data: RentalData, coverage: Coverage | null): ChainStep[] {
  const { rental, access, today } = data;
  const wo = data.workOrder;
  const { mob, demob } = legsOf(data);
  const money = access.billing ? receivables(data) : null;
  const invoices = data.invoices.filter((i) => invoiceStatus(i) !== InvoiceStatus.cancelled);
  const overdue = money?.overdue.length ?? 0;
  const ended = rental.status === RentalStatus.completed || rental.status === RentalStatus.cancelled;
  const inWorkshop = rental.status === RentalStatus.active && data.machine?.status === MachineStatus.under_maintenance;

  const steps: ChainStep[] = [
    {
      key: "wo",
      label: "Work order",
      icon: "work_order",
      state: !access.workOrders
        ? "Not visible"
        : wo
          ? wo.status === WorkOrderStatus.issued && ended
            ? "Issued · rental ended"
            : statusLabel("work_order", wo.status)
          : "None",
      tone: !wo ? "gray" : wo.status === WorkOrderStatus.issued && ended ? "amber" : wo.status === WorkOrderStatus.completed ? "green" : wo.status === WorkOrderStatus.cancelled ? "gray" : "blue",
      meta: wo ? wo.referenceNumber : access.workOrders ? "direct rental" : undefined,
      href: wo ? `/work-orders/${wo.id}` : undefined,
    },
    {
      key: "rental",
      label: "Rental",
      icon: "rental",
      state: inWorkshop ? "Active · in workshop" : statusLabel("rental", rental.status),
      tone: inWorkshop || rental.status === RentalStatus.off_rent ? "amber" : ended ? "gray" : "blue",
      meta:
        rental.status === RentalStatus.confirmed
          ? `starts ${formatShortDate(rental.startDate)}`
          : rental.status === RentalStatus.active
            ? `since ${formatShortDate(rental.actualStartDate ?? rental.startDate)}`
            : rental.status === RentalStatus.off_rent
              ? `off rent ${formatShortDate(rental.actualEndDate ?? rental.endDate)}`
              : rental.status === RentalStatus.completed
                ? `ended ${formatShortDate(rental.actualEndDate ?? rental.endDate)}`
                : undefined,
    },
    {
      key: "mob",
      label: "Mobilization",
      icon: "transport",
      state: !access.transport ? "Not visible" : mob ? statusLabel("transport", mob.status) : "Not planned",
      tone: !mob
        ? rental.status === RentalStatus.confirmed && access.transport
          ? "amber"
          : "gray"
        : mob.status === TransportStatus.delivered
          ? "green"
          : mob.status === TransportStatus.dispatched
            ? "amber"
            : mob.status === TransportStatus.cancelled
              ? "gray"
              : "blue",
      meta: mob
        ? mob.actualDate && mob.plannedDate
          ? daysBetween(mob.plannedDate, mob.actualDate) > 0
            ? `${plural(daysBetween(mob.plannedDate, mob.actualDate), "day")} late`
            : "on plan"
          : mob.plannedDate
            ? `planned ${formatShortDate(mob.plannedDate)}`
            : "no date"
        : undefined,
    },
    {
      key: "logs",
      label: "Logsheets",
      icon: "logsheet",
      state:
        rental.status === RentalStatus.confirmed
          ? "—"
          : !access.logsheets
            ? "Not visible"
            : coverage && coverage.elapsed > 0
              ? `${coverage.logged} of ${coverage.elapsed}`
              : "—",
      tone: !coverage || coverage.elapsed === 0 || !access.logsheets ? "gray" : coverage.missing.length ? "amber" : "green",
      meta:
        rental.status === RentalStatus.confirmed
          ? "after start"
          : coverage && coverage.elapsed > 0 && access.logsheets
            ? coverage.missing.length
              ? `${coverage.missing.length} missing`
              : "complete"
            : undefined,
    },
    {
      key: "invoices",
      label: "Invoices",
      icon: "invoice",
      state: !access.billing ? "Not visible" : overdue ? `${overdue} overdue` : invoices.length ? `${invoices.length} raised` : "None yet",
      tone: overdue ? "red" : invoices.length ? "blue" : "gray",
      meta: money?.lastBilledTo ? `to ${formatShortDate(money.lastBilledTo)}` : rental.status === RentalStatus.confirmed ? "after start" : undefined,
    },
    {
      key: "demob",
      label: "Demobilization",
      icon: "transport",
      state: !access.transport ? "Not visible" : demob ? statusLabel("transport", demob.status) : rental.status === RentalStatus.confirmed ? "—" : "Not planned",
      tone: demob
        ? demob.status === TransportStatus.delivered
          ? "green"
          : demob.status === TransportStatus.cancelled
            ? "gray"
            : "blue"
        : rental.status === RentalStatus.off_rent && access.transport
          ? "amber"
          : "gray",
      meta: rental.endDate ? `ends ${formatShortDate(rental.endDate)}` : "open-ended",
    },
  ];

  // Exactly one next step while something is open; never one the viewer can't see.
  const canSee = (key: string) =>
    key === "wo" ? access.workOrders : key === "mob" || key === "demob" ? access.transport : key === "logs" ? access.logsheets : key === "invoices" ? access.billing : true;
  const endingSoon = rental.endDate !== null && daysBetween(today, rental.endDate) <= ENDING_SOON_DAYS;
  const unbilled =
    money !== null &&
    daysBetween(money.lastBilledTo ? addDays(money.lastBilledTo, 1) : (rental.actualStartDate ?? rental.startDate), today) >= UNBILLED_THRESHOLD_DAYS;
  const candidates: string[] = [];
  if (rental.status === RentalStatus.confirmed) candidates.push(mob ? "rental" : "mob", "rental");
  else if (rental.status === RentalStatus.active) {
    if (!mob) candidates.push("mob");
    if (endingSoon && !demob) candidates.push("demob");
    if (overdue) candidates.push("invoices");
    if (coverage?.missing.length) candidates.push("logs");
    if (unbilled) candidates.push("invoices");
    candidates.push("logs", "rental");
  } else if (rental.status === RentalStatus.off_rent) {
    if (!demob || demob.status !== TransportStatus.delivered) candidates.push("demob");
    if (overdue || unbilled) candidates.push("invoices");
    candidates.push("rental");
  } else {
    if (wo?.status === WorkOrderStatus.issued) candidates.push("wo");
    if (overdue) candidates.push("invoices");
  }
  const next = candidates.find(canSee) ?? null;
  return steps.map((step) => ({ ...step, next: step.key === next }));
}

// ------------------------------------------------------------------ terms

/** Terms in contract order (same order as the machine page's current-rental card). */
export function termItems(rental: Rental): DescriptionItem[] {
  return [
    { label: "Rate", value: `${formatMoney(rental.rate)} ${formatRateUnit(rental.rateUnit)}`, mono: true },
    {
      label: "Start date",
      value: `${formatDate(rental.startDate)}${rental.actualStartDate && rental.actualStartDate !== rental.startDate ? ` · actual ${formatShortDate(rental.actualStartDate)}` : ""}`,
      mono: true,
    },
    {
      label: "End date",
      value: rental.endDate
        ? `${formatDate(rental.endDate)}${rental.actualEndDate && rental.actualEndDate !== rental.endDate ? ` · actual ${formatShortDate(rental.actualEndDate)}` : ""}`
        : "Open-ended",
      mono: true,
    },
    { label: "Overtime rate", value: rental.overtimeRate != null ? `${formatMoney(rental.overtimeRate)} per h` : null, mono: true },
    { label: "Mobilization charge", value: rental.mobilizationCharge != null ? formatMoney(rental.mobilizationCharge) : null, mono: true },
    { label: "Demobilization charge", value: rental.demobilizationCharge != null ? formatMoney(rental.demobilizationCharge) : null, mono: true },
    { label: "Notice period", value: rental.noticePeriodDays != null ? plural(rental.noticePeriodDays, "day") : null, mono: true },
    { label: "Shift structure", value: rental.shiftStructure },
    { label: "Operator", value: rental.operatorScope ? humanize(rental.operatorScope) : null },
    { label: "Sunday condition", value: rental.sundayCondition },
    { label: "Fuel norms", value: rental.fuelNorms },
    { label: "Payment terms", value: rental.paymentTerms },
    { label: "Dehire terms", value: rental.dehireTerms },
  ];
}

export const TERMS_LOCKED = "Terms lock when a rental starts. Dates change through Change dates in the More menu.";
export const TERMS_OPEN = "Terms can be edited until the rental starts. Dates change through Change dates in the More menu.";
