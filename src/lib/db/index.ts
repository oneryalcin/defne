import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "./client";
import { runMigrations } from "./migrate";
import { seedInitialData } from "./seed";

let initialized = false;

export function getDb(): DatabaseSync {
  const db = openDatabase();
  if (!initialized) {
    runMigrations(db);
    seedInitialData(db);
    initialized = true;
  }
  return db;
}
