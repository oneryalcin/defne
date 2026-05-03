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
    const examples = db.prepare("SELECT COUNT(*) AS count FROM word_examples WHERE status = 'approved'").get() as {
      count: number;
    };

    expect(migrations.count).toBe(8);
    expect(learners.count).toBe(1);
    expect(words.count).toBeGreaterThanOrEqual(50);
    expect(states.count).toBe(words.count);
    expect(examples.count).toBeGreaterThanOrEqual(words.count * 3);

    const roundsTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'practice_rounds'").get();
    const roundIdColumn = db.prepare("PRAGMA table_info(practice_attempts)").all() as Array<{ name: string }>;
    expect(roundsTable).toBeTruthy();
    expect(roundIdColumn.some((column) => column.name === "round_id")).toBe(true);
    expect(roundIdColumn.some((column) => column.name === "first_attempt_correct")).toBe(true);

    const stateColumns = db.prepare("PRAGMA table_info(learner_word_state)").all() as Array<{ name: string }>;
    expect(stateColumns.some((column) => column.name === "near_review")).toBe(true);
    expect(stateColumns.some((column) => column.name === "recovery_debt")).toBe(true);
    expect(stateColumns.some((column) => column.name === "last_clean_retrieval_at")).toBe(true);
    expect(stateColumns.some((column) => column.name === "meaning_mastery")).toBe(false);
    expect(stateColumns.some((column) => column.name === "usage_mastery")).toBe(false);
    expect(stateColumns.some((column) => column.name === "spelling_mastery")).toBe(false);

    const spellingNotesTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'spelling_notes'").get();
    expect(spellingNotesTable).toBeFalsy();

    const wordColumns = db.prepare("PRAGMA table_info(words)").all() as Array<{ name: string }>;
    expect(wordColumns.some((column) => column.name === "content_version")).toBe(true);

    const profileColumns = db.prepare("PRAGMA table_info(learner_profiles)").all() as Array<{ name: string }>;
    expect(profileColumns.some((column) => column.name === "visual_cues_enabled")).toBe(true);
    expect(profileColumns.some((column) => column.name === "visual_cues_on_learn_cards")).toBe(true);
    expect(profileColumns.some((column) => column.name === "visual_cues_on_meaning_questions")).toBe(true);
    expect(profileColumns.some((column) => column.name === "visual_cues_on_context_questions")).toBe(true);
    const profile = db
      .prepare(
        `SELECT visual_cues_enabled, visual_cues_on_learn_cards,
                visual_cues_on_meaning_questions, visual_cues_on_context_questions
         FROM learner_profiles
         LIMIT 1`
      )
      .get() as {
      visual_cues_enabled: number;
      visual_cues_on_learn_cards: number;
      visual_cues_on_meaning_questions: number;
      visual_cues_on_context_questions: number;
    };
    expect(profile).toMatchObject({
      visual_cues_enabled: 1,
      visual_cues_on_learn_cards: 1,
      visual_cues_on_meaning_questions: 0,
      visual_cues_on_context_questions: 0
    });

    const exampleCueTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'example_visual_cues'").get();
    expect(exampleCueTable).toBeTruthy();
    const generatedImagesTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'generated_images'").get();
    expect(generatedImagesTable).toBeFalsy();
  });

  it("keeps generated visual cues when seed examples are reseeded with the same stable ids", () => {
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");

    runMigrations(db);
    seedInitialData(db);

    const example = db
      .prepare(
        `SELECT e.id AS example_id, e.word_id
         FROM word_examples e
         JOIN words w ON w.id = e.word_id
         WHERE w.normalized_word = 'parched'
         ORDER BY e.id ASC
         LIMIT 1`
      )
      .get() as { example_id: string; word_id: string };
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO example_visual_cues
        (id, example_id, word_id, provider, model, prompt_version, prompt, image_path, status, created_at, updated_at)
       VALUES ('cue_seed_test', ?, ?, 'gemini', 'test', 'test', 'prompt', 'public/assets/example-cues/test.jpg', 'approved', ?, ?)`
    ).run(example.example_id, example.word_id, now, now);

    seedInitialData(db);

    const cue = db.prepare("SELECT status FROM example_visual_cues WHERE id = 'cue_seed_test'").get() as
      | { status: string }
      | undefined;
    expect(cue?.status).toBe("approved");
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
