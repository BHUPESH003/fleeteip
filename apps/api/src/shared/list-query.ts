import type { Page, SortDir } from "@fleetip/contracts/list";
import type { AnyZodObject, z } from "zod";
import { ValidationError } from "./errors.js";
import { parseWithSchema } from "./validate.js";

export type { Page };

// Keyset position: the last row's sort value (as the database renders it to
// text) and id, so ties on the sort value still page in a stable order.
export interface ListCursor {
  value: string;
  id: string;
}

type RawListQuery = { limit: number; sort: string; dir: SortDir; cursor?: string };

export type ParsedListQuery<Q extends RawListQuery = RawListQuery> = Omit<Q, "cursor"> & {
  cursor: ListCursor | null;
};

interface EncodedCursor {
  s: string;
  d: SortDir;
  v: string;
  id: string;
}

export function encodeCursor(query: Pick<RawListQuery, "sort" | "dir">, cursor: ListCursor): string {
  const payload: EncodedCursor = { s: query.sort, d: query.dir, v: cursor.value, id: cursor.id };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decodeCursor(query: Pick<RawListQuery, "sort" | "dir">, raw: string): ListCursor {
  let payload: Partial<EncodedCursor>;
  try {
    payload = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw invalidCursor("That cursor isn't valid.");
  }
  if (typeof payload?.v !== "string" || typeof payload.id !== "string" || !UUID.test(payload.id)) {
    throw invalidCursor("That cursor isn't valid.");
  }
  if (payload.s !== query.sort || payload.d !== query.dir) {
    throw invalidCursor("That cursor belongs to a different sort. Start again without a cursor.");
  }
  return { value: payload.v, id: payload.id };
}

function invalidCursor(message: string) {
  return new ValidationError(message, [{ path: "cursor", message }]);
}

/**
 * Parses list paging/filter params with the endpoint's contract schema.
 * Returns null when the request carries none of the schema's params — the
 * caller then serves today's full, unpaged array (backwards compatible).
 */
export function parseListQuery<S extends AnyZodObject>(
  schema: S,
  query: unknown,
): ParsedListQuery<z.output<S> & RawListQuery> | null {
  const raw = (query ?? {}) as Record<string, unknown>;
  if (!Object.keys(schema.shape).some((key) => raw[key] !== undefined)) return null;
  const parsed = parseWithSchema(schema, raw) as z.output<S> & RawListQuery;
  const { cursor, ...rest } = parsed;
  return { ...rest, cursor: cursor ? decodeCursor(parsed, cursor) : null };
}

export function mapPage<T, U>(page: Page<T>, map: (item: T) => U): Page<U> {
  return { items: page.items.map(map), nextCursor: page.nextCursor };
}

export async function mapPageAsync<T, U>(page: Page<T>, map: (item: T) => Promise<U>): Promise<Page<U>> {
  return { items: await Promise.all(page.items.map(map)), nextCursor: page.nextCursor };
}

// ILIKE pattern for a free-text `q`, with LIKE wildcards escaped.
export function containsPattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// Id prefix for a displayed reference like "RN-1A2B3C4D" (lib/format.ts
// rentalRef), or null when `q` isn't shaped like one.
export function refIdPrefix(q: string, prefix: string): string | null {
  const match = new RegExp(`^${prefix}-?([0-9a-f]{1,8})$`, "i").exec(q.trim());
  return match ? `${match[1]!.toLowerCase()}%` : null;
}
