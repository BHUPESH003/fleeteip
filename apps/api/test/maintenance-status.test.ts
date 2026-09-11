import { describe, expect, it } from "vitest";
import type { MaintenanceStatus } from "@fleetip/contracts/maintenance";
import { canTransition } from "../src/modules/maintenance/domain/maintenance-status.js";

const STATUSES: MaintenanceStatus[] = ["scheduled", "in_progress", "completed", "cancelled"];

const LEGAL: Array<[MaintenanceStatus, MaintenanceStatus]> = [
  ["scheduled", "in_progress"],
  ["scheduled", "cancelled"],
  ["in_progress", "completed"],
  ["in_progress", "cancelled"],
];

describe("canTransition", () => {
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const expected = LEGAL.some(([legalFrom, legalTo]) => legalFrom === from && legalTo === to);
      it(`${from} -> ${to} is ${expected ? "legal" : "illegal"}`, () => {
        expect(canTransition(from, to)).toBe(expected);
      });
    }
  }
});
