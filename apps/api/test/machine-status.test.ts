import { describe, expect, it } from "vitest";
import type { MachineStatus } from "@fleetip/contracts/equipment";
import { canTransition } from "../src/modules/equipment/domain/machine-status.js";

const STATUSES: MachineStatus[] = ["active", "under_maintenance", "retired"];

const LEGAL: Array<[MachineStatus, MachineStatus]> = [
  ["active", "under_maintenance"],
  ["under_maintenance", "active"],
  ["active", "retired"],
  ["under_maintenance", "retired"],
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
