/**
 * Machine Detail v2 — every derived value on the page, as pure functions
 * over records already loaded (backend tier B). Nothing here calls the
 * API or invents a field; see docs/redesign-plan.md §1 for the facts these
 * rules respect (e.g. maintenance has no rentalId, the availability check
 * ignores maintenance, overdue only shows up via invoice detail).
 */
import { InvoiceStatus, type Invoice, type InvoiceDetail } from "@fleetip/contracts/billing";
import type { Product, ProductCategory, ProductSubcategory } from "@fleetip/contracts/catalogue";
import { MachineStatus, type Machine } from "@fleetip/contracts/equipment";
import type { Logsheet, MachineUtilization } from "@fleetip/contracts/logsheet";
import { MaintenanceStatus, MaintenanceType, type MaintenanceRecord } from "@fleetip/contracts/maintenance";
import { ActualDatesVerificationStatus, RentalStatus, type Rental } from "@fleetip/contracts/rental";
import { TransportLeg, TransportStatus, type TransportRecord } from "@fleetip/contracts/transport";
import { WorkOrderStatus, type WorkOrder } from "@fleetip/contracts/work-order";
import type { AttentionSeverity, ChainStep, KeyFigure, LaneBlock, LaneMonth, LaneRow } from "@fleetip/ui";
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
  isoFromDayNumber,
  laneMonthLabel,
  plural,
  rentalRef,
} from "../../../../lib/format";
import { statusLabel, type Deployment } from "../../../../lib/status";
import {
  COMMITTING_RENTAL_STATUSES,
  MAINTENANCE_TYPE_LABEL,
  blocksAvailability,
  conflictingMaintenance,
  conflictingRental,
  currentRentalFor,
  deploymentFor,
} from "../shared";

export interface Access {
  rentals: boolean;
  maintenance: boolean;
  transport: boolean;
  billing: boolean;
  logsheets: boolean;
  workOrders: boolean;
  customers: boolean;
  quotations: boolean;
}

export interface MachineData {
  machine: Machine;
  product: Product | null;
  subcategory: ProductSubcategory | null;
  category: ProductCategory | null;
  /** This machine's rentals, newest start first. */
  rentals: Rental[];
  /** This machine's workshop records, newest start first. */
  maintenance: MaintenanceRecord[];
  /** Transport records on this machine's rentals. */
  transport: TransportRecord[];
  /** Invoices on this machine's rentals, newest period first. */
  invoices: Invoice[];
  /** Detail (balanceDue, lazily-flipped status) for issued/overdue invoices. */
  invoiceDetails: Map<string, InvoiceDetail>;
  workOrders: WorkOrder[];
  /** Logsheets of the current rental (active or off rent). */
  logsheets: Logsheet[];
  utilization: MachineUtilization | null;
  customerNames: Map<string, string>;
  ownerName: string;
  access: Access;
  today: string;
}

// ------------------------------------------------------------------ basics

export function customerName(rental: Rental, names: Map<string, string>): string {
  if (rental.clientSnapshot) return rental.clientSnapshot.name;
  if (rental.renterOrganizationId) return names.get(rental.renterOrganizationId) ?? "FleetIP customer";
  return "Customer not recorded";
}

export function customerNote(rental: Rental, names: Map<string, string>): string {
  if (rental.clientSnapshot) return "Customer not on FleetIP · details as entered";
  if (rental.renterOrganizationId && !names.has(rental.renterOrganizationId)) {
    return "FleetIP organization · name needs the Quotations permission";
  }
  return "FleetIP organization";
}

export function deployment(data: MachineData): Deployment | null {
  return deploymentFor(data.machine, data.rentals);
}

export function currentRental(data: MachineData): Rental | null {
  return currentRentalFor(data.machine.id, data.rentals);
}

export function activeRental(data: MachineData): Rental | null {
  return data.rentals.find((r) => r.status === RentalStatus.active) ?? null;
}

/** Rentals that still hold dates (confirmed/active/off rent). */
export function committingRentals(data: MachineData): Rental[] {
  return data.rentals.filter((r) => COMMITTING_RENTAL_STATUSES.includes(r.status));
}

export function inProgressJob(data: MachineData): MaintenanceRecord | null {
  return data.maintenance.find((m) => m.status === MaintenanceStatus.in_progress) ?? null;
}

export function workOrderFor(data: MachineData, rental: Rental): WorkOrder | null {
  return data.workOrders.find((w) => w.rentalId === rental.id) ?? null;
}

/** Earliest confirmed rental starting after `date`. */
export function nextConfirmedAfter(data: MachineData, date: string): Rental | null {
  return (
    data.rentals
      .filter((r) => r.status === RentalStatus.confirmed && r.startDate > date)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null
  );
}

// ------------------------------------------------------------------ logsheet coverage

export interface Coverage {
  /** First date a logsheet is expected (rental start, or actual start if later). */
  from: string;
  /** Last expected date: yesterday, or the rental end if earlier. Today is excluded. */
  to: string;
  elapsed: number;
  logged: number;
  /** Missing dates, most recent first. */
  missing: string[];
  /** Logged but not customer-confirmed, most recent first. */
  unconfirmed: string[];
}

