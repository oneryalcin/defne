import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { runMigrations } from "./migrate";
import { seedInitialData } from "./seed";

let db: DatabaseSync | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

describe("SQLite setup", () => {
  it("runs migrations and seeds idempotently", () => {
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");

    runMigrations(db);
    seedInitialData(db);
    runMigrations(db);
    seedInitialData(db);

    const migrations = db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get() as { count: number };
    const learners = db.prepare("SELECT COUNT(*) AS count FROM learners").get() as { count: number };
    const words = db.prepare("SELECT COUNT(*) AS count FROM words").get() as { count: number };
    const states = db.prepare("SELECT COUNT(*) AS count FROM learner_word_state").get() as { count: number };

    expect(migrations.count).toBe(4);
    expect(learners.count).toBe(1);
    expect(words.count).toBeGreaterThanOrEqual(50);
    expect(states.count).toBe(words.count);

    const roundsTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'practice_rounds'").get();
    const roundIdColumn = db.prepare("PRAGMA table_info(practice_attempts)").all() as Array<{ name: string }>;
    expect(roundsTable).toBeTruthy();
    expect(roundIdColumn.some((column) => column.name === "round_id")).toBe(true);
    expect(roundIdColumn.some((column) => column.name === "first_attempt_correct")).toBe(true);

    const stateColumns = db.prepare("PRAGMA table_info(learner_word_state)").all() as Array<{ name: string }>;
    expect(stateColumns.some((column) => column.name === "near_review")).toBe(true);
    expect(stateColumns.some((column) => column.name === "recovery_debt")).toBe(true);
    expect(stateColumns.some((column) => column.name === "last_clean_retrieval_at")).toBe(true);

    const wordColumns = db.prepare("PRAGMA table_info(words)").all() as Array<{ name: string }>;
    expect(wordColumns.some((column) => column.name === "content_version")).toBe(true);
  });

  it("enforces foreign keys", () => {
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");
    runMigrations(db);

    expect(() => {
      db?.prepare(
        `INSERT INTO learner_word_state
          (id, learner_id, word_id, created_at, updated_at)
         VALUES ('state_bad', 'missing', 'also_missing', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z')`
      ).run();
    }).toThrow();
  });
});
