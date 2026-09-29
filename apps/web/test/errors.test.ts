import { describe, expect, it } from "vitest";
import { ApiError } from "../lib/api-client";
import { toFormFailure } from "../lib/errors";

const TITLE = "RN-1 wasn't saved";

describe("toFormFailure", () => {
  it("puts 400 issues with a path under their fields, with no banner", () => {
    const error = new ApiError("Invalid", 400, "validation", [
      { path: "rate", message: "Number must be greater than 0" },
      { path: "terms.startDate", message: "Enter the start date" },
    ]);
    expect(toFormFailure(error, TITLE)).toEqual({
      fieldErrors: { rate: "Enter a value above 0.", "terms.startDate": "Enter the start date." },
      banner: null,
    });
  });

  it("puts unpathed 400 issues in the banner, beside the pathed ones", () => {
    const error = new ApiError("Invalid", 400, "validation", [
      { path: "rate", message: "Too high." },
      { path: "", message: "End must be after start." },
    ]);
    const failure = toFormFailure(error, TITLE);
    expect(failure.fieldErrors).toEqual({ rate: "Too high." });
    expect(failure.banner).toEqual({ title: "Some entries need attention", body: "End must be after start." });
  });

  it("titles a 400 with no issues with the fail title and the server's message", () => {
    const failure = toFormFailure(new ApiError("Validity is before start", 400), TITLE);
    expect(failure).toEqual({ fieldErrors: {}, banner: { title: TITLE, body: "Validity is before start." } });
  });

  it("puts a 409 with a field under that field, preferring the form's conflicts copy", () => {
    const error = new ApiError("asset code already exists", 409, "conflict", [], "assetCode");
    expect(toFormFailure(error, TITLE).fieldErrors).toEqual({
      assetCode: "That asset code is already used by another machine in your organization.",
    });
    expect(toFormFailure(error, TITLE, { assetCode: "Taken." })).toEqual({ fieldErrors: { assetCode: "Taken." }, banner: null });
  });

  it("puts a 409 without a field in the banner under the fail title", () => {
    const failure = toFormFailure(new ApiError("Cannot transition rental", 409), TITLE);
    expect(failure.fieldErrors).toEqual({});
    expect(failure.banner?.title).toBe(TITLE);
    expect(failure.banner?.body).toMatch(/changed since the page loaded/);
  });

  it("uses statusCopy over the generic wording, even for a 409 with a field", () => {
    const copy = { title: "Can't take payments", body: "Only Issued invoices." };
    expect(toFormFailure(new ApiError("x", 409), TITLE, undefined, { 409: copy })).toEqual({ fieldErrors: {}, banner: copy });
    expect(toFormFailure(new ApiError("x", 409, "conflict", [], "rate"), TITLE, undefined, { 409: copy }).banner).toEqual(copy);
    expect(toFormFailure(new ApiError("x", 404), TITLE, undefined, { 409: copy }).banner?.title).toBe("We can't find that record");
  });

  it("says offline, and never shows 500 server text", () => {
    expect(toFormFailure(new ApiError("fetch failed", 0), TITLE).banner?.title).toBe("You're offline");
    const server = toFormFailure(new ApiError("pg: relation missing", 500), TITLE).banner;
    expect(server?.title).toBe(TITLE);
    expect(server?.body).not.toMatch(/pg:/);
  });

  it("treats a non-API error as a browser problem", () => {
    expect(toFormFailure(new TypeError("boom"), TITLE).banner).toEqual({
      title: TITLE,
      body: "Something unexpected happened in the browser. Reload the page and try again.",
    });
  });
});
