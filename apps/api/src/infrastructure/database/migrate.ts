/**
 * Migration discipline: once a migration has run anywhere (including just
 * your own machine), never edit its file — Kysely only tracks migrations by
 * name in `kysely_migration`, not by content hash, so an edited-in-place
 * migration silently diverges between environments that already applied the
 * old version and ones that apply the edited version fresh. If a migration
 * needs a correction, add a new migration file instead of changing an old one.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { FileMigrationProvider, Migrator } from "kysely";
import { db } from "./client.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationFolder = path.join(currentDir, "../../../../../infrastructure/database/migrations");

const migrator = new Migrator({
  db,
  provider: new FileMigrationProvider({ fs, path, migrationFolder }),
});

const direction = process.argv[2] === "down" ? "down" : "up";
const { error, results } =
  direction === "down" ? await migrator.migrateDown() : await migrator.migrateToLatest();

for (const result of results ?? []) {
  if (result.status === "Success") {
    console.log(
      `migration "${result.migrationName}" ${direction === "down" ? "reverted" : "applied"}`,
    );
  } else if (result.status === "Error") {
    console.error(`migration "${result.migrationName}" failed`);
  }
}

if (error) {
  console.error(error);
  process.exit(1);
}

await db.destroy();
