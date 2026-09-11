import { describe, expect, it } from "vitest";
import type { InvoiceStatus } from "@fleetip/contracts/billing";
import { canTransition } from "../src/modules/billing/domain/invoice-status.js";

const STATUSES: InvoiceStatus[] = ["draft", "issued", "paid", "overdue", "cancelled"];

const LEGAL: Array<[InvoiceStatus, InvoiceStatus]> = [
  ["draft", "issued"],
  ["draft", "cancelled"],
  ["issued", "paid"],
  ["issued", "overdue"],
  ["issued", "cancelled"],
  ["overdue", "paid"],
  ["overdue", "cancelled"],
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
