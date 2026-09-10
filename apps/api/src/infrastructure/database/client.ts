import { Kysely, PostgresDialect } from "kysely";
import { Pool, types } from "pg";
import { env } from "../config/env.js";
import type { Database } from "./types.js";

types.setTypeParser(1700, parseFloat); // NUMERIC OID -> number
// DATE OID -> raw "YYYY-MM-DD" string. pg's default parser builds a JS Date
// from local server time, which silently shifts the calendar date depending
// on server timezone (confirmed: "2026-03-01" came back as
// 2026-02-28T18:30:00.000Z on this machine's IST timezone). Dates have no
// time component or timezone — never let one leak in by round-tripping
// through Date.
types.setTypeParser(1082, (value) => value);

const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});
