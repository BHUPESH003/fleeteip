import { sql, type SelectQueryBuilder } from "kysely";
import { encodeCursor, type Page, type ParsedListQuery } from "../../shared/list-query.js";

/**
 * Runs `query` as one keyset page ordered by (sortColumn, idColumn) in
 * `list.dir`. The sort value is carried in the cursor as the database's own
 * ::text rendering, so timestamps keep their microseconds (a JS Date would
 * truncate to ms and skip rows) and Postgres casts it straight back.
 * Sort columns must be NOT NULL (a NULL never satisfies the row compare).
 * `query` must not have its own ORDER BY / LIMIT.
 */
export async function executePage<DB, TB extends keyof DB, O, R = O>(
  query: SelectQueryBuilder<DB, TB, O>,
  sortColumn: string,
  idColumn: string,
  list: ParsedListQuery,
  toRecord: (row: O) => R = (row) => row as unknown as R,
): Promise<Page<R>> {
  const sort = sql.ref(sortColumn);
  const id = sql.ref(idColumn);
  let paged = query.select(sql<string>`${sort}::text`.as("__sort_value"));
  if (list.cursor) {
    const op = sql.raw(list.dir === "asc" ? ">" : "<");
    paged = paged.where(sql<boolean>`(${sort}, ${id}) ${op} (${list.cursor.value}, ${list.cursor.id})`);
  }
  const rows = (await paged
    .orderBy(sql`${sort}`, list.dir)
    .orderBy(sql`${id}`, list.dir)
    .limit(list.limit + 1)
    .execute()) as (O & { __sort_value: string })[];

  const hasMore = rows.length > list.limit;
  const pageRows = hasMore ? rows.slice(0, list.limit) : rows;
  const last = pageRows.at(-1) as (O & { __sort_value: string; id: string }) | undefined;
  const items = pageRows.map(({ __sort_value: _sortValue, ...row }) => toRecord(row as O));
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(list, { value: last.__sort_value, id: last.id }) : null,
  };
}
