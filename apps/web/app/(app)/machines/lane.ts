/**
 * The machines list's "Next 90 days" column: one lane per row, starting
 * today. It draws what holds a machine's dates — rentals that still commit
 * them (confirmed, active, off rent: the same set the API's availability
 * check counts) and workshop jobs that block new rentals (scheduled, in
 * progress) — plus one gap label saying when the machine is next free.
 *
 * "Right now" itself is derived by deploymentFor in ./shared.ts; this file
 * only lays out the lane. Dates are the rentals' planned start/end, because
 * that is the range the API books against (rentals.commitment_range).
 */
import { MachineStatus, type Machine } from "@fleetip/contracts/equipment";
import type { MaintenanceRecord } from "@fleetip/contracts/maintenance";
import { RentalStatus, type Rental } from "@fleetip/contracts/rental";
import type { LaneBlock, LaneBlockKind, LaneGapLabel, LaneLegendItem } from "@fleetip/ui";
import { addDays, dayNumber, daysBetween, formatDate, formatShortDate, laneMonthLabel, rentalRef } from "../../../lib/format";
import { statusLabel } from "../../../lib/status";
import { COMMITTING_RENTAL_STATUSES, MAINTENANCE_TYPE_LABEL, blocksAvailability } from "./shared";

/** Width of the list lane, in days, starting today. */
export const LANE_DAYS = 90;

/** Days an Available machine can sit without a rental before it's flagged as idle. */
export const IDLE_DAYS = 30;

/** One legend under the table, not one per row. */
export const LANE_LEGEND: LaneLegendItem[] = [
  { label: "On rent", kind: "rental_active" },
  { label: "Booked", kind: "rental_confirmed" },
  { label: "Returning", kind: "rental_off_rent" },
  { label: "In workshop", kind: "workshop_in_progress" },
  { label: "Workshop booked", kind: "workshop_scheduled" },
];

const RENTAL_KIND: Partial<Record<Rental["status"], LaneBlockKind>> = {
  active: "rental_active",
  confirmed: "rental_confirmed",
  off_rent: "rental_off_rent",
};

const WORKSHOP_KIND: Partial<Record<MaintenanceRecord["status"], LaneBlockKind>> = {
  in_progress: "workshop_in_progress",
  scheduled: "workshop_scheduled",
};

/**
 * Lane blocks for one machine. `rentals` and `maintenance` may hold other
 * machines' records; only this machine's are drawn. Callers without the
 * Rentals or Maintenance permission pass [] for that list.
 */
export function laneBlocksFor(
  machineId: string,
  rentals: Rental[],
  maintenance: MaintenanceRecord[],
  customerFor: (rental: Rental) => string,
): LaneBlock[] {
  const rentalBlocks: LaneBlock[] = rentals
    .filter((r) => r.machineId === machineId && COMMITTING_RENTAL_STATUSES.includes(r.status))
    .map((r) => ({
      key: `rental:${r.id}`,
      from: r.startDate,
      to: r.endDate,
      kind: RENTAL_KIND[r.status] ?? "rental_confirmed",
      tip: `${rentalRef(r.id)}, ${customerFor(r)}, ${statusLabel("rental", r.status)}, ${formatDate(r.startDate)} to ${r.endDate ? formatDate(r.endDate) : "open-ended"}`,
    }));
  const workshopBlocks: LaneBlock[] = maintenance
    .filter((m) => m.machineId === machineId && blocksAvailability(m.status))
    .map((m) => ({
      key: `maintenance:${m.id}`,
      from: m.startDate,
      to: m.endDate,
      kind: WORKSHOP_KIND[m.status] ?? "workshop_scheduled",
      tip: `${MAINTENANCE_TYPE_LABEL[m.maintenanceType]}, ${statusLabel("maintenance", m.status)}, ${formatDate(m.startDate)}${m.endDate ? ` to ${formatDate(m.endDate)}` : ", no end date"}`,
    }));
  return [...rentalBlocks, ...workshopBlocks].sort((a, b) => a.from.localeCompare(b.from));
}

