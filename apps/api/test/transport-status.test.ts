import { describe, expect, it } from "vitest";
import type { TransportStatus } from "@fleetip/contracts/transport";
import { canTransition } from "../src/modules/transport/domain/transport-status.js";

const STATUSES: TransportStatus[] = ["planned", "dispatched", "delivered", "cancelled"];

const LEGAL: Array<[TransportStatus, TransportStatus]> = [
  ["planned", "dispatched"],
  ["planned", "cancelled"],
  ["dispatched", "delivered"],
  ["dispatched", "cancelled"],
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
