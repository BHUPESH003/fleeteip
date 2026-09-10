import { describe, expect, it } from "vitest";
import type { RentalStatus } from "@fleetip/contracts/rental";
import { canTransition } from "../src/modules/marketplace/rental/domain/rental-status.js";

const STATUSES: RentalStatus[] = ["confirmed", "active", "off_rent", "completed", "cancelled"];

const LEGAL: Array<[RentalStatus, RentalStatus]> = [
  ["confirmed", "active"],
  ["active", "off_rent"],
  ["off_rent", "completed"],
  ["confirmed", "cancelled"],
  ["active", "cancelled"],
  ["off_rent", "cancelled"],
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
