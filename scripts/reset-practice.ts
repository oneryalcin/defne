// Wipes practice history from the local SQLite DB without dropping
// words/definitions/examples. Useful when the verify scripts have
// polluted the deck with synthetic attempts.
//
// Run with: tsx scripts/reset-practice.ts

import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const dbPath = process.env.DEFNE_DB_PATH ?? path.join(process.cwd(), "data", "dev.sqlite");
const db = new DatabaseSync(dbPath);

const tables = [
  "practice_attempts",
  "practice_rounds",
  "practice_sessions",
  "learner_word_state",
];

for (const table of tables) {
  const before = (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
    n: number;
  }).n;
  db.prepare(`DELETE FROM ${table}`).run();
  const after = (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
    n: number;
  }).n;
  console.log(`${table}: ${before} → ${after}`);
}

console.log("Reset complete. Words and definitions are untouched.");