export function coverageFor(rental: Rental, logsheets: Logsheet[], today: string): Coverage | null {
  const from =
    rental.actualStartDate && rental.actualStartDate > rental.startDate ? rental.actualStartDate : rental.startDate;
  const yesterday = addDays(today, -1);
  const to = rental.endDate && rental.endDate < yesterday ? rental.endDate : yesterday;
  if (to < from) return { from, to, elapsed: 0, logged: 0, missing: [], unconfirmed: [] };
  const byDate = new Map(logsheets.filter((l) => l.rentalId === rental.id).map((l) => [l.logDate, l]));
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

/** Date the logsheet drawer should open on: most recent missing day, else today. */
export function defaultLogDate(coverage: Coverage | null, today: string): string {
  return coverage?.missing[0] ?? today;
}

// ------------------------------------------------------------------ money

export interface Receivables {
  outstanding: number;
  overdue: Array<{ invoice: Invoice; detail: InvoiceDetail | null; daysOverdue: number; balance: number }>;
  issuedCount: number;
  /** Invoices whose balance is unknown (no billing detail access). */
  unknownCount: number;
}

/**
 * Outstanding = sum of balanceDue over issued/overdue invoices (balanceDue
 * only exists on invoice detail). An issued invoice past its due date counts
 * as overdue even if the list hasn't flipped it yet.
 */
export function receivables(data: MachineData): Receivables {
  let outstanding = 0;
  let issuedCount = 0;
  let unknownCount = 0;
  const overdue: Receivables["overdue"] = [];
  for (const invoice of data.invoices) {
    const detail = data.invoiceDetails.get(invoice.id) ?? null;
    const status = detail?.invoice.status ?? invoice.status;
    if (status !== InvoiceStatus.issued && status !== InvoiceStatus.overdue) continue;
    const balance = detail ? detail.balanceDue : invoice.totalAmount;
    if (!detail) unknownCount++;
    if (balance <= 0) continue;
    outstanding += balance;
    const isOverdue = status === InvoiceStatus.overdue || invoice.dueDate < data.today;
    if (isOverdue) overdue.push({ invoice, detail, daysOverdue: daysBetween(invoice.dueDate, data.today), balance });
    else issuedCount++;
  }
  overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);
  return { outstanding, overdue, issuedCount, unknownCount };
}

// ------------------------------------------------------------------ primary action

export type PrimaryAction = "logsheet" | "create_rental" | "complete_job" | null;

export function primaryAction(data: MachineData, can: { logsheet: boolean; rental: boolean; maintenance: boolean }): PrimaryAction {
  const { machine } = data;
  if (machine.status === MachineStatus.retired) return null;
  if (machine.status === MachineStatus.under_maintenance) return can.maintenance ? "complete_job" : null;
  if (activeRental(data)) return can.logsheet ? "logsheet" : null;
  return can.rental ? "create_rental" : null;
}

// ------------------------------------------------------------------ attention

export type AttentionIntent =
  | { kind: "href"; href: string }
  | { kind: "log"; date: string }
  | { kind: "tab"; tab: RecordTab }
  | { kind: "check"; from: string; to?: string };

export interface AttentionRow {
  key: string;
  severity: AttentionSeverity;
  title: string;
  context: string;
  action?: { label: string; intent: AttentionIntent };
}

