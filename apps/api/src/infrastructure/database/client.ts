import { Kysely, PostgresDialect } from "kysely";
import { Pool, types } from "pg";
import { env } from "../config/env.js";
import type { Database } from "./types.js";

types.setTypeParser(1700, parseFloat); // NUMERIC OID -> number

const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});
