import { encodeCursor, type Page, type ParsedListQuery } from "../src/shared/list-query.js";

// In-memory twin of infrastructure/database/list-page.ts executePage, for
// fake repositories: keyset on (sortValue, id), ties broken by id.
export function pageInMemory<T extends { id: string }>(
  rows: T[],
  sortValue: (row: T) => string,
  query: ParsedListQuery,
): Page<T> {
  const sign = query.dir === "asc" ? 1 : -1;
  const compare = (a: [string, string], b: [string, string]) =>
    sign * (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
  const cursor = query.cursor;
  const sorted = rows
    .map((row) => ({ row, key: [sortValue(row), row.id] as [string, string] }))
    .sort((a, b) => compare(a.key, b.key))
    .filter(({ key }) => !cursor || compare(key, [cursor.value, cursor.id]) > 0);
  const pageRows = sorted.slice(0, query.limit);
  const last = pageRows.at(-1);
  return {
    items: pageRows.map(({ row }) => row),
    nextCursor:
      sorted.length > query.limit && last ? encodeCursor(query, { value: last.key[0], id: last.key[1] }) : null,
  };
}
