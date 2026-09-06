import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { env } from "../config/env.js";
import type { Database } from "./types.js";

const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});
