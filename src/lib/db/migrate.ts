import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

interface MigrationFile {
  version: number;
  name: string;
  filename: string;
  sql: string;
}

export function runMigrations(db: DatabaseSync): void {
  const migrations = readMigrations();
  const applied = appliedMigrationVersions(db);

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;

    try {
      db.exec("BEGIN;");
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        migration.version,
        migration.name,
        new Date().toISOString()
      );
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  }
}

function appliedMigrationVersions(db: DatabaseSync): Set<number> {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get() as { name: string } | undefined;
  if (!table) return new Set();

  const rows = db.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: number }>;
  return new Set(rows.map((row) => row.version));
}

function readMigrations(): MigrationFile[] {
  const migrationDir = path.join(process.cwd(), "db", "migrations");
  return readdirSync(migrationDir)
    .filter((filename) => /^\d+_.+\.sql$/.test(filename))
    .sort()
    .map((filename) => {
      const [versionText, ...nameParts] = filename.replace(/\.sql$/, "").split("_");
      return {
        version: Number(versionText),
        name: nameParts.join("_"),
        filename,
        sql: readFileSync(path.join(migrationDir, filename), "utf8")
      };
    });
}
