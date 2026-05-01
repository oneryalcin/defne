import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

let database: DatabaseSync | null = null;

export function getDatabasePath(): string {
  return process.env.DEFNE_DB_PATH ?? path.join(process.cwd(), "data", "dev.sqlite");
}

export function openDatabase(): DatabaseSync {
  if (database) return database;

  const dbPath = getDatabasePath();
  mkdirSync(path.dirname(dbPath), { recursive: true });
  database = new DatabaseSync(dbPath);
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA journal_mode = WAL;");
  return database;
}

export function closeDatabaseForTests(): void {
  database?.close();
  database = null;
}