/**
 * First date on or after `from` that no block covers, or null when an
 * open-ended block (open-ended rental, job with no return date) never lets go.
 */
export function firstFreeDate(blocks: Array<Pick<LaneBlock, "from" | "to">>, from: string): string | null {
  let cursor = from;
  let moved = true;
  while (moved) {
    moved = false;
    for (const block of blocks) {
      if (block.from <= cursor && (block.to === null || block.to >= cursor)) {
        if (block.to === null) return null;
        cursor = addDays(block.to, 1);
        moved = true;
      }
    }
  }
  return cursor;
}

export interface IdleInfo {
  /** The day the machine came back, or the day it was registered if it was never rented. */
  since: string;
  days: number;
  reason: "returned" | "registered";
}

/**
 * How long an Available machine has had no rental: since its last completed
 * rental ended (actual end, else planned end), or since it was registered in
 * FleetIP when it has never been rented. Only meaningful for machines with no
 * rental holding dates — callers use it for Available rows only.
 */
export function idleSince(machine: Machine, rentals: Rental[], today: string): IdleInfo {
  const lastEnd = rentals
    .filter((r) => r.machineId === machine.id && r.status === RentalStatus.completed)
    .map((r) => r.actualEndDate ?? r.endDate ?? r.updatedAt.slice(0, 10))
    .sort()
    .pop();
  const since = lastEnd ?? machine.createdAt.slice(0, 10);
  return { since, days: Math.max(0, daysBetween(since, today)), reason: lastEnd ? "returned" : "registered" };
}

/**
 * The single gap label on a row's lane: when the machine is next free.
 * Retired machines get none; neither does a lane whose rentals the viewer
 * can't see (`rentalsKnown` false), because "free" would be a guess.
 */
export function gapLabelFor({
  status,
  blocks,
  windowStart,
  idle,
  rentalsKnown,
}: {
  status: Machine["status"];
  blocks: LaneBlock[];
  windowStart: string;
  idle: IdleInfo | null;
  rentalsKnown: boolean;
}): LaneGapLabel[] {
  if (status === MachineStatus.retired || !rentalsKnown) return [];
  const windowEnd = addDays(windowStart, LANE_DAYS - 1);
  const inWindow = blocks.filter((b) => b.from <= windowEnd && (b.to === null || b.to >= windowStart));
  const free = firstFreeDate(inWindow, windowStart);
  if (free === null) return [];

  if (free === windowStart) {
    const next = inWindow.find((b) => b.from > windowStart);
    if (!next) {
      if (idle && idle.days > IDLE_DAYS) return [{ left: 1.5, text: `idle ${idle.days} days`, tone: "warn" }];
      return [{ left: 1.5, text: `free all ${LANE_DAYS} days`, tone: "free" }];
    }
    // Only label a free stretch wide enough to hold the text.
    return daysBetween(windowStart, next.from) >= 30
      ? [{ left: 1.5, text: `free till ${formatShortDate(addDays(next.from, -1))}`, tone: "free" }]
      : [];
  }

  const left = (daysBetween(windowStart, free) / LANE_DAYS) * 100;
  if (left > 78) return [];
  return [{ left: left + 1.5, text: `free ${formatShortDate(free)}`, tone: "free" }];
}

/**
 * Month ticks for the column header, positioned like the lane itself
 * ("1 Oct", "1 Nov"). A tick too close to the "Today" label is skipped.
 */
export function laneMonths(windowStart: string): Array<{ date: string; label: string; left: number }> {
  const ticks: Array<{ date: string; label: string; left: number }> = [];
  const start = dayNumber(windowStart);
  const cursor = new Date(`${windowStart.slice(0, 7)}-01T00:00:00Z`);
  cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  while (dayNumber(cursor.toISOString().slice(0, 10)) < start + LANE_DAYS) {
    const iso = cursor.toISOString().slice(0, 10);
    const left = ((dayNumber(iso) - start) / LANE_DAYS) * 100;
    if (left >= 14) ticks.push({ date: iso, label: laneMonthLabel(iso, "90"), left });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return ticks;
}
