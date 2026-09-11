import { describe, expect, it } from "vitest";
import type { RequirementStatus } from "@fleetip/contracts/rfq";
import { canTransition } from "../src/modules/marketplace/rfq/domain/requirement-status.js";

const STATUSES: RequirementStatus[] = ["open", "closed", "cancelled"];

const LEGAL: Array<[RequirementStatus, RequirementStatus]> = [
  ["open", "closed"],
  ["open", "cancelled"],
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
