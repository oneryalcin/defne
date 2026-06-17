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
    const visualCues = db.prepare("SELECT COUNT(*) AS count FROM example_visual_cues WHERE status = 'approved'").get() as {
      count: number;
    };

    expect(migrations.count).toBe(20);
    expect(learners.count).toBe(1);
    expect(words.count).toBeGreaterThanOrEqual(50);
    expect(states.count).toBe(words.count);
    expect(examples.count).toBeGreaterThanOrEqual(words.count * 3);
    expect(visualCues.count).toBeGreaterThanOrEqual(words.count * 3);

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
    const spellingStateTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'spelling_learner_state'")
      .get();
    expect(spellingStateTable).toBeTruthy();
    const spellingItemColumns = db.prepare("PRAGMA table_info(spelling_items)").all() as Array<{ name: string }>;
    expect(spellingItemColumns.some((column) => column.name === "content_version")).toBe(true);
    const spellingStateColumns = db.prepare("PRAGMA table_info(spelling_learner_state)").all() as Array<{ name: string }>;
    expect(spellingStateColumns.some((column) => column.name === "recovery_debt")).toBe(true);
    expect(spellingStateColumns.some((column) => column.name === "last_clean_retrieval_at")).toBe(true);

    const wordColumns = db.prepare("PRAGMA table_info(words)").all() as Array<{ name: string }>;
    expect(wordColumns.some((column) => column.name === "content_version")).toBe(true);

    const profileColumns = db.prepare("PRAGMA table_info(learner_profiles)").all() as Array<{ name: string }>;
    expect(profileColumns.some((column) => column.name === "visual_cues_enabled")).toBe(true);
    expect(profileColumns.some((column) => column.name === "visual_cue_generation_enabled")).toBe(true);
    expect(profileColumns.some((column) => column.name === "visual_cues_on_learn_cards")).toBe(true);
    expect(profileColumns.some((column) => column.name === "visual_cues_on_meaning_questions")).toBe(true);
    expect(profileColumns.some((column) => column.name === "visual_cues_on_context_questions")).toBe(true);
    expect(profileColumns.some((column) => column.name === "next_round_new_count")).toBe(true);
    expect(profileColumns.some((column) => column.name === "next_round_recovery_count")).toBe(true);
    expect(profileColumns.some((column) => column.name === "next_round_review_count")).toBe(true);
    expect(profileColumns.some((column) => column.name === "next_round_stable_count")).toBe(true);
    const profile = db
      .prepare(
        `SELECT visual_cues_enabled, visual_cue_generation_enabled, visual_cues_on_learn_cards,
                visual_cues_on_meaning_questions, visual_cues_on_context_questions,
                next_round_new_count, next_round_recovery_count,
                next_round_review_count, next_round_stable_count
         FROM learner_profiles
         LIMIT 1`
      )
      .get() as {
      visual_cues_enabled: number;
      visual_cue_generation_enabled: number;
      visual_cues_on_learn_cards: number;
      visual_cues_on_meaning_questions: number;
      visual_cues_on_context_questions: number;
      next_round_new_count: number;
      next_round_recovery_count: number;
      next_round_review_count: number;
      next_round_stable_count: number;
    };
    expect(profile).toMatchObject({
      visual_cues_enabled: 1,
      visual_cue_generation_enabled: 0,
      visual_cues_on_learn_cards: 1,
      visual_cues_on_meaning_questions: 0,
      visual_cues_on_context_questions: 0,
      next_round_new_count: 6,
      next_round_recovery_count: 3,
      next_round_review_count: 3,
      next_round_stable_count: 0
    });

    const accessCode = db
      .prepare("SELECT learner_id FROM learner_access_codes WHERE access_code = 'arina'")
      .get() as { learner_id: string } | undefined;
    const vocabularyAssignments = db
      .prepare("SELECT COUNT(*) AS count FROM learner_vocabulary_words WHERE learner_id = 'learner_defne' AND status = 'active'")
      .get() as { count: number };
    const vocabularyAssignmentColumns = db.prepare("PRAGMA table_info(learner_vocabulary_words)").all() as Array<{ name: string }>;
    const spellingAssignmentColumns = db.prepare("PRAGMA table_info(learner_spelling_items)").all() as Array<{ name: string }>;
    expect(accessCode?.learner_id).toBe("learner_defne");
    expect(vocabularyAssignments.count).toBe(words.count);
    expect(vocabularyAssignmentColumns.some((column) => column.name === "priority_mode")).toBe(true);
    expect(vocabularyAssignmentColumns.some((column) => column.name === "priority_consumed_at")).toBe(true);
    expect(spellingAssignmentColumns.some((column) => column.name === "priority_mode")).toBe(true);
    expect(spellingAssignmentColumns.some((column) => column.name === "priority_consumed_at")).toBe(true);

    const exampleCueTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'example_visual_cues'").get();
    expect(exampleCueTable).toBeTruthy();
    const generatedImagesTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'generated_images'").get();
    expect(generatedImagesTable).toBeFalsy();

    const spellingItems = db.prepare("SELECT COUNT(*) AS count FROM spelling_items WHERE status = 'active'").get() as {
      count: number;
    };
    const spellingPrompts = db.prepare("SELECT COUNT(*) AS count FROM spelling_prompts WHERE status = 'approved'").get() as {
      count: number;
    };
    const spellingColumns = db.prepare("PRAGMA table_info(spelling_items)").all() as Array<{ name: string }>;
    const spellingSessionColumns = db.prepare("PRAGMA table_info(spelling_sessions)").all() as Array<{ name: string }>;
    expect(spellingItems.count).toBeGreaterThanOrEqual(8);
    expect(spellingPrompts.count).toBeGreaterThanOrEqual(spellingItems.count);
    expect(spellingColumns.some((column) => column.name === "teaching_note")).toBe(true);
    expect(spellingColumns.some((column) => column.name === "study_group")).toBe(true);
    expect(spellingColumns.some((column) => column.name === "usage_label")).toBe(true);
    expect(spellingColumns.some((column) => column.name === "common_misspelling")).toBe(true);
    expect(spellingSessionColumns.some((column) => column.name === "intro_completed_at")).toBe(true);
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

  it("registers committed example cue assets as approved visual cues", () => {
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON;");

    runMigrations(db);
    seedInitialData(db);

    const cue = db
      .prepare(
        `SELECT c.image_path, c.status
         FROM example_visual_cues c
         JOIN word_examples e ON e.id = c.example_id
         JOIN words w ON w.id = e.word_id
         WHERE w.normalized_word = 'conceal'
         ORDER BY c.example_id ASC
         LIMIT 1`
      )
      .get() as { image_path: string; status: string } | undefined;

    expect(cue).toBeTruthy();
    expect(cue?.status).toBe("approved");
    expect(cue?.image_path).toMatch(/^public\/assets\/example-cues\/word_conceal\/example_word_conceal_/);
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