function listDates(dates: string[], max = 4): string {
  const shown = dates.slice(0, max).map((d) => formatShortDate(d));
  if (dates.length <= max) return joinWords(shown);
  return `${shown.join(", ")} and ${dates.length - max} more`;
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

const UNBILLED_THRESHOLD_DAYS = 7;
const ENDING_SOON_DAYS = 14;

/** Needs-attention rows, derived when the page loads (FleetIP sends no reminders — ticket i). */
export function attentionRows(data: MachineData, coverage: Coverage | null): AttentionRow[] {
  const rows: AttentionRow[] = [];
  const { today, machine } = data;
  if (machine.status === MachineStatus.retired) return rows;
  const names = data.customerNames;
  const active = activeRental(data);

  // Overdue money — the costliest thing to miss.
  if (data.access.billing) {
    for (const { invoice, detail, daysOverdue, balance } of receivables(data).overdue) {
      const rental = data.rentals.find((r) => r.id === invoice.rentalId);
      const received = detail ? detail.amountPaid : 0;
      rows.push({
        key: `overdue:${invoice.id}`,
        severity: "error",
        title: `Invoice ${invoice.invoiceNumber} is ${plural(Math.max(1, daysOverdue), "day")} overdue`,
        context: `${formatMoney(balance)} still due${rental ? ` on ${rentalRef(rental.id)}` : ""} for ${formatShortDate(invoice.billingPeriodStart)} → ${formatShortDate(invoice.billingPeriodEnd)}. It was due ${formatDate(invoice.dueDate)}${received > 0 ? `; ${formatMoney(received)} of ${formatMoney(invoice.totalAmount)} has been received` : ""}.`,
        action: { label: "Record payment", intent: { kind: "href", href: `/billing?invoiceId=${invoice.id}` } },
      });
    }
  }

  // Disputed return/start dates (money at risk too).
  for (const rental of data.rentals) {
    if (rental.actualDatesVerificationStatus === ActualDatesVerificationStatus.disputed) {
      rows.push({
        key: `disputed:${rental.id}`,
        severity: "error",
        title: `${customerName(rental, names)} disputed the actual dates on ${rentalRef(rental.id)}`,
        context: rental.actualDatesDisputeReason
          ? `Reason given: “${rental.actualDatesDisputeReason}”. Agree the dates with the customer before invoicing.`
          : "Agree the dates with the customer before invoicing.",
        action: { label: `Open ${rentalRef(rental.id)}`, intent: { kind: "href", href: `/rentals/${rental.id}` } },
      });
    }
  }

  const job = inProgressJob(data);
  if (job && job.endDate === null) {
    rows.push({
      key: `noeta:${job.id}`,
      severity: "error",
      title: "The workshop job has no expected return date",
      context: `${MAINTENANCE_TYPE_LABEL[job.maintenanceType]} since ${formatDate(job.startDate)} (${plural(Math.max(0, daysBetween(job.startDate, today)), "day")}). FleetIP can't change a job's dates after it's created, so this machine can't be promised to anyone until the job is completed.`,
      action: { label: "Open job", intent: { kind: "href", href: `/maintenance/${job.id}?machineId=${machine.id}` } },
    });
  }
  if (job && active) {
    rows.push({
      key: `mismatch:${active.id}`,
      severity: "warning",
      title: `${rentalRef(active.id)} is still Active while the machine is in the workshop`,
      context:
        "Workshop records don't carry a rental, so the job can't be linked to it. Decide with the customer whether the rental goes off rent.",
      action: { label: `Open ${rentalRef(active.id)}`, intent: { kind: "href", href: `/rentals/${active.id}` } },
    });
  }

  if (active && coverage && data.access.logsheets) {
    if (coverage.missing.length > 0) {
      const [latest, second, ...earlier] = coverage.missing;
      rows.push({
        key: "missing-logs",
        severity: "warning",
        title: `${plural(coverage.missing.length, "day")} on ${rentalRef(active.id)} ${coverage.missing.length === 1 ? "has" : "have"} no logsheet`,
        context: `Most recent: ${joinWords([latest, second].filter((d): d is string => Boolean(d)).map((d) => formatShortDate(d)))}.${earlier.length ? ` Earlier: ${listDates(earlier)}.` : ""} A past date can be submitted — it saves or corrects that day.`,
        action: { label: `Log ${formatShortDate(latest!)}`, intent: { kind: "log", date: latest! } },
      });
    }
    if (coverage.unconfirmed.length > 0) {
      rows.push({
        key: "unconfirmed-logs",
        severity: "warning",
        title: `${plural(coverage.unconfirmed.length, "logsheet")} not confirmed by the customer`,
        context: `${listDates(coverage.unconfirmed)}. Unconfirmed days are the ones most likely to be disputed when the next invoice goes out.`,
        action: { label: "Review logsheets", intent: { kind: "tab", tab: "logsheets" } },
      });
    }
  }

  if (active && active.endDate) {
    const daysLeft = daysBetween(today, active.endDate);
    if (daysLeft >= 0 && daysLeft <= ENDING_SOON_DAYS) {
      const next = nextConfirmedAfter(data, active.endDate);
      if (!next && data.access.rentals) {
        const freeFrom = addDays(active.endDate, 1);
        const service = data.maintenance.find((m) => m.status === MaintenanceStatus.scheduled && m.startDate > active.endDate!);
        rows.push({
          key: "ending",
          severity: "warning",
          title: `${rentalRef(active.id)} ends ${daysLeft === 0 ? "today" : `in ${plural(daysLeft, "day")}`} and nothing is booked after it`,
          context: `Ends ${formatDate(active.endDate)}.${service ? ` A ${MAINTENANCE_TYPE_LABEL[service.maintenanceType].toLowerCase()} is booked ${formatDateRange(service.startDate, service.endDate, "with no end date")}.` : ""} The machine is free from ${formatShortDate(freeFrom)}.`,
          action: { label: `Check from ${formatShortDate(freeFrom)}`, intent: { kind: "check", from: freeFrom } },
        });
      }
    }
  }

  if (data.access.transport) {
    for (const rental of data.rentals) {
      const legs = data.transport.filter((t) => t.rentalId === rental.id && t.status !== TransportStatus.cancelled);
      const hasDemob = legs.some((t) => t.leg === TransportLeg.demobilization);
      const hasMob = legs.some((t) => t.leg === TransportLeg.mobilization);
      const endingSoon =
        rental.status === RentalStatus.active && rental.endDate !== null && daysBetween(today, rental.endDate) <= ENDING_SOON_DAYS;
      if ((endingSoon || rental.status === RentalStatus.off_rent) && !hasDemob) {
        rows.push({
          key: `demob:${rental.id}`,
          severity: "warning",
          title: `Demobilization for ${rentalRef(rental.id)} isn't planned`,
          context: `No return trip is recorded.${rental.projectLocation ? ` Pickup would be ${rental.projectLocation}.` : ""}${rental.status === RentalStatus.off_rent ? " The rental is already off rent." : ""}`,
          action: { label: "Plan demobilization", intent: { kind: "href", href: `/rentals/${rental.id}?tab=transport` } },
        });
      }
      if (rental.status === RentalStatus.confirmed && !hasMob) {
        rows.push({
          key: `mob:${rental.id}`,
          severity: "warning",
          title: `Mobilization for ${rentalRef(rental.id)} isn't planned`,
          context: `The rental starts ${formatDate(rental.startDate)}${rental.projectLocation ? ` at ${rental.projectLocation}` : ""}. Nothing is recorded yet.`,
          action: { label: "Plan mobilization", intent: { kind: "href", href: `/rentals/${rental.id}?tab=transport` } },
        });
      }
    }
  }

  for (const rental of data.rentals) {
    if (rental.status === RentalStatus.confirmed && rental.startDate < today) {
      rows.push({
        key: `late-start:${rental.id}`,
        severity: "warning",
        title: `${rentalRef(rental.id)} was due to start on ${formatDate(rental.startDate)}`,
        context: "It's still Confirmed. Start the rental once the machine is on site, or cancel it.",
        action: { label: `Open ${rentalRef(rental.id)}`, intent: { kind: "href", href: `/rentals/${rental.id}` } },
      });
    }
  }

  if (active && data.access.billing) {
    const billed = data.invoices
      .filter((i) => i.rentalId === active.id && i.status !== InvoiceStatus.cancelled)
      .map((i) => i.billingPeriodEnd)
      .sort()
      .pop();
    const unbilledFrom = billed ? addDays(billed, 1) : active.startDate;
    const unbilledDays = daysBetween(unbilledFrom, today);
    if (unbilledDays >= UNBILLED_THRESHOLD_DAYS) {
      const overtime = data.logsheets
        .filter((l) => l.rentalId === active.id && l.logDate >= unbilledFrom)
        .reduce((sum, l) => sum + (l.overtimeHours ?? 0), 0);
      const overtimeText =
        overtime > 0 && active.overtimeRate
          ? ` About ${formatMoney(overtime * active.overtimeRate)} overtime (${formatHours(overtime)} × ${formatMoney(active.overtimeRate)}) is logged since then — an estimate; invoice lines are entered by hand.`
          : "";
      rows.push({
        key: "unbilled",
        severity: "info",
        title: `${plural(unbilledDays, "day")} not invoiced yet`,
        context: `${billed ? `The last billing period on ${rentalRef(active.id)} ended ${formatShortDate(billed)}.` : `Nothing has been invoiced on ${rentalRef(active.id)} since it started ${formatShortDate(active.startDate)}.`}${overtimeText}`,
        action: { label: "Raise invoice", intent: { kind: "href", href: `/billing?create=1&rentalId=${active.id}` } },
      });
    }
  }

  for (const rental of data.rentals) {
    if (rental.actualDatesVerificationStatus === ActualDatesVerificationStatus.pending && (rental.actualEndDate || rental.actualStartDate)) {
      const which = rental.actualEndDate ? "return" : "start";
      rows.push({
        key: `verify:${rental.id}`,
        severity: "info",
        title: `The customer hasn't verified the ${which} date on ${rentalRef(rental.id)}`,
        context: `You recorded ${formatDate(rental.actualEndDate ?? rental.actualStartDate)} as the actual ${which} date. ${customerName(rental, names)} can verify or dispute it.`,
        action: { label: `Open ${rentalRef(rental.id)}`, intent: { kind: "href", href: `/rentals/${rental.id}` } },
      });
    }
  }

  if (data.access.workOrders) {
    for (const rental of data.rentals) {
      const wo = workOrderFor(data, rental);
      if (wo && wo.status === WorkOrderStatus.issued && (rental.status === RentalStatus.completed || rental.status === RentalStatus.cancelled)) {
        rows.push({
          key: `wo:${wo.id}`,
          severity: "info",
          title: `Work order ${wo.referenceNumber} is still Issued`,
          context: `${rentalRef(rental.id)} is ${statusLabel("rental", rental.status)}. Work orders aren't completed automatically when a rental ends.`,
          action: { label: "Open work order", intent: { kind: "href", href: `/work-orders/${wo.id}` } },
        });
      }
    }
  }

  return rows;
}

// ------------------------------------------------------------------ key figures

function outstandingFigure(data: MachineData): KeyFigure {
  if (!data.access.billing) {
    return { key: "outstanding", label: "Outstanding", value: "—", context: "Your role can't view billing", tone: "muted" };
  }
  const r = receivables(data);
  const parts = [
    r.overdue.length ? `${r.overdue.length} overdue` : null,
    r.issuedCount ? `${r.issuedCount} issued` : null,
  ].filter(Boolean);
  return {
    key: "outstanding",
    label: "Outstanding",
    value: formatMoney(r.outstanding),
    context: r.outstanding > 0 ? `${parts.join(", ")} · across this machine's rentals` : "Nothing outstanding on this machine",
    tone: r.overdue.length ? "danger" : "default",
  };
}

function nextRentalFigure(data: MachineData): KeyFigure {
  const next = nextConfirmedAfter(data, addDays(data.today, -3650));
  if (!next) return { key: "next", label: "Next rental", value: "None", context: "Nothing is booked on this machine" };
  return {
    key: "next",
    label: "Next rental",
    value: formatShortDate(next.startDate),
    unit: next.startDate.slice(0, 4),
    context: `${rentalRef(next.id)} · ${customerName(next, data.customerNames)} · ${next.endDate ? `to ${formatShortDate(next.endDate)}` : "open-ended"}`,
  };
}

export function keyFigures(data: MachineData, coverage: Coverage | null): KeyFigure[] {
  const { machine, today } = data;
  const active = activeRental(data);
  const job = inProgressJob(data);

  if (machine.status === MachineStatus.retired) {
    const ended = data.rentals
      .filter((r) => r.status === RentalStatus.completed)
      .map((r) => r.actualEndDate ?? r.endDate)
      .filter((d): d is string => Boolean(d))
      .sort()
      .pop();
    const lastJob = data.maintenance.find((m) => m.status === MaintenanceStatus.completed);
    return [
      {
        key: "rentals",
        label: "Rentals",
        value: formatNumber(data.rentals.filter((r) => r.status !== RentalStatus.cancelled).length, 0),
        unit: "all time",
        context: ended ? `Last ended ${formatDate(ended)}` : "No rental completed",
      },
      {
        key: "hours",
        label: "Hours logged",
        value: data.utilization ? formatNumber(data.utilization.totalOperatingHours) : "—",
        unit: "operating h",
        context: data.utilization ? `${plural(data.utilization.loggedDayCount, "day")} with a logsheet` : "Your role can't view logsheets",
      },
      { ...outstandingFigure(data), context: receivables(data).outstanding > 0 ? "Still collectable after retirement" : "Nothing outstanding" },
      {
        key: "jobs",
        label: "Workshop jobs",
        value: formatNumber(data.maintenance.filter((m) => m.status !== MaintenanceStatus.cancelled).length, 0),
        unit: "all time",
        context: lastJob ? `Last: ${MAINTENANCE_TYPE_LABEL[lastJob.maintenanceType].toLowerCase()}, ${formatShortDate(lastJob.startDate)}` : "None recorded",
      },
    ];
  }

  if (active) {
    const figures: KeyFigure[] = [
      {
        key: "rate",
        label: "Contracted rate",
        value: formatMoney(active.rate),
        unit: formatRateUnit(active.rateUnit),
        context: `${rentalRef(active.id)} · ${active.overtimeRate != null ? `overtime ${formatMoney(active.overtimeRate)} per h` : "no overtime rate"}`,
      },
    ];
    if (coverage && data.access.logsheets) {
      figures.push({
        key: "coverage",
        label: "Logsheet coverage",
        value: `${coverage.logged} / ${coverage.elapsed}`,
        unit: "days",
        context: `${coverage.missing.length} missing · ${coverage.unconfirmed.length} not confirmed · today excluded`,
        tone: coverage.missing.length || coverage.unconfirmed.length ? "warning" : "success",
      });
      const operated = data.logsheets.filter((l) => l.rentalId === active.id && l.operatingHours !== null);
      const avg = operated.length ? operated.reduce((s, l) => s + (l.operatingHours ?? 0), 0) / operated.length : null;
      const wo = workOrderFor(data, active);
      figures.push({
        key: "hours",
        label: "Hours per logged day",
        value: avg === null ? "—" : formatNumber(avg),
        unit: avg === null ? undefined : "h",
        context: wo?.workingHours
          ? `Work order ${wo.referenceNumber} says ${formatNumber(wo.workingHours)} h per shift`
          : avg === null
            ? "No operating hours logged yet"
            : "No working hours on a work order to compare",
      });
    } else {
      figures.push({ key: "coverage", label: "Logsheet coverage", value: "—", context: "Your role can't view logsheets", tone: "muted" });
    }
    if (machine.status === MachineStatus.under_maintenance) {
      figures.push({
        key: "back",
        label: "Back from workshop",
        value: job?.endDate ? formatShortDate(job.endDate) : "Not set",
        unit: job?.endDate ? job.endDate.slice(0, 4) : undefined,
        context: job ? `${MAINTENANCE_TYPE_LABEL[job.maintenanceType]} since ${formatShortDate(job.startDate)}` : "No workshop job is in progress",
        tone: job?.endDate ? "default" : "danger",
      });
    } else {
      const next = active.endDate ? nextConfirmedAfter(data, active.endDate) : null;
      const service = active.endDate ? data.maintenance.find((m) => m.status === MaintenanceStatus.scheduled && m.startDate > active.endDate!) : null;
      figures.push({
        key: "until",
        label: "Committed until",
        value: active.endDate ? formatShortDate(active.endDate) : "Open-ended",
        unit: active.endDate ? active.endDate.slice(0, 4) : undefined,
        context: !active.endDate
          ? active.noticePeriodDays != null
            ? `No end date · ${active.noticePeriodDays}-day notice`
            : "No end date · notice period not specified"
          : next
            ? `Next: ${rentalRef(next.id)} from ${formatShortDate(next.startDate)}`
            : `Nothing booked after${service ? ` · service ${formatShortDate(service.startDate)}${service.endDate ? `–${formatShortDate(service.endDate)}` : ""}` : ""}`,
      });
    }
    figures.push(outstandingFigure(data));
    return figures;
  }

  if (machine.status === MachineStatus.under_maintenance) {
    return [
      {
        key: "since",
        label: "In workshop since",
        value: job ? formatShortDate(job.startDate) : "—",
        unit: job ? job.startDate.slice(0, 4) : undefined,
        context: job ? `${MAINTENANCE_TYPE_LABEL[job.maintenanceType]} · ${plural(Math.max(0, daysBetween(job.startDate, today)), "day")}` : "No workshop job is in progress",
      },
      {
        key: "back",
        label: "Back from workshop",
        value: job?.endDate ? formatShortDate(job.endDate) : "Not set",
        unit: job?.endDate ? job.endDate.slice(0, 4) : undefined,
        context: job?.endDate ? "Expected return date on the job" : "The job has no expected return date",
        tone: job?.endDate ? "default" : "danger",
      },
      nextRentalFigure(data),
      outstandingFigure(data),
      {
        key: "jobs",
        label: "Workshop jobs",
        value: formatNumber(data.maintenance.filter((m) => m.status !== MaintenanceStatus.cancelled).length, 0),
        unit: "all time",
        context: "Scheduled, in progress and completed",
      },
    ];
  }

  // Active machine with no active rental: returning, booked or available.
  const returning = data.rentals.find((r) => r.status === RentalStatus.off_rent) ?? null;
  const next = nextConfirmedAfter(data, addDays(today, -3650));
  const figures: KeyFigure[] = [];
  if (returning) {
    const demob = data.transport.find((t) => t.rentalId === returning.id && t.leg === TransportLeg.demobilization && t.status !== TransportStatus.cancelled);
    figures.push(
      {
        key: "offrent",
        label: "Off rent since",
        value: formatShortDate(returning.actualEndDate ?? returning.endDate ?? today),
        unit: (returning.actualEndDate ?? returning.endDate ?? today).slice(0, 4),
        context: `${rentalRef(returning.id)} · ${customerName(returning, data.customerNames)}`,
      },
      {
        key: "demob",
        label: "Demobilization",
        value: demob ? statusLabel("transport", demob.status) : "Not planned",
        context: demob?.plannedDate ? `Planned ${formatShortDate(demob.plannedDate)}` : "No return trip recorded",
        tone: demob ? (demob.status === TransportStatus.delivered ? "success" : "default") : "warning",
      },
    );
  } else {
    figures.push(nextRentalFigure(data));
  }
  const firstBlock = [next?.startDate, data.maintenance.find((m) => blocksAvailability(m.status) && m.startDate >= today)?.startDate]
    .filter((d): d is string => Boolean(d))
    .sort()[0];
  figures.push({
    key: "free",
    label: "Free window",
    value: firstBlock ? formatNumber(Math.max(0, daysBetween(today, firstBlock)), 0) : "Open",
    unit: firstBlock ? "days" : undefined,
    context: firstBlock
      ? `${formatShortDate(today)} → ${formatShortDate(addDays(firstBlock, -1))}, before the next booking`
      : "No rental or workshop job ahead",
    tone: "success",
  });
  if (next) {
    figures.push({
      key: "nextrate",
      label: "Next rate",
      value: formatMoney(next.rate),
      unit: formatRateUnit(next.rateUnit),
      context: `As contracted on ${rentalRef(next.id)}`,
    });
  } else {
    const last = data.rentals.find((r) => r.status === RentalStatus.completed || r.status === RentalStatus.off_rent);
    figures.push({
      key: "lastrate",
      label: "Last rate",
      value: last ? formatMoney(last.rate) : "—",
      unit: last ? formatRateUnit(last.rateUnit) : undefined,
      context: last ? `${rentalRef(last.id)} · ${customerName(last, data.customerNames)}` : "No rentals yet",
    });
  }
  figures.push(outstandingFigure(data));
  const lastReturn = data.transport
    .filter((t) => t.leg === TransportLeg.demobilization && t.status === TransportStatus.delivered && t.actualDate)
    .sort((a, b) => (b.actualDate ?? "").localeCompare(a.actualDate ?? ""))[0];
  if (lastReturn?.actualDate) {
    const late = lastReturn.plannedDate ? daysBetween(lastReturn.plannedDate, lastReturn.actualDate) : null;
    figures.push({
      key: "return",
      label: "Last return",
      value: formatShortDate(lastReturn.actualDate),
      unit: lastReturn.actualDate.slice(0, 4),
      context:
        late === null
          ? "Demobilization delivered"
          : late === 0
            ? "Demobilization delivered on plan"
            : `Demobilization delivered ${plural(Math.abs(late), "day")} ${late > 0 ? "after" : "before"} plan`,
    });
  }
  return figures;
}

// ------------------------------------------------------------------ lanes

export type LaneView = "90" | "12m";

export interface LaneModel {
  windowStart: string;
  windowDays: number;
  months: LaneMonth[];
  lanes: LaneRow[];
  label: string;
}

const MAINTENANCE_BLOCK_LABEL: Record<MaintenanceRecord["maintenanceType"], string> = {
  breakdown: "Breakdown",
  inspection: "Insp.",
  scheduled: "Service",
  other: "Other",
};

export function laneModel(data: MachineData, view: LaneView, coverage: Coverage | null): LaneModel {
  const { today } = data;
  let windowStart: string;
  let windowEnd: string;
  if (view === "90") {
    windowStart = addDays(today, -30);
    windowEnd = addDays(today, 60);
  } else {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 11);
    windowStart = d.toISOString().slice(0, 10);
    windowEnd = addDays(today, 60);
  }
  const windowDays = daysBetween(windowStart, windowEnd);

  const months: LaneMonth[] = [];
  const cursor = new Date(`${windowStart.slice(0, 7)}-01T00:00:00Z`);
  if (windowStart.slice(8) !== "01") cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  while (cursor.toISOString().slice(0, 10) <= windowEnd) {
    const iso = cursor.toISOString().slice(0, 10);
    months.push({ date: iso, label: laneMonthLabel(iso, view) });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const names = data.customerNames;
  const rentalBlocks: LaneBlock[] = data.rentals
    .filter((r) => r.status !== RentalStatus.cancelled)
    .map((r) => ({
      key: `rental:${r.id}`,
      from: r.startDate,
      to: r.endDate,
      kind:
        r.status === RentalStatus.active
          ? "rental_active"
          : r.status === RentalStatus.confirmed
            ? "rental_confirmed"
            : r.status === RentalStatus.off_rent
              ? "rental_off_rent"
              : "rental_completed",
      label: `${rentalRef(r.id)} · ${customerName(r, names)}`,
      tip: `${rentalRef(r.id)}, ${customerName(r, names)}, ${statusLabel("rental", r.status)}, ${formatDate(r.startDate)} to ${r.endDate ? formatDate(r.endDate) : "open-ended"}`,
    }));

  const workshopBlocks: LaneBlock[] = data.maintenance
    .filter((m) => m.status !== MaintenanceStatus.cancelled)
    .map((m) => ({
      key: `maintenance:${m.id}`,
      from: m.startDate,
      to: m.endDate ?? (m.status === MaintenanceStatus.completed ? m.startDate : null),
      kind:
        m.status === MaintenanceStatus.in_progress
          ? "workshop_in_progress"
          : m.status === MaintenanceStatus.scheduled
            ? "workshop_scheduled"
            : "workshop_completed",
      label: MAINTENANCE_BLOCK_LABEL[m.maintenanceType],
      tip: `${MAINTENANCE_TYPE_LABEL[m.maintenanceType]}, ${statusLabel("maintenance", m.status)}, ${formatDate(m.startDate)}${m.endDate ? ` to ${formatDate(m.endDate)}` : ", no end date"}`,
    }));

  const transportBlocks: LaneBlock[] = data.transport
    .filter((t) => t.status !== TransportStatus.cancelled && (t.actualDate || t.plannedDate))
    .map((t) => {
      const date = (t.actualDate ?? t.plannedDate)!;
      const rental = data.rentals.find((r) => r.id === t.rentalId);
      return {
        key: `transport:${t.id}`,
        from: date,
        to: date,
        kind: "marker",
        tip: `${t.leg === TransportLeg.mobilization ? "Mobilization" : "Demobilization"}${rental ? ` for ${rentalRef(rental.id)}` : ""}, ${statusLabel("transport", t.status)}, ${t.actualDate ? "done" : "planned"} ${formatDate(date)}`,
      };
    });

  const lanes: LaneRow[] = [
    { key: "rentals", label: "Rentals", height: 30, blocks: rentalBlocks },
    { key: "workshop", label: "Workshop", height: 24, blocks: workshopBlocks },
    { key: "transport", label: "Transport", height: 22, blocks: transportBlocks },
  ];

  const active = activeRental(data);
  if (view === "90" && active && coverage && data.access.logsheets) {
    const byDate = new Map(data.logsheets.filter((l) => l.rentalId === active.id).map((l) => [l.logDate, l]));
    const ticks: LaneBlock[] = [];
    const start = coverage.from > windowStart ? coverage.from : windowStart;
    for (let day = dayNumber(start); day <= dayNumber(coverage.to); day++) {
      const iso = isoFromDayNumber(day);
      const sheet = byDate.get(iso);
      ticks.push({
        key: `log:${iso}`,
        from: iso,
        to: iso,
        kind: !sheet ? "tick_missing" : sheet.customerConfirmed ? "tick_confirmed" : "tick_unconfirmed",
        tip: `${formatDate(iso)}: ${!sheet ? "no logsheet" : sheet.customerConfirmed ? "logged, customer confirmed" : "logged, not confirmed"}`,
      });
    }
    lanes.push({ key: "logsheets", label: "Logsheets", height: 22, blocks: ticks });
  }

  const label =
    view === "90"
      ? `${formatShortDate(windowStart)} → ${formatDate(windowEnd)} · 30 days back, 60 ahead`
      : `${formatShortDate(windowStart).slice(3)} ${windowStart.slice(0, 4)} → ${formatShortDate(windowEnd).slice(3)} ${windowEnd.slice(0, 4)}`;

  return { windowStart, windowDays, months, lanes, label };
}

// ------------------------------------------------------------------ chain

export function chainSteps(data: MachineData, rental: Rental, coverage: Coverage | null): ChainStep[] {
  const { today, machine } = data;
  const wo = workOrderFor(data, rental);
  const legs = data.transport.filter((t) => t.rentalId === rental.id && t.status !== TransportStatus.cancelled);
  const mob = legs.find((t) => t.leg === TransportLeg.mobilization) ?? null;
  const demob = legs.find((t) => t.leg === TransportLeg.demobilization) ?? null;
  const invoices = data.invoices.filter((i) => i.rentalId === rental.id && i.status !== InvoiceStatus.cancelled);
  const overdue = receivables(data).overdue.filter((o) => o.invoice.rentalId === rental.id);
  const lastBilled = invoices.map((i) => i.billingPeriodEnd).sort().pop();

  const woEnded = rental.status === RentalStatus.completed || rental.status === RentalStatus.cancelled;
  const steps: ChainStep[] = [
    {
      key: "wo",
      label: "Work order",
      icon: "work_order",
      state: !data.access.workOrders
        ? "Not visible"
        : wo
          ? wo.status === WorkOrderStatus.issued && woEnded
            ? "Issued · rental ended"
            : statusLabel("work_order", wo.status)
          : "None",
      tone: !wo ? "gray" : wo.status === WorkOrderStatus.issued && woEnded ? "amber" : wo.status === WorkOrderStatus.completed ? "green" : wo.status === WorkOrderStatus.cancelled ? "gray" : "blue",
      meta: wo ? wo.referenceNumber : "direct rental",
      href: wo ? `/work-orders/${wo.id}` : undefined,
    },
    {
      key: "rental",
      label: "Rental",
      icon: "rental",
      state:
        rental.status === RentalStatus.active && machine.status === MachineStatus.under_maintenance
          ? "Active · in workshop"
          : statusLabel("rental", rental.status),
      tone:
        rental.status === RentalStatus.active && machine.status === MachineStatus.under_maintenance
          ? "amber"
          : rental.status === RentalStatus.off_rent
            ? "amber"
            : rental.status === RentalStatus.completed || rental.status === RentalStatus.cancelled
              ? "gray"
              : "blue",
      meta: rental.status === RentalStatus.confirmed ? `starts ${formatShortDate(rental.startDate)}` : `since ${formatShortDate(rental.actualStartDate ?? rental.startDate)}`,
      href: `/rentals/${rental.id}`,
    },
    {
      key: "mob",
      label: "Mobilization",
      icon: "transport",
      state: !data.access.transport ? "Not visible" : mob ? statusLabel("transport", mob.status) : "Not planned",
      tone: !mob ? (rental.status === RentalStatus.confirmed ? "amber" : "gray") : mob.status === TransportStatus.delivered ? "green" : mob.status === TransportStatus.dispatched ? "amber" : "blue",
      meta: mob
        ? mob.actualDate && mob.plannedDate
          ? daysBetween(mob.plannedDate, mob.actualDate) > 0
            ? `${plural(daysBetween(mob.plannedDate, mob.actualDate), "day")} late`
            : "on plan"
          : mob.plannedDate
            ? `planned ${formatShortDate(mob.plannedDate)}`
            : "no date"
        : "",
    },
    {
      key: "logs",
      label: "Logsheets",
      icon: "logsheet",
      state:
        rental.status === RentalStatus.confirmed
          ? "—"
          : !data.access.logsheets
            ? "Not visible"
            : coverage
              ? `${coverage.logged} of ${coverage.elapsed}`
              : "—",
      tone: rental.status === RentalStatus.confirmed || !coverage ? "gray" : coverage.missing.length ? "amber" : "green",
      meta: rental.status === RentalStatus.confirmed ? "after start" : coverage ? (coverage.missing.length ? `${coverage.missing.length} missing` : "complete") : "",
    },
    {
      key: "invoices",
      label: "Invoices",
      icon: "invoice",
      state: !data.access.billing
        ? "Not visible"
        : overdue.length
          ? `${overdue.length} overdue`
          : invoices.length
            ? `${invoices.length} raised`
            : "None yet",
      tone: overdue.length ? "red" : invoices.length ? "blue" : "gray",
      meta: lastBilled ? `to ${formatShortDate(lastBilled)}` : rental.status === RentalStatus.confirmed ? "after start" : "",
    },
    {
      key: "demob",
      label: "Demobilization",
      icon: "transport",
      state: !data.access.transport ? "Not visible" : demob ? statusLabel("transport", demob.status) : rental.status === RentalStatus.confirmed ? "—" : "Not planned",
      tone: demob ? (demob.status === TransportStatus.delivered ? "green" : "blue") : rental.status === RentalStatus.off_rent ? "amber" : "gray",
      meta: rental.endDate ? `ends ${formatShortDate(rental.endDate)}` : "open-ended",
    },
  ];

  // Exactly one next step.
  let next: string | null = null;
  if (rental.status === RentalStatus.confirmed) next = mob ? null : "mob";
  else if (rental.status === RentalStatus.active) {
    const endingSoon = rental.endDate !== null && daysBetween(today, rental.endDate) <= ENDING_SOON_DAYS;
    if (!mob) next = "mob";
    else if (endingSoon && !demob) next = "demob";
    else if (overdue.length) next = "invoices";
    else if (coverage?.missing.length) next = "logs";
    else {
      const unbilledFrom = lastBilled ? addDays(lastBilled, 1) : rental.startDate;
      if (daysBetween(unbilledFrom, today) >= UNBILLED_THRESHOLD_DAYS) next = "invoices";
    }
  } else if (rental.status === RentalStatus.off_rent) next = demob && demob.status === TransportStatus.delivered ? "invoices" : "demob";
  return steps.map((step) => ({ ...step, next: step.key === next }));
}

// ------------------------------------------------------------------ availability ("Is it free?")

export type FreeResult =
  | { kind: "ok"; title: string; body: string; canCreate: boolean }
  | { kind: "no"; title: string; body: string }
  | { kind: "warn"; title: string; body: string };

/**
 * Combines the API's yes/no (rentals only) with the rentals and workshop
 * jobs already on the page, so a conflict names the blocking record and the
 * earliest free date (the API doesn't return either — ticket b).
 */
export function freeCheckResult(
  data: MachineData,
  from: string,
  to: string | null,
  apiAvailable: boolean | null,
): FreeResult {
  const names = data.customerNames;
  if (data.machine.status === MachineStatus.retired) {
    return { kind: "no", title: "Retired machines can't be booked", body: "This machine's status is Retired, which is final." };
  }
  const rental = conflictingRental(data.rentals, from, to);
  if (rental || apiAvailable === false) {
    if (!rental) {
      return { kind: "no", title: "Not free for these dates", body: "Another rental is booked over part of these dates." };
    }
    return {
      kind: "no",
      title: `Not free — ${rentalRef(rental.id)} overlaps`,
      body: `${rentalRef(rental.id)} (${customerName(rental, names)}) runs ${formatDateRange(rental.startDate, rental.endDate)}.${rental.endDate ? ` Earliest start after it: ${formatDate(addDays(rental.endDate, 1))}.` : " It's open-ended, so there's no free date after it yet."}`,
    };
  }
  const job = conflictingMaintenance(data.maintenance, from, to);
  if (job) {
    return {
      kind: "warn",
      title: "Free of rentals, but a workshop job overlaps",
      body: `A ${MAINTENANCE_TYPE_LABEL[job.maintenanceType].toLowerCase()} job is ${statusLabel("maintenance", job.status).toLowerCase()} ${formatDateRange(job.startDate, job.endDate, "with no end date")}. A rental can't be created over it — pick other dates.`,
    };
  }
  return {
    kind: "ok",
    title: "Free for these dates",
    body: `No rental or workshop job between ${formatDate(from)} and ${to ? formatDate(to) : "open-ended"}.`,
    canCreate: from >= data.today,
  };
}

// ------------------------------------------------------------------ inspection

export function lastInspection(data: MachineData): MaintenanceRecord | null {
  return data.maintenance.find((m) => m.maintenanceType === MaintenanceType.inspection && m.status === MaintenanceStatus.completed) ?? null;
}

// ------------------------------------------------------------------ menu guards

/** Rental that blocks retiring (the API doesn't check — plan §1). */
export function retireBlocker(data: MachineData): Rental | null {
  return committingRentals(data)[0] ?? null;
}

/** Rental whose dates include today — sending to the workshop from today would 409. */
export function workshopBlocker(data: MachineData): Rental | null {
  return conflictingRental(data.rentals, data.today, data.today);
}

export type RecordTab = "rentals" | "logsheets" | "workshop" | "transport" | "invoices";
export const RECORD_TABS: RecordTab[] = ["rentals", "logsheets", "workshop", "transport", "invoices"];
