import { describe, expect, it } from "vitest";
import type { AuctionStatus } from "@fleetip/contracts/auction";
import { canCancel } from "../src/modules/marketplace/auction/domain/auction-status.js";

const STATUSES: AuctionStatus[] = ["scheduled", "live", "closed", "cancelled"];
const CANCELLABLE: AuctionStatus[] = ["scheduled", "live"];

describe("canCancel", () => {
  for (const status of STATUSES) {
    const expected = CANCELLABLE.includes(status);
    it(`${status} is ${expected ? "cancellable" : "not cancellable"}`, () => {
      expect(canCancel(status)).toBe(expected);
    });
  }
});
