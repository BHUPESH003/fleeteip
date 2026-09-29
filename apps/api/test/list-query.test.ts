import { describe, expect, it } from "vitest";
import { machineListQuerySchema } from "@fleetip/contracts/list";
import { decodeCursor, encodeCursor, parseListQuery } from "../src/shared/list-query.js";
import { ValidationError } from "../src/shared/errors.js";
import { pageInMemory } from "./list-page-fake.js";

const ID_A = "00000000-0000-4000-8000-00000000000a";

describe("parseListQuery", () => {
  it("returns null with no list params, so the endpoint keeps its unpaged array", () => {
    expect(parseListQuery(machineListQuerySchema, {})).toBeNull();
    expect(parseListQuery(machineListQuerySchema, undefined)).toBeNull();
    expect(parseListQuery(machineListQuerySchema, { unrelated: "x" })).toBeNull();
  });

  it("applies defaults once any list param is present", () => {
    expect(parseListQuery(machineListQuerySchema, { status: "active" })).toEqual({
      limit: 50,
      sort: "createdAt",
      dir: "desc",
      status: "active",
      cursor: null,
    });
  });

  it("bounds limit to 1..200", () => {
    expect(parseListQuery(machineListQuerySchema, { limit: "1" })?.limit).toBe(1);
    expect(parseListQuery(machineListQuerySchema, { limit: "200" })?.limit).toBe(200);
    for (const limit of ["0", "201", "-5", "2.5", "abc"]) {
      expect(() => parseListQuery(machineListQuerySchema, { limit })).toThrow(ValidationError);
    }
  });

  it("rejects an unknown sort or status", () => {
    expect(() => parseListQuery(machineListQuerySchema, { sort: "price" })).toThrow(ValidationError);
    expect(() => parseListQuery(machineListQuerySchema, { status: "lost" })).toThrow(ValidationError);
  });

  it("round-trips a cursor and rejects one from another sort or a garbled one", () => {
    const query = { sort: "createdAt", dir: "desc" as const };
    const cursor = { value: "2026-09-29 10:00:00.123456+05:30", id: ID_A };
    const encoded = encodeCursor(query, cursor);
    expect(decodeCursor(query, encoded)).toEqual(cursor);
    expect(parseListQuery(machineListQuerySchema, { cursor: encoded })?.cursor).toEqual(cursor);
    expect(() => decodeCursor({ sort: "assetCode", dir: "desc" }, encoded)).toThrow(ValidationError);
    expect(() => decodeCursor({ sort: "createdAt", dir: "asc" }, encoded)).toThrow(ValidationError);
    expect(() => decodeCursor(query, "not-a-cursor")).toThrow(ValidationError);
    expect(() => decodeCursor(query, encodeCursor(query, { value: "x", id: "1; drop" }))).toThrow(
      ValidationError,
    );
  });
});

describe("keyset paging", () => {
  // Five rows, three sharing one sort value: paging must still visit every
  // row exactly once, ties ordered by id.
  const rows = [
    { id: "00000000-0000-4000-8000-000000000003", at: "2026-01-02" },
    { id: "00000000-0000-4000-8000-000000000001", at: "2026-01-02" },
    { id: "00000000-0000-4000-8000-000000000005", at: "2026-01-01" },
    { id: "00000000-0000-4000-8000-000000000002", at: "2026-01-02" },
    { id: "00000000-0000-4000-8000-000000000004", at: "2026-01-03" },
  ];

  function walk(dir: "asc" | "desc", limit: number) {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const query = parseListQuery(machineListQuerySchema, { limit: String(limit), dir, cursor })!;
      const page = pageInMemory(rows, (row) => row.at, query);
      seen.push(...page.items.map((row) => row.id.slice(-1)));
      if (!page.nextCursor) return seen;
      cursor = page.nextCursor;
    }
    throw new Error("did not terminate");
  }

  it("visits every row once in a stable order across page sizes", () => {
    for (const limit of [1, 2, 3, 5, 200]) {
      expect(walk("desc", limit)).toEqual(["4", "3", "2", "1", "5"]);
      expect(walk("asc", limit)).toEqual(["5", "1", "2", "3", "4"]);
    }
  });

  it("has no next cursor when the page is exactly the rest", () => {
    const query = parseListQuery(machineListQuerySchema, { limit: "5" })!;
    expect(pageInMemory(rows, (row) => row.at, query).nextCursor).toBeNull();
  });
});
