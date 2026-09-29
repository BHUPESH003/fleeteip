import { describe, expect, it } from "vitest";
import { nextQuery, safeNextPath } from "../app/(public)/next-param";

describe("safeNextPath", () => {
  it("keeps same-origin paths with their query and hash", () => {
    expect(safeNextPath("/machines")).toBe("/machines");
    expect(safeNextPath("/rentals/1?tab=terms#log")).toBe("/rentals/1?tab=terms#log");
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["absolute URL", "https://evil.com/x"],
    ["protocol-relative", "//evil.com"],
    ["backslash host", "/\\evil.com"],
    ["tab trick", "/\t/evil.com"],
    ["newline trick", "/\n/evil.com"],
    ["javascript scheme", "javascript:alert(1)"],
    ["relative path", "machines"],
  ])("falls back to the dashboard for %s", (_, raw) => {
    expect(safeNextPath(raw)).toBe("/");
  });

  it("never sends a signed-in user back to the auth pages", () => {
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath("/signup?next=/x")).toBe("/");
  });

  it("normalises dot segments without leaving the site", () => {
    expect(safeNextPath("/a/../../billing")).toBe("/billing");
  });
});

describe("nextQuery", () => {
  it("omits the dashboard and encodes the rest", () => {
    expect(nextQuery("/")).toBe("");
    expect(nextQuery("/machines?x=1")).toBe("?next=%2Fmachines%3Fx%3D1");
  });
});
