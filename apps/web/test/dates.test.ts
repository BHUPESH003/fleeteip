import { earliestIsoDate, isoDate, latestIsoDate, todayIsoDate } from "@fleetip/contracts/shared";
import { describe, expect, it } from "vitest";

describe("isoDate (current year ± 50)", () => {
  it("accepts today and both edges of the range", () => {
    for (const date of [todayIsoDate(), earliestIsoDate(), latestIsoDate()]) expect(isoDate().safeParse(date).success).toBe(true);
  });

  it("rejects dates outside the range with the years in the message", () => {
    const year = Number(todayIsoDate().slice(0, 4));
    for (const date of [`${year - 51}-12-31`, `${year + 51}-01-01`]) {
      const result = isoDate().safeParse(date);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(`Enter a date between ${year - 50} and ${year + 50}.`);
    }
  });
});
