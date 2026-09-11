import { describe, expect, it } from "vitest";
import type { CommercialQuotationStatus } from "@fleetip/contracts/quotation";
import { canTransition } from "../src/modules/marketplace/commercial-quotation/domain/quotation-status.js";

const STATUSES: CommercialQuotationStatus[] = [
  "draft",
  "sent",
  "negotiating",
  "awarded",
  "rejected",
  "expired",
  "withdrawn",
];

const LEGAL: Array<[CommercialQuotationStatus, CommercialQuotationStatus]> = [
  ["draft", "sent"],
  ["draft", "withdrawn"],
  ["sent", "negotiating"],
  ["sent", "awarded"],
  ["sent", "rejected"],
  ["sent", "expired"],
  ["sent", "withdrawn"],
  ["negotiating", "awarded"],
  ["negotiating", "rejected"],
  ["negotiating", "expired"],
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
