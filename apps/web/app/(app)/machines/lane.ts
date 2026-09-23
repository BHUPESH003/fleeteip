import type { Machine } from "@fleetip/contracts/equipment";
import type { MaintenanceRecord } from "@fleetip/contracts/maintenance";
import type { Rental } from "@fleetip/contracts/rental";
import type { LaneBlock, LaneGapLabel } from "@fleetip/ui";
import { daysBetween, formatShortDate, todayIsoDate } from "../../../lib/format";

/**
 * Deployment — derived from today's rentals against a machine, never
 * confused with the stored `machine.status`. Kept as its own concept per
 * the design system's "stored and derived never look alike" rule.
 */
export type Deployment = "on_rent" | "available" | "maintenance" | "retired";

export function deploymentFor(machine: Machine, rentals: Rental[]): Deployment {
  if (machine.status === "retired") return "retired";
  if (machine.status === "under_maintenance") return "maintenance";
  const occupying = rentals.find(
    (r) => r.machineId === machine.id && (r.status === "active" || r.status === "confirmed"),
  );
  if (occupying?.status === "active") return "on_rent";
  if (occupying?.status === "confirmed") return "on_rent"; // confirmed-ahead still reads as "on rent" for the deployment label; the lane block itself distinguishes active vs. confirmed.
  return "available";
}

export const DEPLOYMENT_LABEL: Record<Deployment, string> = {
  on_rent: "On rent",
  available: "Available",
  maintenance: "Maintenance",
  retired: "Retired",
};

/** Every rental (active/confirmed) that occupies this machine, soonest first, for lane-block derivation. */
function occupyingRentals(machineId: string, rentals: Rental[]): Rental[] {
  return rentals
    .filter((r) => r.machineId === machineId && (r.status === "active" || r.status === "confirmed"))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/**
 * Lane blocks for one machine's row, within the given window: occupying
 * rentals plus any open (scheduled/in_progress) maintenance windows —
 * `maintenanceRecords` defaults to [] for a caller without
 * maintenance.manage, same graceful-omission pattern as everything else
 * on this page.
 */
export function laneBlocksFor(
  machineId: string,
  rentals: Rental[],
  maintenanceRecords: MaintenanceRecord[] = [],
): LaneBlock[] {
  const rentalBlocks: LaneBlock[] = occupyingRentals(machineId, rentals).map((r) => ({
    from: r.startDate,
    to: r.endDate,
    kind: r.status === "active" ? "active" : "confirmed",
  }));
  const maintenanceBlocks: LaneBlock[] = maintenanceRecords
    .filter((rec) => rec.machineId === machineId && (rec.status === "scheduled" || rec.status === "in_progress"))
    .map((rec) => ({ from: rec.startDate, to: rec.endDate, kind: "maintenance" }));
  return [...rentalBlocks, ...maintenanceBlocks];
}

/**
 * A single "frees on"/"idle for"/"open" gap label per row, positioned just
 * after the last occupying block (or at the window's start if the machine
 * has no upcoming rental at all). Mirrors the design canvas's demo data
 * shape without inventing new backend fields — every value here is derived
 * from real rental start/end dates already on hand.
 */
export function gapLabelFor(
  machine: Machine,
  rentals: Rental[],
  windowStart: string,
  windowDays: number,
): LaneGapLabel[] {
  if (machine.status === "retired") return [];
  const occupying = occupyingRentals(machine.id, rentals);
  const today = todayIsoDate();

  if (occupying.length === 0) {
    const idleSinceDate = idleSince(machine, rentals);
    const text = idleSinceDate
      ? `idle ${Math.max(0, daysBetween(idleSinceDate, today))} days`
      : "open all 90 days";
    return [{ left: 2, text, tone: daysSinceIdleTone(idleSinceDate) }];
  }

  const last = occupying[occupying.length - 1];
  if (!last || !last.endDate) return []; // open-ended — runs to the window's edge, nothing frees up to label
  const freeFrom = new Date(`${last.endDate}T00:00:00Z`);
  freeFrom.setUTCDate(freeFrom.getUTCDate() + 1);
  const freeFromIso = freeFrom.toISOString().slice(0, 10);
  const left = ((Date.parse(`${freeFromIso}T00:00:00Z`) - Date.parse(`${windowStart}T00:00:00Z`)) /
      86_400_000 /
      windowDays) *
    100;
  if (left > 78 || left < 0) return [];
  return [{ left: left + 1.5, text: `free ${formatShortDate(freeFromIso)}`, tone: "free" }];
}

/** The date a machine most recently came off rent, if it has rental history at all. */
function idleSince(machine: Machine, rentals: Rental[]): string | null {
  const past = rentals
    .filter((r) => r.machineId === machine.id && r.endDate && r.status !== "cancelled")
    .sort((a, b) => (b.endDate ?? "").localeCompare(a.endDate ?? ""));
  return past[0]?.endDate ?? null;
}

function daysSinceIdleTone(idleSinceDate: string | null): "free" | "warn" {
  if (!idleSinceDate) return "free";
  const idleDays = daysBetween(idleSinceDate, todayIsoDate());
  return idleDays > 30 ? "warn" : "free";
}

/** Two-letter tile code drawn from a subcategory's own code, per the design system's asset-identity part. */
export function tileCodeFor(subcategoryCode: string | undefined): string {
  if (!subcategoryCode) return "—";
  return subcategoryCode.slice(0, 3).toUpperCase();
}
